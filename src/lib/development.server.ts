import "server-only";
import { deepeningPrompts } from "./path-progress";
import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";
import { digest } from "./scoring-input.server";
import { meaningfullyChanged, versionCompleted } from "./journey";
import { sourceRef, type ProfileContext } from "./profile-context.server";
import { sameDevelopmentAction } from "./profile-contract";
import type {
  DevelopmentRecommendation,
  DevelopmentView,
} from "./profile-contract";
export const developmentVersion = "work-actions-drive-v2";
// Exercise mapping belongs to this application, not an official university formula.
const direction: Record<string, DevelopmentRecommendation["drive"]> = {
  "digital-products": "R",
  "digital-media": "E",
  "creative-engineering": "I",
  sociology: "I",
  "public-policy": "V",
};
export function developmentRecommendations(
  c: ProfileContext,
): DevelopmentRecommendation[] {
  if (c.audience !== "CANDIDATE") return [];
  const recommendations: DevelopmentRecommendation[] = [];
  for (const w of c.works.filter((w) => w.revision > 0)) {
    const s = c.sources.find((s) => s.key === w.sourceKey)!;
    const failed = w.feedback.checks.find((c) => !c.passed);
    const base = {
      configVersion: developmentVersion,
      origin: "Личное продолжение мастерской" as const,
      source: sourceRef(s),
      attemptId: w.id,
      revision: w.revision,
      versionId: w.versionId,
      drive: direction[w.slug] ?? null,
    };
    if (!w.complete)
      recommendations.push({
        ...base,
        key: digest({
          version: w.versionId,
          kind: "REVISE",
          rule: developmentVersion,
        }),
        kind: "REVISE",
        title: "Проверить условие и доработать работу",
        basis: failed
          ? `${failed.label}: ${failed.detail}`
          : "Сохранён черновик упражнения.",
        purpose: "Измени решение и проверь условия в сохранённом результате.",
        completion:
          "Сохранена содержательно изменённая версия этой работы, выполняющая условия упражнения.",
        href: `${w.href.split("&version=")[0]}&from=${w.revision}`,
      });
    if (w.complete && w.slug === "digital-products" && w.context === "WORKSHOP")
      recommendations.push({
        ...base,
        key: digest({
          version: w.versionId,
          kind: "CONTEXT",
          rule: developmentVersion,
        }),
        kind: "CONTEXT",
        title: "Применить принцип в бронировании оборудования",
        basis: w.feedback.checks.map((c) => c.detail).join(" "),
        purpose:
          "Проверь доступность до запроса контакта, предложи свободное время и понятное подтверждение.",
        completion:
          "В связанной задаче сохранено решение, выполняющее условия бронирования.",
      });
    recommendations.push({
      ...base,
      key: digest({
        version: w.versionId,
        kind: "EXPLAIN",
        rule: developmentVersion,
      }),
      kind: "EXPLAIN",
      title: "Записать объяснение своего выбора",
      basis: failed ? `${failed.label}: ${failed.detail}` : w.feedback.summary,
      purpose:
        (deepeningPrompts[w.slug] ??
          "Назови своё решение, одну альтернативу и условие, при котором ты выберешь её.") +
        " Запись останется личной.",
      completion:
        "Объяснение сохранено, и ты отдельно отметил выполнение личного шага. Смысл текста и навык автоматически не оцениваются.",
    });
  }
  for (const s of c.sources.filter((s) => s.group === "publication"))
    recommendations.push({
      key: digest({
        source: s.key,
        version: s.version,
        rule: developmentVersion,
      }),
      configVersion: developmentVersion,
      kind: "EXPLAIN",
      title: "Подготовить пояснение по обратной связи",
      basis: s.text,
      purpose:
        "Сохрани личную подготовку. Если нужен ответ комиссии, отправь его отдельно в переписке по заявке.",
      completion:
        "Ты сохранил пояснение и отметил выполнение личного шага. Это не отправка сообщения комиссии.",
      drive: null,
      origin: "Опубликованная обратная связь",
      source: sourceRef(s),
      href: "/my#application-messages",
    });
  return recommendations;
}
export function availableRecommendation(
  r: DevelopmentRecommendation,
  c: ProfileContext,
) {
  return (
    [developmentVersion, "work-actions-drive-v1"].includes(r.configVersion) &&
    c.sources.some(
      (s) => s.key === r.source.key && s.version === r.source.version,
    )
  );
}
export async function developmentView(
  user: User,
  c: ProfileContext,
): Promise<DevelopmentView[]> {
  if (c.audience !== "CANDIDATE") return [];
  const records = await db.developmentStep.findMany({
    where: { userId: user.id, treeNode: null },
    orderBy: { createdAt: "desc" },
  });
  const works = await db.projectAttempt.findMany({
    where: { userId: user.id },
    include: { versions: { orderBy: { revision: "asc" } } },
  });
  return records.map((s) => {
    const r = s.recommendation as unknown as DevelopmentRecommendation;
    if (!availableRecommendation(r, c))
      return {
        id: s.id,
        recommendation: null,
        note: "",
        status: "UNAVAILABLE",
        stale: true,
        revision: s.revision,
      };
    const source = c.sources.find((x) => x.key === r.source.key)!;
    const w = works.find((w) => w.id === r.attemptId),
      base = w?.versions.find((v) => v.id === r.versionId);
    const target =
      r.kind === "CONTEXT"
        ? works.find(
            (w) =>
              w.parentVersionId === r.versionId && w.context === "EQUIPMENT",
          )
        : w;
    const completed = target?.versions.find(
      (v) =>
        versionCompleted(target, v) &&
        (r.kind === "CONTEXT" ||
          (r.kind === "REVISE" &&
            base &&
            v.revision > base.revision &&
            meaningfullyChanged(
              target.slug,
              base.state,
              v.state,
              target.context,
            ))),
    );
    const completedSource = completed
      ? c.sources.find((s) => s.key === `work:${completed.id}`)
      : undefined;
    return {
      id: s.id,
      recommendation: r,
      note: s.note,
      revision: s.revision,
      stale: !source.current,
      status: completed
        ? "RESULT_SAVED"
        : s.selfCompletedAt
          ? "SELF_REPORTED"
          : "ACTIVE",
      completionSource: completedSource
        ? sourceRef(completedSource)
        : undefined,
    };
  });
}
export async function startDevelopment(
  user: User,
  c: ProfileContext,
  key: string,
) {
  if (user.role === "STAFF")
    throw new AppError("Личное развитие доступно владельцу работ.", 403);
  const r = developmentRecommendations(c).find((r) => r.key === key);
  if (!r)
    throw new AppError(
      "Рекомендация недоступна. Обновите выбранную версию.",
      409,
    );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const previous = await tx.developmentStep.findMany({
      where: { userId: user.id, treeNode: null },
    });
    const existing = previous.find((step) =>
      sameDevelopmentAction(
        step.recommendation as DevelopmentRecommendation | null,
        r,
      ),
    );
    if (existing) return existing;
    return tx.developmentStep.upsert({
      where: { userId_key: { userId: user.id, key } },
      update: {},
      create: {
        userId: user.id,
        key,
        recommendation: JSON.parse(JSON.stringify(r)) as Prisma.InputJsonValue,
      },
    });
  });
}
