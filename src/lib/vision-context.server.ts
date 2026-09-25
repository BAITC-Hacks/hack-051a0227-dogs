import "server-only";
import { learningPolicy } from "./learning-context";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";
import { collectProfile } from "./profile-context.server";
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
