import "server-only";
import type { User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { scoringInput } from "./scoring-input.server";
import { materialContext } from "./review-service.server";

const id = z.string().min(1).max(100);
const uuid = z.uuid();
export async function verificationAction(type: string, body: Record<string, unknown>, user: User) {
  if (user.role !== "STAFF") throw new AppError("Действие доступно комиссии.", 403);
  const applicationId = id.parse(body.applicationId);
  await assertApplication(applicationId, user);
  if (type === "verification.status") {
    return db.verificationRequest.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }
  if (type === "verification.draft") {
    const value = z.object({
      sourceId: id,
      sourceVersion: id,
      quote: z.string().trim().min(5).max(1000),
      claim: z.string().trim().min(5).max(1000),
      kind: z.enum(["EXPLAIN", "CONFIRM"]),
      question: z.string().trim().min(10).max(1000),
      requestKey: uuid,
    }).parse(body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
      const existing = await tx.verificationRequest.findUnique({ where: { requestKey: value.requestKey } });
      if (existing) {
        if (existing.applicationId !== applicationId || existing.authorId !== user.id)
          throw new AppError("Ключ запроса уже использован.", 409);
        return existing;
      }
      const input = await scoringInput(tx, applicationId);
      const source = input.sources.find((entry) => entry.id === value.sourceId);
      if (!source || source.version !== value.sourceVersion || !source.text.includes(value.quote) || !source.text.includes(value.claim))
        throw new AppError("Фрагмент изменился. Откройте актуальный источник.", 409);
      return tx.verificationRequest.create({ data: { ...value, applicationId, authorId: user.id } });
    });
  }
  if (type === "verification.publish") {
    const requestId = id.parse(body.requestId);
    if (body.confirm !== true) throw new AppError("Подтвердите публикацию вопроса.");
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
      const request = await tx.verificationRequest.findFirst({ where: { id: requestId, applicationId } });
      if (!request) throw new AppError("Вопрос недоступен.", 404);
      if (request.status !== "DRAFT") return request;
      const input = await scoringInput(tx, applicationId);
      const source = input.sources.find((entry) => entry.id === request.sourceId);
      if (!source || source.version !== request.sourceVersion || !source.text.includes(request.quote))
        throw new AppError("Материал изменился. Подготовьте вопрос по текущему фрагменту.", 409);
      const message = await tx.message.create({
        data: { applicationId, authorId: user.id, kind: "QUESTION", body: request.question },
      });
      return tx.verificationRequest.update({
        where: { id: request.id },
        data: { status: "PUBLISHED", questionMessageId: message.id, publishedAt: new Date() },
      });
    });
  }
  throw new AppError("Действие проверки не найдено.", 404);
}

export async function reviewCaseAction(type: string, body: Record<string, unknown>, user: User) {
  if (user.role !== "STAFF") throw new AppError("Повторное рассмотрение доступно комиссии.", 403);
  const applicationId = id.parse(body.applicationId);
  await assertApplication(applicationId, user);
  if (type === "reviewCase.status")
    return db.reReviewCase.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" }, take: 30 });
  if (type === "reviewCase.open") {
    const value = z.object({
      requestKey: uuid,
      kind: z.enum(["ASSESSMENT_DISAGREEMENT", "NEW_CLARIFICATION", "TWIN_QUESTION", "UNAVAILABLE_EVIDENCE", "CORRECTED_FACT", "CONTROL_SAMPLE"]),
      reason: z.string().trim().min(15).max(2000),
      sourceIds: z.array(id).max(12),
      assigneeId: id.optional(),
    }).parse(body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
      const existing = await tx.reReviewCase.findUnique({ where: { basisKey: value.requestKey } });
      if (existing) {
        if (existing.applicationId !== applicationId) throw new AppError("Ключ случая уже использован.", 409);
        return existing;
      }
      const sources = await tx.source.findMany({ where: { applicationId, id: { in: value.sourceIds } }, select: { id: true } });
      if (sources.length !== new Set(value.sourceIds).size) throw new AppError("Источник не относится к кандидату.");
      if (value.assigneeId) {
        const assignee = await tx.user.findUnique({ where: { id: value.assigneeId } });
        if (assignee?.role !== "STAFF") throw new AppError("Проверяющий недоступен.");
        if (value.kind === "ASSESSMENT_DISAGREEMENT") {
          const authors = await tx.assessment.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" }, take: 2, select: { authorId: true } });
          if (authors[0]?.authorId === value.assigneeId)
            throw new AppError("Автор спорной оценки не может быть единственным повторным проверяющим.");
        }
      }
      const material = await materialContext(tx, applicationId);
      return tx.reReviewCase.create({
        data: {
          applicationId,
          basisKey: value.requestKey,
          kind: value.kind,
          reason: value.reason,
          sourceIds: [...new Set(value.sourceIds)],
          materialVersion: material.version,
          openedBy: user.id,
          assigneeId: value.assigneeId,
        },
      });
    });
  }
  if (type === "reviewCase.close") {
    const caseId = id.parse(body.caseId);
    const updatedAt = z.iso.datetime().parse(body.updatedAt);
    const resolution = z.string().trim().min(15).max(3000).parse(body.resolution);
    const changed = await db.reReviewCase.updateMany({
      where: { id: caseId, applicationId, status: "OPEN", updatedAt: new Date(updatedAt) },
      data: { status: "CLOSED", resolution, closedAt: new Date(), assigneeId: user.id },
    });
    if (!changed.count) throw new AppError("Случай уже изменился. Обновите страницу.", 409);
    return { closed: true };
  }
  throw new AppError("Действие повторного рассмотрения не найдено.", 404);
}

export function verificationReplyCaseKey(requestId: string, messageId: string) {
  return `verification:${requestId}:reply:${messageId}`;
}
