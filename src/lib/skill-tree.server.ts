import "server-only";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { accessFor } from "./access.server";
import { AppError, rateLimit } from "./security";
import { skillDomains, skillNode, skillNodes, skillVersion, type SkillDomainId, type SkillNode } from "./skill-tree-catalog";
import { roleIds, roles, type RoleProgress } from "./world/missions";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const responseSchema = z.object({ choice: z.string().max(80).optional(), followup: z.string().max(80).optional(), text: z.string().max(8000).optional(), order: z.array(z.string().max(80)).max(12).optional(), mediaId: z.string().max(100).optional() }).strict();
type ResponseValue = z.infer<typeof responseSchema>;
const countWords = (value: string) => value.trim().split(/\s+/u).filter(Boolean).length;

export function checkActivity(node: SkillNode, response: ResponseValue): { complete: boolean; message: string } {
  const choice = node.choices?.find((c) => c.id === response.choice);
  const followup = node.followup?.choices.find((c) => c.id === response.followup);
  if (["QUIZ", "READING", "VIDEO"].includes(node.type)) {
    if (!choice) throw new AppError("Выбери ответ.", 400);
    return { complete: !!choice.correct, message: choice.consequence };
  }
  if (["BRANCHING_SCENARIO", "DIALOGUE"].includes(node.type)) {
    if (!choice || !followup) throw new AppError("Пройди оба поворота ситуации.", 400);
    return { complete: true, message: `${choice.consequence} ${followup.consequence}` };
  }
  if (node.type === "SORTING") {
    if (!response.order || response.order.length !== node.items?.length || new Set(response.order).size !== node.items.length || response.order.some((id) => !node.items!.some((item) => item.id === id)))
      throw new AppError("Расставь все шаги по одному разу.", 400);
    const correct = response.order.every((id, i) => id === node.expectedOrder?.[i]);
    return { complete: correct, message: correct ? "Порядок помогает команде сверить результат." : "Попробуй сначала назвать цель, затем действие, потом момент проверки." };
  }
  if (node.type === "AUDIO_RESPONSE") {
    if (!response.mediaId) throw new AppError("Сначала сохрани запись.", 400);
    return { complete: true, message: "Запись сохранена в твоём личном дереве. Автоматическая оценка речи не выполнялась." };
  }
  if (countWords(response.text ?? "") < (node.minWords ?? 15))
    throw new AppError(`Запиши хотя бы ${node.minWords ?? 15} слов, чтобы сохранить мысль.`, 400);
  return { complete: true, message: "Твой ответ сохранён. Здесь важны выполнение и возможность вернуться к мысли, а не оценка личности." };
}

type DevelopmentProfile = { focus: SkillDomainId[]; basisVersion: string | null; priorities: Record<SkillDomainId, "high" | "medium" | "low" | "unknown"> };
export function mapDevelopmentProfile(input: { result?: unknown; resultVersion?: string; languageStatus?: string | null }): DevelopmentProfile {
  const priorities: DevelopmentProfile["priorities"] = { LEADERSHIP: "unknown", TEAMWORK: "unknown", COMMUNICATION: "unknown", ENGLISH: "unknown" };
  const source = input.result && typeof input.result === "object" ? input.result as { domains?: unknown } : null;
  const domains = Array.isArray(source?.domains) ? source.domains as { domain?: string; sufficiency?: string; gaps?: unknown }[] : [];
  const named: Partial<Record<SkillDomainId, string[]>> = {
    LEADERSHIP: ["Лидерские способности", "Purpose-driven leadership"],
    TEAMWORK: ["Командная работа"],
    COMMUNICATION: ["Понимание и применение сложных идей"],
  };
  for (const domain of ["LEADERSHIP", "TEAMWORK", "COMMUNICATION"] as const) {
    const related = domains.filter((d) => named[domain]?.includes(d.domain ?? ""));
    if (related.some((d) => d.sufficiency === "Частично" && Array.isArray(d.gaps) && d.gaps.length)) priorities[domain] = "high";
    else if (related.some((d) => d.sufficiency === "Достаточно")) priorities[domain] = "low";
    else if (related.length) priorities[domain] = "medium";
  }
  if (input.languageStatus === "COMPLETED" || input.languageStatus === "REVIEWED") priorities.ENGLISH = "low";
  else if (input.languageStatus && input.languageStatus !== "NOT_STARTED") priorities.ENGLISH = "medium";
  const rank = (p: DevelopmentProfile["priorities"][SkillDomainId]) => ({ high: 0, medium: 1, unknown: 2, low: 3 })[p];
  return { focus: skillDomains.map((d) => d.id).sort((a, b) => rank(priorities[a]) - rank(priorities[b])), basisVersion: input.resultVersion ?? null, priorities };
}

