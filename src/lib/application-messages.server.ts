import "server-only";
import type { Prisma, User } from "@prisma/client";
import { AppError } from "./security";
import { questionKinds } from "./message-state";
export async function saveApplicationMessage(
  tx: Prisma.TransactionClient,
  user: User,
  applicationId: string,
  body: string,
  replyToId: string | null = null,
) {
  await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
  const app = await tx.application.findUnique({ where: { id: applicationId } });
  if (!app?.submittedAt || (user.role !== "STAFF" && app.userId !== user.id))
    throw new AppError("Переписка недоступна.", 404);
  if (replyToId) {
    const q = await tx.message.findFirst({
      where: {
        id: replyToId,
        applicationId,
        kind: { in: questionKinds },
        author: { role: "STAFF" },
      },
    });
    if (!q || user.role !== "CANDIDATE")
      throw new AppError("Вопрос недоступен для ответа.", 404);
  }
  const message = await tx.message.create({
    data: {
      applicationId,
      authorId: user.id,
      body,
      replyToId,
      kind: user.role === "STAFF" ? "QUESTION" : "MESSAGE",
    },
  });
  if (user.role === "CANDIDATE") {
    const source = await tx.source.create({
      data: {
        applicationId,
        messageId: message.id,
        title: "Ответ в переписке",
        kind: "Уточнение кандидата",
        content: body,
      },
    });
    const consent = app.deskConsent as {
      granted?: boolean;
      purpose?: string;
      sourceIds?: string[];
      revision?: number;
    } | null;
    if (consent?.granted && consent.purpose === "INTAKE_FACTS_V1")
      await tx.application.update({
        where: { id: applicationId },
        data: {
          deskConsent: {
            ...consent,
            sourceIds: [...(consent.sourceIds ?? []), source.id].slice(-100),
            revision: (consent.revision ?? 0) + 1,
          },
        },
      });
    if (replyToId) {
      const request = await tx.verificationRequest.findUnique({
        where: { questionMessageId: replyToId },
      });
      if (request?.applicationId === applicationId && request.status !== "DRAFT") {
        await tx.verificationRequest.update({
          where: { id: request.id },
          data: { status: "ANSWERED", answerMessageId: message.id, answeredAt: new Date() },
        });
        const { materialContext } = await import("./review-service.server");
        const material = await materialContext(tx, applicationId);
        await tx.reReviewCase.upsert({
          where: { basisKey: `verification:${request.id}:reply:${message.id}` },
          update: {},
          create: {
            applicationId,
            basisKey: `verification:${request.id}:reply:${message.id}`,
            kind: "NEW_CLARIFICATION",
            reason: `Получен ответ на запрос по утверждению «${request.claim.slice(0, 180)}». Нужно сверить новое пояснение с прежним выводом.`,
            sourceIds: [request.sourceId, source.id],
            materialVersion: material.version,
            openedBy: user.id,
          },
        });
      }
    }
  }
  await tx.application.update({
    where: { id: applicationId },
    data: {
      updatedAt: new Date(),
      ...(user.role === "CANDIDATE" && app.intakeRules
        ? { preparationEvent: { increment: 1 }, preparationStatus: "PENDING" }
        : {}),
    },
  });
  return message;
}
