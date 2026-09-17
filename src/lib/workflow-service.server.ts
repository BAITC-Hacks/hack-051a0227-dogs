import "server-only";
import { Prisma, type User, type WorkflowSession } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./security";
import {
  controlPackage,
  caseDefinition,
  qualityCases,
  qualityCaseVersion,
  type ControlPackage,
} from "./quality-cases.server";
import { isolatedAssessmentEnvironment } from "./scoring-provider.server";
import { digest, scoringCriteria } from "./scoring-input.server";
import { validateScoringResult } from "./scoring-contract";
import {
  annotationSchema,
  emptyWorkflowWork,
  workflowWorkSchema,
  workflowTime,
  type WorkflowView,
  type WorkflowRow,
  type WorkflowAnnotation,
} from "./workflow-contract";
const json = (x: unknown) =>
  JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;
function access(user: User) {
  if (user.role !== "STAFF")
    throw new AppError("Проверка доступна сотруднику комиссии.", 403);
  if (!isolatedAssessmentEnvironment())
    throw new AppError(
      "Этот набор контрольных материалов недоступен в текущем окружении.",
      403,
    );
}
export async function workflowList(user: User) {
  access(user);
  const sessions = await db.workflowSession.findMany({
    where: { ownerId: user.id },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return {
    cases: qualityCases.map(({ key, title }) => ({ key, title })),
    sessions: sessions.map((s) => ({
      id: s.id,
      title: caseDefinition(s.caseKey).title,
      mode: s.mode,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      technical: s.technical,
    })),
  };
}
function view(row: WorkflowSession): WorkflowView {
  const pack = row.package as unknown as ControlPackage;
  // Verify snapshot binding on every read. Never let a corrupted result reach the screen.
  if (digest(pack.input) !== row.materialVersion)
    throw new AppError("Версия материалов не прошла проверку.", 409);
  let profile = null,
    profileIssue = null;
  if (row.mode === "PROFILE") {
    profileIssue = pack.issue;
    try {
      if (pack.result) profile = validateScoringResult(pack.result, pack.input);
    } catch {
      profileIssue =
        "Основания профиля не прошли проверку. Используйте исходные материалы.";
    }
  }
  return {
    id: row.id,
    revision: row.revision,
    caseKey: row.caseKey,
    title: pack.title,
    caseVersion: row.caseVersion,
    mode: row.mode as WorkflowView["mode"],
    participant: row.participant,
    technical: row.technical,
    order: row.order,
    familiar: row.familiar,
    familiarityNote: row.familiarityNote,
    status: row.status as WorkflowView["status"],
    materialVersion: row.materialVersion,
    profileVersion: row.mode === "PROFILE" ? row.profileVersion : null,
    input: pack.input,
    profile,
    profileIssue,
    work: workflowWorkSchema.parse(row.work),
    savedAt: row.savedAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    pausedMs: row.pausedMs,
    completedAt: row.completedAt?.toISOString() ?? null,
    annotations: row.annotations as unknown as WorkflowAnnotation[],
  };
}
export async function workflowView(id: string, user: User) {
  access(user);
  const row = await db.workflowSession.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!row) throw new AppError("Сессия недоступна.", 404);
  return view(row);
}
export async function workflowRows(user: User): Promise<WorkflowRow[]> {
  access(user);
  const rows = await db.workflowSession.findMany({
    orderBy: { startedAt: "desc" },
  });
  return rows.map((r) => {
    const {
      input: _input,
      profile: _profile,
      profileIssue: _issue,
      ...item
    } = view(r);
    void _input;
    void _profile;
    void _issue;
    // Participant codes are enough for this protected report; emails are never exported.
    return { ...item, ...workflowTime(item) };
  });
}
export async function workflowAction(type: string, raw: unknown, user: User) {
  access(user);
  if (type === "workflow.start") {
    const b = z
      .object({
        caseKey: z.string(),
        mode: z.enum(["MATERIALS", "PROFILE"]),
        participant: z
          .string()
          .trim()
          .regex(/^[A-Za-zА-Яа-я0-9_-]{2,40}$/),
        technical: z.boolean(),
        familiar: z.boolean(),
        familiarityNote: z.string().trim().max(1000),
        requestKey: z.uuid(),
        damaged: z.boolean().optional(),
      })
      .parse(raw);
    if (b.damaged && (!b.technical || b.mode !== "PROFILE"))
      throw new AppError(
        "Повреждённое основание проверяется только в техническом проходе.",
      );
    const def = caseDefinition(b.caseKey);
    // Local control input and adapter, no access to production applications.
    const pack = await controlPackage(
      def.key,
      b.damaged,
      await scoringCriteria(db),
    );
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const prior = await tx.workflowSession.findUnique({
        where: { requestKey: b.requestKey },
      });
      if (prior) {
        if (prior.ownerId !== user.id)
          throw new AppError("Сессия недоступна.", 404);
        if (
          prior.caseKey !== b.caseKey ||
          prior.mode !== b.mode ||
          prior.participant !== b.participant ||
          prior.technical !== b.technical
        )
          throw new AppError(
            "Ключ запуска уже использован для другой сессии.",
            409,
          );
        return view(prior);
      }
      const seen = await tx.workflowSession.findMany({
        where: { participant: b.participant, technical: b.technical },
      });
      const familiar = b.familiar || seen.some((s) => s.family === def.family);
      const stored =
        b.mode === "MATERIALS" ? { ...pack, result: null, issue: null } : pack;
      return view(
        await tx.workflowSession.create({
          data: {
            ownerId: user.id,
            participant: b.participant,
            technical: b.technical,
            requestKey: b.requestKey,
            caseKey: def.key,
            family: def.family,
            caseVersion: qualityCaseVersion,
            mode: b.mode,
            materialVersion: pack.inputHash,
            profileVersion: b.mode === "PROFILE" ? pack.profileVersion : null,
            package: json(stored),
            order: seen.length + 1,
            familiar,
            familiarityNote:
              b.familiarityNote ||
              (familiar
                ? "Есть предыдущее знакомство с этим семейством материалов."
                : "Не отмечено"),
            work: json(emptyWorkflowWork),
            events: json([{ action: "START", at: new Date().toISOString() }]),
            annotations: [],
          },
        }),
      );
    });
  }
  const b = z
    .object({
      id: z.string().min(1),
      revision: z.number().int().positive().optional(),
      work: workflowWorkSchema.optional(),
      annotation: annotationSchema.optional(),
    })
    .parse(raw);
  if (type === "workflow.load") return workflowView(b.id, user);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkflowSession" WHERE id=${b.id} FOR UPDATE`;
    const row = await tx.workflowSession.findFirst({
      where: { id: b.id, ownerId: user.id },
    });
    if (!row) throw new AppError("Сессия недоступна.", 404);
    if (row.revision !== b.revision)
      throw new AppError(
        "Сессия изменена в другой вкладке. Ваш текст остаётся на странице; откройте сохранённую версию в отдельной вкладке.",
        409,
      );
    const current = view(row),
      now = new Date(),
      data: Prisma.WorkflowSessionUpdateInput = {
        revision: { increment: 1 },
        savedAt: now,
      };
    if (type === "workflow.annotate") {
      if (row.status !== "COMPLETED" || !b.annotation)
        throw new AppError("Разметка доступна после завершения.");
      data.annotations = json([
        ...current.annotations,
        {
          ...b.annotation,
          authorId: user.id,
          at: now.toISOString(),
          version: "human-workflow-annotation-v1",
        },
      ]);
    } else {
      if (row.status === "COMPLETED")
        throw new AppError(
          "Завершённый ответ сохранён и не перезаписывается.",
          409,
        );
      if (!b.work) throw new AppError("Нужен рабочий ответ.");
      if (
        b.work.sourceIds.some(
          (id) => !current.input.sources.some((s) => s.id === id && !!s.text),
        )
      )
        throw new AppError("Укажите доступный источник с содержимым.");
      if (row.status === "PAUSED" && digest(b.work) !== digest(row.work))
        throw new AppError(
          "Сначала продолжите сессию, затем изменяйте рабочий ответ.",
          409,
        );
      data.work = json(b.work);
      if (type === "workflow.pause") {
        if (row.status !== "ACTIVE")
          throw new AppError("Сессия уже на паузе.", 409);
        data.status = "PAUSED";
        data.pausedAt = now;
      } else if (type === "workflow.resume") {
        if (!row.pausedAt) throw new AppError("Сессия уже продолжается.", 409);
        data.status = "ACTIVE";
        data.pausedMs = row.pausedMs + now.getTime() - row.pausedAt.getTime();
        data.pausedAt = null;
      } else if (type === "workflow.complete") {
        if (row.status !== "ACTIVE")
          throw new AppError("Сначала продолжите сессию.", 409);
        if (
          b.work.evidence.length < 15 ||
          b.work.questions.length < 5 ||
          !b.work.nextAction ||
          b.work.reason.length < 15
        )
          throw new AppError(
            "Запишите основания (или их отсутствие), вопросы и пояснение следующего шага.",
          );
        data.status = "COMPLETED";
        data.completedAt = now;
      } else if (type !== "workflow.save")
        throw new AppError("Неизвестное действие.");
    }
    data.events = json([
      ...(row.events as { action: string; at: string }[]),
      { action: type, at: now.toISOString() },
    ]);
    return view(
      await tx.workflowSession.update({ where: { id: row.id }, data }),
    );
  });
}
