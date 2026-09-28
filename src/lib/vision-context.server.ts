import "server-only";
import { learningPolicy } from "./learning-context";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";
import { accessFor } from "./access.server";
import { collectProfile, profileSource } from "./profile-context.server";
import { skillView } from "./skill-tree.server";
import { skillHref } from "./skill-tree-catalog";
import { developmentRecommendations } from "./development.server";
import type { ProfileScope } from "./profile-contract";
import { visionConsentSchema, visionVersion } from "./vision-contract";
import { digest } from "./scoring-input.server";
export async function visionCapability(user: User) {
  const c = await db.openAIConnection.findUnique({
    where: { id: "local" },
    select: {
      visionEnabled: true,
      secretCipher: true,
      textModel: true,
      complexModel: true,
    },
  });
  const consent = visionConsentSchema.safeParse(user.visionConsent);
  return {
    available: !!c?.visionEnabled && !!c.secretCipher,
    granted: consent.success && consent.data.granted,
    revision: consent.success ? consent.data.revision : 0,
    textModel: c?.textModel ?? "",
    complexModel: c?.complexModel ?? "",
  };
}
export async function visionContext(
  user: User,
  scope: ProfileScope,
  requireConsent = true,
) {
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (!fresh || !["CANDIDATE", "GUEST"].includes(fresh.role))
    throw new AppError("Vision доступен владельцу личной работы.", 403);
  const access = await accessFor(fresh);
  if (access === "GUEST" || access === "RESTRICTED") throw new AppError("Войдите в заявку, чтобы спросить Vision.", 403);
  if (access === "APPLICATION" && (scope.attemptId || scope.feedbackId))
    throw new AppError("Личный учебный разбор откроется после подачи заявки.", 403);
  if (scope.applicationId || scope.domain)
    throw new AppError(
      "Оценочные материалы разбирает сотрудник. Выбери личную работу или опубликованную обратную связь.",
      403,
    );
  const consent = visionConsentSchema.safeParse(fresh.visionConsent);
  if (requireConsent && (!consent.success || !consent.data.granted))
    throw new AppError(
      "Подтверди передачу выбранного учебного контекста Vision.",
      403,
    );
  if (
    !requireConsent &&
    consent.success &&
    !consent.data.granted &&
    consent.data.revision > 0
  )
    throw new AppError("Диалог остановлен настройками доступа.", 403);
  const c = await collectProfile(fresh, scope);
  let skillNext: { title: string; href: string } | null = null;
  if (access === "FULL" && !scope.attemptId && !scope.feedbackId) {
    const tree = await skillView(fresh);
    c.works = [];
    c.questions = [];
    c.consistency = [];
    c.sources = c.sources.filter((source) => source.key.startsWith("admissions:") || source.group === "publication");
    c.sources.push(profileSource("skill:overview", "Прогресс дерева навыков", tree.nodes.map((node) => `${node.title}: ${node.state === "completed" ? "завершено" : node.state === "locked" ? "пока закрыто" : node.state === "in_progress" ? "в работе" : "доступно"}`).join("; "), "resource", "Личное дерево навыков", { href: skillHref() }));
    for (const node of tree.nodes.filter((node) => node.state !== "locked").slice(0, 8))
      c.sources.push(profileSource(`skill:${node.id}`, node.title, `${node.title}. ${node.prompt} Состояние: ${node.state === "completed" ? "завершено" : node.state === "in_progress" ? "в работе" : "доступно"}. Награда за первое завершение: ${node.reward} U.`, "resource", "Личное дерево навыков", { href: skillHref(node.id) }));
    const recommended = tree.nodes.find((node) => node.id === tree.recommendedId);
    if (recommended) skillNext = { title: recommended.title, href: skillHref(recommended.id) };
  }
  if (access === "APPLICATION") {
    c.works = [];
    c.questions = [];
    c.consistency = [];
    c.feedbackAction = undefined;
    c.sources = c.sources.filter((source) => source.key.startsWith("admissions:"));
    c.hash = digest({ audience: "CANDIDATE", scopeKey: c.scopeKey, sources: c.sources });
  }
  c.works = c.works.map((w) => ({
    ...w,
    sourceKey: `learning:${w.versionId}`,
    beforeKey: w.beforeKey?.replace("work:", "learning:"),
  }));
  c.works = c.works.map((w) => ({
    ...w,
    feedback: {
      ...w.feedback,
      summary: c.sources.find((s) => s.key === w.sourceKey)?.text ?? "",
      checks: [],
    },
  }));
  const work = c.works[0];
  const keys = [
    work?.sourceKey,
    work?.beforeKey,
    work && `program:${work.slug}`,
    work && `transfer-status:${work.id}`,
    "interests",
  ].filter(Boolean);
  const sources = c.sources
    .filter(
      (s) =>
        (s.group === "program" ||
          s.group === "resource" ||
          s.key.startsWith("learning:")) &&
        (keys.includes(s.key) ||
          s.group === "resource" ||
          (!work && s.group === "program")),
    )
    .sort(
      (a, b) => Number(a.group === "resource") - Number(b.group === "resource"),
    )
    .slice(0, 12)
    .map((s) => ({ ...s, text: s.text.slice(0, 8000) }));
  if (!scope.attemptId && !scope.feedbackId)
    sources.push(...c.sources.filter((s) => s.key.startsWith("admissions:")));
  const recommendations = developmentRecommendations(c)
    .map((r) => {
      const source = c.sources.find((s) => s.key === r.source.key);
      return {
        ...r,
        basis: source?.text ?? "Учебная практика",
        source: source
          ? { key: source.key, version: source.version, quote: source.text }
          : r.source,
      };
    })
    .filter((r) => sources.some((s) => s.key === r.source.key))
    .slice(0, 4);
  const actions = [
    { key: "intake", label: "Открыть заявку", href: "/apply" },
    ...(skillNext ? [{ key: "skill-next", label: `Продолжить: ${skillNext.title}`, href: skillNext.href }] : []),
    {
      key: "admissions-messages",
      label: "Вопрос комиссии",
      href: "/apply/status#messages",
    },
    ...(work
      ? [{ key: "work", label: "Открыть выбранную версию", href: work.href }]
      : []),
    ...(work
      ? [
          {
            key: "program",
            label: "Подробнее о программе",
            href: `/programs/${work.slug}`,
          },
        ]
      : []),
    ...recommendations
      .filter((r) => r.href?.startsWith("/"))
      .map((r) => ({ key: r.key, label: r.title, href: r.href! })),
  ];
  const revision = consent.success ? consent.data.revision : 0;
  const hash = digest({
    version: visionVersion,
    dataPolicy: learningPolicy,
    scope,
    sources,
    work,
    recommendations,
    consentRevision: requireConsent ? revision : 0,
  });
  return {
    c,
    work,
    sources,
    recommendations,
    actions,
    hash,
    consentRevision: requireConsent ? revision : 0,
  };
}
export type VisionContext = Awaited<ReturnType<typeof visionContext>>;
