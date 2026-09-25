import "server-only";
import { programFor, programs } from "./catalog";
import { collectProfile } from "./profile-context.server";
import { randomUUID } from "node:crypto";
import type { User, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./security";
import { resourceCatalog, json } from "./learning-resources.server";
import {
  treeNodes,
  treeVersion,
  treeEvidenceVersion,
  treeStateSchema,
  nodeEvidence,
  type TreeState,
  treeHref,
} from "./development-tree";
import { readMission, initialMission } from "./missions";
import { workHref, workChanges, versionCompleted, type Work } from "./journey";
import { initialState } from "./projects";
import { journeyAction } from "./journey.server";
import { groundedAnswer, type SourceProvider } from "./ai";
import type { ResourceCatalog } from "./learning-resources";
function privateOwner(user: User | null) {
  if (!user) throw new AppError("Начни личный шаг в этом браузере.", 401);
  if (user.role === "STAFF")
    throw new AppError("Личный маршрут доступен только владельцу работ.", 403);
  return user;
}
function resources(c: ResourceCatalog, nodeId: string) {
  return c.records.flatMap((r) => {
    const latest = r.versions.at(-1)!;
    return latest.published && latest.available && latest.nodes.includes(nodeId)
      ? [{ id: r.id, ...latest }]
      : [];
  });
}
export async function treeView(user: User | null) {
  if (user?.role === "STAFF") privateOwner(user);
  const [catalog, steps, works, application] = await Promise.all([
    resourceCatalog(),
    user
      ? db.developmentStep.findMany({
          where: { userId: user.id, treeNode: { not: null } },
          orderBy: { updatedAt: "desc" },
        })
      : [],
    user
      ? db.projectAttempt.findMany({
          where: { userId: user.id },
          include: { versions: { orderBy: { revision: "desc" } } },
          orderBy: { updatedAt: "desc" },
        })
      : [],
    user
      ? db.application.findUnique({
          where: { userId: user.id },
          select: { programSlug: true },
        })
      : null,
  ]);
  const preferred =
    application?.programSlug ||
    user?.interests.find((slug) => programFor(slug)) ||
    works[0]?.slug ||
    "digital-products";
  const nodes = treeNodes.map((n) => {
    const row = steps.find(
      (s) => s.treeNode === n.id && s.treeConfig === treeVersion,
    );
    const state = row?.treeState ? treeStateSchema.parse(row.treeState) : null;
    const options = resources(catalog, n.id);
    const selectedRecord =
      state && catalog.records.find((r) => r.id === state.resourceId);
    const current = selectedRecord && selectedRecord.versions.at(-1)!;
    const historical =
      selectedRecord &&
      selectedRecord.versions.find((v) => v.version === state!.resourceVersion);
    const resource = state
      ? current?.available && current.published && historical?.published
        ? { id: state.resourceId, ...historical }
        : null
      : (options.find((r) => r.id === n.resource) ?? options[0] ?? null);
    const w = state?.attemptId
      ? works.find((w) => w.id === state.attemptId)
      : undefined;
    const evidence = w && nodeEvidence(n, w);
    const before = w?.versions.find(
      (v) => v.revision === state?.baselineRevision,
    );
    const changes =
      evidence && before
        ? workChanges(w!.slug, before.state, evidence.state, w!.context)
        : [];
    const failed =
      w && w.versions[0]
        ? (
            w.versions[0].feedback as {
              checks?: { passed: boolean; label: string; detail: string }[];
            }
          ).checks?.find((c) => !c.passed)
        : undefined;
    const suggested = works.find(
      (w) =>
        w.slug === n.slug && w.context === "WORKSHOP" && readMission(w.state),
    );
    return {
      ...n,
      status: evidence
        ? n.id === "context"
          ? ("APPLIED" as const)
          : ("PRACTICED" as const)
        : state?.studiedAt
          ? ("STUDIED" as const)
          : row
            ? ("STARTED" as const)
            : ("AVAILABLE" as const),
      resource,
      resourceUpdated:
        !!state && !!current && current.version !== state.resourceVersion,
      alternative:
        options.find(
          (r) =>
            !state ||
            r.id !== state.resourceId ||
            r.version !== state.resourceVersion,
        ) ?? null,
      step: row
        ? {
            id: row.id,
            revision: row.revision,
            updatedAt: row.updatedAt.toISOString(),
            note: row.note,
            state: state!,
          }
        : null,
      work: w
        ? {
            id: w.id,
            revision: w.revision,
            href: workHref(w),
            title: readMission(w.state)
              ? "Учебная миссия"
              : "Бронирование оборудования",
          }
        : null,
      workUnavailable: !!state?.attemptId && !w,
      suggested: suggested
        ? { id: suggested.id, revision: suggested.revision }
        : null,
      evidence: evidence
        ? {
            revision: evidence.revision,
            href: workHref(w!, evidence.revision),
            changes,
            older: evidence.revision !== w!.revision,
          }
        : null,
      basis: evidence
        ? `Условие этой практики выполнено в сохранённой версии ${evidence.revision} твоей работы.`
        : failed
          ? `В сохранённой версии ${w!.revision}: ${failed.label}. ${failed.detail}`
          : w
            ? `К практике прикреплена твоя работа версии ${w.revision}. Проверь условия шага и сохрани результат.`
            : suggested
              ? `У тебя есть работа этого направления — версия ${suggested.revision}. Можно разобрать выбранный аспект.`
              : "Этот шаг знакомит с действием в доступной учебной задаче. Предварительные результаты о тебе не предполагаются.",
    };
  });
  const active = nodes
    .filter((n) => n.step && !n.step.state.skipped)
    .sort((a, b) => b.step!.updatedAt.localeCompare(a.step!.updatedAt));
  const preferredNodes = nodes.filter((n) => n.slug === preferred);
  const next =
    active.find((n) => !n.evidence && n.slug === preferred) ??
    preferredNodes.find((n) => !n.evidence) ??
    preferredNodes[0] ??
    nodes[0];
  const publicContext = user ? await collectProfile(user, {}) : null;
  return {
    configVersion: treeVersion,
    evidenceVersion: treeEvidenceVersion,
    programSlug: preferred,
    programBasis: application?.programSlug
      ? "Направление из твоей заявки"
      : user?.interests.length
        ? "Твой сохранённый интерес"
        : works.length
          ? "Направление последней работы"
          : "Можно выбрать любое направление",
    programs: programs.map((p) => ({ slug: p.slug, title: p.shortTitle })),
    publications:
      publicContext?.sources
        .filter((s) => s.group === "publication")
        .map((s) => ({
          key: s.key,
          title: s.title,
          text: s.text,
          href: s.href,
          version: s.version,
        })) ?? [],
    nodes,
    currentId: next.id,
    lastChange: active[0]?.step?.updatedAt ?? null,
  };
}
export type TreeView = Awaited<ReturnType<typeof treeView>>;
export type TreeNodeView = TreeView["nodes"][number];
const sourceProvider: SourceProvider = {
  async answer({ question, sources }) {
    const chosen = sources.find((s) => s.id === question);
    if (!chosen) throw new AppError("Основание недоступно.", 404);
    return { text: chosen.text, sourceIds: [chosen.id] };
  },
};
export async function treeAction(
  type: string,
  b: Record<string, unknown>,
  actor: User,
) {
  const user = privateOwner(actor);
  if (type === "tree.view") return treeView(user);
  const node = treeNodes.find((n) => n.id === b.nodeId);
  if (!node) throw new AppError("Шаг недоступен.", 404);
  const view = await treeView(user),
    n = view.nodes.find((n) => n.id === node.id)!;
  if (type === "tree.explain") {
    const text = `${n.basis}\nЗачем: ${n.purpose}\n${n.resource ? `Материал: ${n.resource.title}. ${n.resource.description} ${n.resource.reason}` : "Материал сейчас недоступен. Можно выполнить практику по условиям задания."}\nПосле изучения: ${n.practice}`;
    const sourceId = `tree:${treeVersion}:${n.id}:${n.resource?.id ?? "none"}:${n.resource?.version ?? 0}:${n.work?.revision ?? 0}`;
    return {
      ...(await groundedAnswer(sourceProvider, sourceId, [
        { id: sourceId, text },
      ])),
      configVersion: treeVersion,
      evidenceVersion: treeEvidenceVersion,
      resource: n.resource
        ? {
            url: n.resource.url,
            title: n.resource.title,
            version: n.resource.version,
          }
        : null,
      work: n.work,
      provider: "local-structured",
    };
  }
  if (type === "tree.start") {
    return db
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const key = `tree:${treeVersion}:${node.id}`;
        return tx.developmentStep.upsert({
          where: { userId_key: { userId: user.id, key } },
          update: {},
          create: {
            userId: user.id,
            key,
            treeNode: node.id,
            treeConfig: treeVersion,
            recommendation: {},
            treeState: json({
              resourceId: n.resource?.id ?? node.resource,
              resourceVersion: n.resource?.version ?? 1,
              events: [{ kind: "START", at: new Date().toISOString() }],
            }),
          },
        });
      })
      .then((s) => ({ id: s.id }));
  }
  if (!n.step) throw new AppError("Сначала добавь шаг в личный план.", 409);
  if (type === "tree.practice") {
    if (n.work) return { href: workHref({ id: n.work.id, slug: node.slug }) };
    if (n.workUnavailable)
      throw new AppError(
        "Связанная работа удалена. Выбери другую работу явно.",
        409,
      );
    const requested =
      b.attemptId === undefined
        ? n.suggested?.id
        : z.string().max(100).parse(b.attemptId);
    let selected: Pick<Work, "id" | "revision"> | undefined;
    if (node.id === "context") {
      const parent = await db.projectAttempt.findFirst({
        where: {
          userId: user.id,
          slug: node.slug,
          context: "WORKSHOP",
          ...(requested ? { id: requested } : {}),
        },
        include: { versions: { orderBy: { revision: "desc" } } },
        orderBy: { updatedAt: "desc" },
      });
      const version = parent?.versions.find((v) => versionCompleted(parent, v));
      if (!version)
        throw new AppError(
          "Бронирование использует исходный маршрут. Сначала сохрани завершённую работу сервиса; остальные ветки доступны.",
          409,
        );
      const result = (await journeyAction("project.context", {
        versionId: version.id,
      })) as { id: string; slug: string };
      selected = { ...result, revision: 0 };
    } else if (requested) {
      selected =
        (await db.projectAttempt.findFirst({
          where: {
            id: requested,
            userId: user.id,
            slug: node.slug,
            context: "WORKSHOP",
          },
        })) ?? undefined;
      if (!selected) throw new AppError("Работа недоступна.", 404);
    } else {
      // Reuse the existing save pipeline and its stable request-key deduplication.
      const requestKey = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "DevelopmentStep" WHERE id=${n.step!.id} FOR UPDATE`;
        const row = await tx.developmentStep.findUniqueOrThrow({
          where: { id: n.step!.id },
        });
        const s = treeStateSchema.parse(row.treeState);
        const prior = s.events.find((e) => e.kind === "PRACTICE_REQUEST");
        if (prior?.attemptId) return prior.attemptId;
        const key = randomUUID();
        s.events.push({
          kind: "PRACTICE_REQUEST",
          at: new Date().toISOString(),
          attemptId: key,
        });
        await tx.developmentStep.update({
          where: { id: row.id },
          data: { treeState: json(s) },
        });
        return key;
      });
      selected = (await journeyAction("project.save", {
        slug: node.slug,
        state: { ...initialState, mission: initialMission(node.slug) },
        revision: 0,
        requestKey,
      })) as { id: string; revision: number };
    }
    const chosen = selected!;
    await mutate(n.step.id, user, undefined, (s) => {
      if (!s.attemptId) {
        s.attemptId = chosen.id;
        s.baselineRevision = chosen.revision;
        s.events.push({
          kind: "PRACTICE",
          at: new Date().toISOString(),
          attemptId: chosen.id,
        });
      }
    });
    return { href: workHref({ id: chosen.id, slug: node.slug }) };
  }
  const revision = z.number().int().nonnegative().parse(b.revision);
  await mutate(
    n.step.id,
    user,
    revision,
    (s) => {
      const at = new Date().toISOString();
      if (type === "tree.open") {
        if (!n.resource)
          throw new AppError(
            "Материал недоступен. Можно перейти к практике или выбрать замену.",
            409,
          );
        if (!s.openedAt) {
          s.openedAt = at;
          s.events.push({
            kind: "OPEN",
            at,
            resourceId: s.resourceId,
            resourceVersion: s.resourceVersion,
          });
        }
      } else if (type === "tree.study") {
        if (!s.openedAt || !n.resource)
          throw new AppError("Сначала открой доступный материал.", 409);
        if (!s.studiedAt) {
          s.studiedAt = at;
          s.events.push({
            kind: "STUDY_SELF_REPORTED",
            at,
            resourceId: s.resourceId,
            resourceVersion: s.resourceVersion,
          });
        }
      } else if (type === "tree.resource") {
        if (!n.alternative)
          throw new AppError("Нет опубликованной замены.", 409);
        s.resourceId = n.alternative.id;
        s.resourceVersion = n.alternative.version;
        delete s.openedAt;
        delete s.studiedAt;
        s.events.push({
          kind: "RESOURCE_CHANGE",
          at,
          resourceId: s.resourceId,
          resourceVersion: s.resourceVersion,
        });
      } else if (type === "tree.skip") {
        s.skipped = z.boolean().parse(b.skipped);
        s.events.push({ kind: s.skipped ? "PAUSE" : "RESUME", at });
      } else if (type === "tree.rebind") {
        delete s.attemptId;
        delete s.baselineRevision;
        s.events = s.events.filter((e) => e.kind !== "PRACTICE_REQUEST");
        s.events.push({ kind: "RESELECT_WORK", at });
      } else throw new AppError("Действие недоступно.", 404);
    },
    type === "tree.study"
      ? z
          .string()
          .trim()
          .min(10, "Запиши одну мысль, которую попробуешь применить.")
          .max(2000)
          .parse(b.note)
      : undefined,
  );
  return { href: type === "tree.open" ? n.resource?.url : treeHref(node.id) };
}
async function mutate(
  id: string,
  user: User,
  revision: number | undefined,
  change: (state: TreeState) => void,
  note?: string,
) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "DevelopmentStep" WHERE id=${id} FOR UPDATE`;
    const row = await tx.developmentStep.findFirst({
      where: { id, userId: user.id, treeConfig: treeVersion },
    });
    if (!row) throw new AppError("Личный шаг недоступен.", 404);
    if (revision !== undefined && row.revision !== revision)
      throw new AppError(
        "Шаг изменился в другой вкладке. Обнови маршрут; текст остаётся в форме.",
        409,
      );
    const state = treeStateSchema.parse(row.treeState);
    change(state);
    await tx.developmentStep.update({
      where: { id },
      data: { treeState: json(state), note, revision: { increment: 1 } },
    });
  });
}