export async function skillView(user: User | null) {
  if (!user || await accessFor(user) !== "FULL") throw new AppError("Дерево навыков откроется после подачи заявки.", 403);
  const [completions, attempts, entries, application, worldSave] = await Promise.all([
    db.learningCompletion.findMany({ where: { userId: user.id }, orderBy: { completedAt: "desc" } }),
    db.learningAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 160 }),
    db.uPointEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.application.findUnique({ where: { userId: user.id }, select: { id: true, language: { select: { status: true } }, scoringRuns: { where: { context: "OFFICIAL", status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 1, select: { id: true, result: true } } } }),
    db.worldSave.findUnique({ where: { userId: user.id }, select: { state: true, updatedAt: true } }),
  ]);
  const done = new Set(completions.map((c) => c.nodeId));
  const worldFlags = (worldSave?.state as { flags?: { completed?: boolean } } | null)?.flags;
  if (worldFlags?.completed) done.add("world-before-opening");
  const worldRoles = (worldSave?.state as {roles?:Record<string,RoleProgress>}|null)?.roles ?? {};
  for(const roleId of roleIds) if(worldRoles[roleId]?.completedAt) done.add(roles[roleId].skillNode);
  const profile = mapDevelopmentProfile({ result: application?.scoringRuns[0]?.result, resultVersion: application?.scoringRuns[0]?.id, languageStatus: application?.language?.status });
  const nodes = skillNodes.map((node) => {
    const latest = attempts.find((a) => a.nodeId === node.id);
    const completed = done.has(node.id);
    const unlocked = node.prerequisites.every((id) => done.has(id));
    const worldRole = roleIds.find((id) => roles[id].skillNode === node.id);
    const worldCompletedAt = worldRole ? worldRoles[worldRole]?.completedAt ?? null : node.id === "world-before-opening" && worldFlags?.completed ? worldSave?.updatedAt.toISOString() ?? null : null;
    return { ...node, state: completed ? "completed" as const : unlocked ? latest?.status === "DRAFT" ? "in_progress" as const : "available" as const : "locked" as const,
      latest: latest ? { id: latest.id, status: latest.status, response: latest.response as ResponseValue, createdAt: latest.createdAt.toISOString() } : null,
      completedAt: completions.find((c) => c.nodeId === node.id)?.completedAt.toISOString() ?? worldCompletedAt };
  });
  const domainViews = skillDomains.map((domain) => {
    const own = nodes.filter((n) => n.domain === domain.id);
    const next = own.find((n) => n.state === "in_progress") ?? own.find((n) => n.state === "available") ?? null;
    return { ...domain, done: own.filter((n) => n.state === "completed").length, total: own.length, nextId: next?.id ?? null, nextTitle: next?.title ?? null };
  });
  const suggested = profile.focus.map((id) => domainViews.find((d) => d.id === id)!).find((d) => d.nextId) ?? domainViews[0];
  return {
    version: skillVersion, nodes, domains: domainViews,
    balance: entries.reduce((sum, e) => sum + e.amount, 0),
    ledger: entries.map((e) => ({ id: e.id, nodeId: e.nodeId, amount: e.amount, reason: e.reason, at: e.createdAt.toISOString() })),
    recommendedId: suggested.nextId ?? nodes.find((n) => n.state !== "completed")?.id ?? nodes[0].id,
    completedCount: done.size,
  };
}
export type SkillView = Awaited<ReturnType<typeof skillView>>;

export async function skillAction(type: string, body: Record<string, unknown>, user: User) {
  if (await accessFor(user) !== "FULL") throw new AppError("Дерево навыков недоступно.", 403);
  if (type === "skill.view") return skillView(user);
  await rateLimit(`skill:${user.id}`, 90);
  const node = skillNode(z.string().max(80).parse(body.nodeId));
  if (!node) throw new AppError("Шаг не найден.", 404);
  if (node.type === "WORLD_MISSION") throw new AppError("Это событие завершается только в inVision World.", 409);
  if (!['skill.save', 'skill.complete'].includes(type)) throw new AppError("Действие недоступно.", 404);
  const requestKey = z.string().uuid().parse(body.requestKey);
  const response = responseSchema.parse(body.response);
  const check = type === "skill.complete" ? checkActivity(node, response) : null;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const previous = await tx.learningAttempt.findUnique({ where: { requestKey } });
    if (previous) {
      if (previous.userId !== user.id || previous.nodeId !== node.id || !isDeepStrictEqual(previous.response, response)) throw new AppError("Этот запрос уже использован.", 409);
      const awarded = await tx.uPointEntry.findFirst({ where: { userId: user.id, nodeId: node.id } });
      return { complete: previous.status === "COMPLETED", message: check?.message ?? "Черновик сохранён.", earned: awarded?.amount ?? 0, id: previous.id };
    }
    const completed = await tx.learningCompletion.findUnique({ where: { userId_nodeId: { userId: user.id, nodeId: node.id } } });
    const required = await tx.learningCompletion.count({ where: { userId: user.id, nodeId: { in: node.prerequisites } } });
    if (required !== node.prerequisites.length) throw new AppError("Сначала открой предыдущие узлы ветви.", 409);
    if (node.type === "AUDIO_RESPONSE" && response.mediaId) {
      const owned = await tx.learningMedia.findFirst({ where: { id: response.mediaId, userId: user.id, nodeId: node.id }, select: { id: true } });
      if (!owned) throw new AppError("Запись недоступна.", 404);
    }
    const status = type === "skill.save" ? "DRAFT" : check?.complete ? "COMPLETED" : "TRY_AGAIN";
    const attempt = await tx.learningAttempt.create({ data: { userId: user.id, nodeId: node.id, contentVersion: node.version, response: json(response), status, requestKey, completedAt: status === "COMPLETED" ? new Date() : null } });
    if (status !== "COMPLETED" || completed) return { complete: !!completed, message: check?.message ?? "Черновик сохранён.", earned: 0, id: attempt.id };
    const completion = await tx.learningCompletion.create({ data: { userId: user.id, nodeId: node.id, contentVersion: node.version, attemptId: attempt.id } });
    await tx.uPointEntry.create({ data: { userId: user.id, source: "SKILL_TREE", nodeId: node.id, rewardVersion: node.rewardVersion, amount: node.reward, reason: `Завершён шаг «${node.title}»`, idempotencyKey: `skill:${user.id}:${node.id}`, completionId: completion.id } });
    return { complete: true, message: check!.message, earned: node.reward, id: attempt.id };
  });
}
