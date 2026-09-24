import "server-only";
import { isDeepStrictEqual } from "node:util";
import { applyMission } from "./missions.server";
import { initialMission, missionRuleVersion, readMission } from "./missions";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError, guestActor, rateLimit } from "./security";
import { programFor } from "./catalog";
import { projectSchema, initialState } from "./projects";
import { equipmentInitial, equipmentSchema, equipmentHints } from "./equipment";
import {
  projectMilestones,
  journeyRuleVersion,
  workCompleted,
  workFeedback,
  versionCompleted,
} from "./journey";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(100);
export async function journeyAction(type: string, b: Record<string, unknown>) {
  const u = await guestActor();
  if (u.role === "STAFF")
    throw new AppError("Для личных работ войдите как кандидат.", 403);
  await rateLimit("project:" + u.id, 120);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`;
    if (type === "project.progress") {
      const attempts = await tx.projectAttempt.findMany({
        where: { userId: u.id },
        include: { versions: { orderBy: { revision: "desc" } } },
        orderBy: { updatedAt: "desc" },
      });
      return { attempts, milestones: projectMilestones(attempts) };
    }
    if (type === "project.context") {
      const parent = await tx.attemptVersion.findFirst({
        where: {
          id: id.parse(b.versionId),
          attempt: {
            userId: u.id,
            slug: "digital-products",
            context: "WORKSHOP",
          },
        },
        include: { attempt: true },
      });
      if (!parent) throw new AppError("Исходная работа недоступна.", 404);
      if (!versionCompleted(parent.attempt, parent))
        throw new AppError(
          "Сначала сохрани маршрут, выполняющий условия мастерской.",
        );
      const context = await tx.projectAttempt.upsert({
        where: {
          parentVersionId_context: {
            parentVersionId: parent.id,
            context: "EQUIPMENT",
          },
        },
        update: {},
        create: {
          userId: u.id,
          slug: parent.attempt.slug,
          context: "EQUIPMENT",
          configVersion: journeyRuleVersion,
          parentVersionId: parent.id,
          state: json(equipmentInitial),
          versions: {
            create: {
              revision: 0,
              state: json(equipmentInitial),
              feedback: json(
                workFeedback(
                  parent.attempt.slug,
                  equipmentInitial,
                  "EQUIPMENT",
                ),
              ),
              ruleVersion: journeyRuleVersion,
            },
          },
        },
      });
      return { id: context.id, slug: context.slug };
    }
    let attempt = b.id
      ? await tx.projectAttempt.findFirst({
          where: { id: id.parse(b.id), userId: u.id },
          include: { versions: { orderBy: { revision: "desc" } } },
        })
      : null;
    if (b.id && !attempt) throw new AppError("Работа недоступна.", 404);
    if (type === "project.hint") {
      const hint = z
        .enum(["availability", "occupied", "receipt"])
        .parse(b.hint);
      if (!attempt || attempt.context !== "EQUIPMENT")
        throw new AppError("Подсказка недоступна.", 404);
      const hintsUsed = [...new Set([...attempt.hintsUsed, hint])];
      await tx.projectAttempt.update({
        where: { id: attempt.id },
        data: { hintsUsed },
      });
      return { hintsUsed, hint: equipmentHints.find((h) => h.id === hint) };
    }
    if (type !== "project.save")
      throw new AppError("Действие не найдено.", 404);
    const slug = z.string().parse(b.slug);
    if (!programFor(slug)) throw new AppError("Задание не найдено.", 404);
    if (attempt && attempt.slug !== slug)
      throw new AppError("Задание не соответствует работе.");
    const context = attempt?.context ?? "WORKSHOP";
    if (!attempt && b.context && b.context !== "WORKSHOP")
      throw new AppError("Новую задачу открой из результата исходной работы.");
    let state: unknown =
      context === "EQUIPMENT"
        ? equipmentSchema.parse(b.state)
        : projectSchema.parse(b.state);
    const isMission = !!readMission(state);
    if (attempt && !!readMission(attempt.state) !== isMission)
      throw new AppError(
        "У сохранённой работы другая версия задания. Открой её исходные условия.",
        409,
      );
    const ruleVersion = isMission ? missionRuleVersion : journeyRuleVersion;
    const originalState = isMission
      ? { ...initialState, mission: initialMission(slug) }
      : initialState;
    // Retries are evaluated against their original revision, never against a newer state.
    const base =
      attempt?.versions.find((v) => v.revision === b.revision)?.state ??
      originalState;
    if (isMission)
      state = {
        ...initialState,
        mission: await applyMission(slug, state, base, b.missionCommand),
      };
    else if (b.missionCommand !== undefined)
      throw new AppError("Это действие недоступно для исходного задания.");
    const feedback = workFeedback(slug, state, context);
    const saveKey =
      b.requestKey === undefined
        ? undefined
        : z.string().uuid().parse(b.requestKey);
    if (!attempt && saveKey) {
      const existing = await tx.projectAttempt.findUnique({
        where: { startKey: saveKey },
        include: { versions: { orderBy: { revision: "desc" } } },
      });
      if (existing) {
        if (existing.userId !== u.id)
          throw new AppError("Запрос недоступен.", 404);
        const v = existing.versions.find((v) => v.saveKey === saveKey);
        if (
          !v ||
          existing.slug !== slug ||
          !isDeepStrictEqual(v.state, json(state))
        )
          throw new AppError(
            "Этот запрос уже сохранён с другим содержанием.",
            409,
          );
        attempt = existing;
      }
    }
    let savedId = attempt?.id;
    const repeated =
      saveKey && attempt?.versions.find((v) => v.saveKey === saveKey);
    if (repeated) {
      if (!isDeepStrictEqual(repeated.state, json(state)))
        throw new AppError(
          "Повтор запроса отличается от сохранённой версии.",
          409,
        );
      // Return the actual latest state; an old retry never rewrites newer work.
    } else if (attempt) {
      const rev = z.number().int().nonnegative().parse(b.revision);
      if (attempt.revision !== rev)
        throw new AppError(
          "Работа изменена в другой вкладке. Текст остаётся в форме. Открой сохранённые версии в новой вкладке и сверь изменения.",
          409,
        );
      const basedOn =
        b.basedOnRevision === undefined
          ? rev
          : z.number().int().nonnegative().parse(b.basedOnRevision);
      if (!attempt.versions.some((v) => v.revision === basedOn))
        throw new AppError("Исходная версия недоступна.", 404);
      await tx.projectAttempt.update({
        where: { id: attempt.id },
        data: { state: json(state), revision: rev + 1, interest: "UNDECIDED" },
      });
      await tx.attemptVersion.create({
        data: {
          attemptId: attempt.id,
          revision: rev + 1,
          state: json(state),
          feedback: json(feedback),
          ruleVersion,
          completed: workCompleted(slug, state, context),
          hintsUsed: attempt.hintsUsed,
          saveKey,
          basedOnRevision: basedOn,
        },
      });
    } else {
      const a = await tx.projectAttempt.create({
        data: {
          userId: u.id,
          slug,
          state: json(state),
          revision: 1,
          configVersion: ruleVersion,
          conditions: isMission
            ? "Учебная миссия, сценарий 2. Ответы виртуальной команды и учебная модель проверки сохранены в версии работы."
            : undefined,
          startKey: saveKey,
          versions: {
            create: [
              {
                revision: 0,
                state: json(originalState),
                feedback: json(workFeedback(slug, originalState)),
                ruleVersion,
              },
              {
                revision: 1,
                state: json(state),
                feedback: json(feedback),
                completed: workCompleted(slug, state),
                ruleVersion,
                saveKey,
                basedOnRevision: 0,
              },
            ],
          },
        },
      });
      savedId = a.id;
    }
    const saved = await tx.projectAttempt.findUniqueOrThrow({
      where: { id: savedId },
      include: { versions: { orderBy: { revision: "desc" } } },
    });
    const owned = await tx.projectAttempt.findMany({
      where: { userId: u.id },
      include: { versions: true },
    });
    return {
      id: saved.id,
      revision: saved.revision,
      state: saved.state,
      feedback: saved.versions[0].feedback,
      versions: saved.versions,
      milestones: projectMilestones(owned),
    };
  });
}
