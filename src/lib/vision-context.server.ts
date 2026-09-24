import "server-only";
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
  const c = await collectProfile(fresh, scope);
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
        keys.includes(s.key) ||
        s.group === "resource" ||
        (s.group === "publication" &&
          (!scope.attemptId || !!scope.feedbackId)) ||
        (s.key.startsWith("personal-plan:") &&
          s.dependencies.some((d) => keys.includes(d.key))),
    )
    .sort(
      (a, b) => Number(a.group === "resource") - Number(b.group === "resource"),
    )
    .slice(0, 12)
    .map((s) => ({ ...s, text: s.text.slice(0, 8000) }));
  const recommendations = developmentRecommendations(c)
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
    scope,
    sources,
    work,
    recommendations,
    consentRevision: revision,
  });
  return {
    c,
    work,
    sources,
    recommendations,
    actions,
    hash,
    consentRevision: revision,
  };
}
export type VisionContext = Awaited<ReturnType<typeof visionContext>>;
