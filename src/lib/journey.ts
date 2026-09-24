import {
  readMission,
  missionFeedback,
  missionDifferences,
  missions,
} from "./missions";
import type { ProjectAttempt, AttemptVersion } from "@prisma/client";
import {
  checkProject,
  initialState,
  changesBetween,
  projectSchema,
} from "./projects";
import { checkEquipment, equipmentInitial, equipmentSchema } from "./equipment";
import type { ProjectState, Feedback } from "./types";
export const journeyRuleVersion = 2;
export type Work = ProjectAttempt & { versions: AttemptVersion[] };
export type Milestone = {
  key: string;
  title: string;
  description: string;
  attemptId: string;
  slug: string;
  revision: number;
  earnedAt: Date;
  ruleVersion: number;
};
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
/** Only task content participates; formatting, object order and media titles do not. */
export function substantive(
  slug: string,
  state: unknown,
  context = "WORKSHOP",
) {
  if (context === "EQUIPMENT") return equipmentSchema.parse(state);
  const m = readMission(state);
  if (m)
    return {
      ...m.plan,
      headline: undefined,
      explanation: normalize(m.plan.explanation),
      verification: normalize(m.plan.verification),
    };
  const s = projectSchema.parse(state);
  if (slug === "digital-products")
    return { screens: s.screens, requiredPhone: s.requiredPhone };
  if (slug === "digital-media")
    return { caption: normalize(s.caption), fragments: s.fragments };
  if (slug === "creative-engineering")
    return [...s.modules].sort((a, b) => a.cell - b.cell);
  if (slug === "sociology")
    return {
      classifications: Object.entries(s.classifications).sort(),
      question: normalize(s.question),
      note: normalize(s.note),
    };
  return { allocations: s.allocations, explanation: normalize(s.explanation) };
}
export function meaningfullyChanged(
  slug: string,
  a: unknown,
  b: unknown,
  context = "WORKSHOP",
) {
  return !sameWorkState(
    substantive(slug, a, context),
    substantive(slug, b, context),
  );
}
export function workFeedback(
  slug: string,
  state: unknown,
  context = "WORKSHOP",
): Feedback {
  const m = readMission(state);
  if (m) return missionFeedback(m);
  return context === "EQUIPMENT"
    ? checkEquipment(equipmentSchema.parse(state))
    : checkProject(slug, projectSchema.parse(state));
}
export function workCompleted(
  slug: string,
  state: unknown,
  context = "WORKSHOP",
) {
  const f = workFeedback(slug, state, context);
  if (readMission(state)) return f.checks.every((c) => c.passed);
  return (
    f.checks.length > 0 &&
    f.checks.every((c) => c.passed) &&
    meaningfullyChanged(
      slug,
      context === "EQUIPMENT" ? equipmentInitial : initialState,
      state,
      context,
    )
  );
}
export function versionCompleted(
  a: Pick<Work, "slug" | "context">,
  v: AttemptVersion,
) {
  if (v.revision === 0) return false;
  if (v.ruleVersion > 0) return v.completed;
  // Legacy versions use the explicit exercise conditions, not inferred personal qualities.
  try {
    return workCompleted(a.slug, v.state, a.context);
  } catch {
    return false;
  }
}
export function workChanges(
  slug: string,
  before: unknown,
  after: unknown,
  context = "WORKSHOP",
): string[] {
  const ma = readMission(before),
    mb = readMission(after);
  if (ma && mb) return missionDifferences(ma, mb);
  if (context !== "EQUIPMENT")
    return changesBetween(slug, before as ProjectState, after as ProjectState);
  const a = equipmentSchema.parse(before),
    b = equipmentSchema.parse(after);
  return (
    [
      ["screens", "Порядок бронирования"],
      ["requiredPhone", "Обязательность телефона"],
      ["unavailable", "Ответ на занятое время"],
      ["reservationDetails", "Детали подтверждения"],
    ] as const
  )
    .filter(([k]) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map(([, v]) => v);
}
export function workHref(a: Pick<Work, "slug" | "id">, revision?: number) {
  return `/projects/${a.slug}?attempt=${a.id}${revision === undefined ? "" : `&version=${revision}#result`}`;
}
export function workTitle(
  a: Pick<Work, "slug" | "context"> & {
    state?: unknown;
    configVersion?: number;
  },
  fallback: string,
) {
  return a.context === "EQUIPMENT"
    ? "Забронировать оборудование без лишних шагов"
    : a.configVersion === 3 || readMission(a.state)
      ? (missions[a.slug]?.title ?? fallback)
      : (legacyWorkTitles[a.slug] ?? fallback);
}
const legacyWorkTitles: Record<string, string> = {
  "digital-products": "Сделать регистрацию проще",
  "digital-media": "Рассказать историю перемен",
  "creative-engineering": "Собрать площадку из модулей",
  sociology: "Понять, кого мы не услышали",
  "public-policy": "Распределить общий ресурс",
};
/** The caller supplies only the owner's attempts. No application or staff data is an input. */
export function projectMilestones(attempts: Work[]): Milestone[] {
  const earned: Milestone[] = [];
  const events = attempts
    .flatMap((a) => a.versions.map((v) => ({ a, v })))
    .sort(
      (x, y) =>
        new Date(x.v.createdAt).getTime() - new Date(y.v.createdAt).getTime() ||
        x.v.revision - y.v.revision,
    );
  const add = (
    key: string,
    title: string,
    description: string,
    a: Work,
    v: AttemptVersion,
  ) => {
    if (!earned.some((e) => e.key === key))
      earned.push({
        key,
        title,
        description,
        attemptId: a.id,
        slug: a.slug,
        revision: v.revision,
        earnedAt: v.createdAt,
        ruleVersion: v.ruleVersion === 3 ? 3 : journeyRuleVersion,
      });
  };
  const directions = new Set<string>();
  for (const { a, v } of events) {
    if (v.revision === 0) continue;
    if (versionCompleted(a, v)) {
      if (a.context === "WORKSHOP") {
        add(
          "first",
          "Первая работа",
          "Сохранена работа, которая выполняет явные условия мастерской.",
          a,
          v,
        );
        directions.add(a.slug);
        if (directions.size >= 2)
          add(
            "perspective",
            "Другой взгляд",
            "Выполнены условия работ в двух разных мастерских.",
            a,
            v,
          );
      } else if (
        a.parentVersionId &&
        attempts.some((p) =>
          p.versions.some(
            (pv) => pv.id === a.parentVersionId && versionCompleted(p, pv),
          ),
        )
      )
        add(
          "context",
          "Новый контекст",
          "Сохранено решение дополнительной задачи бронирования. Это опыт применения принципа, а не оценка обучаемости.",
          a,
          v,
        );
    }
    const previous = a.versions.find((p) => p.revision === v.revision - 1);
    if (
      previous &&
      previous.revision > 0 &&
      meaningfullyChanged(a.slug, previous.state, v.state, a.context)
    )
      add(
        "revision",
        "Новая версия",
        "Сохранён содержательно изменённый вариант. Переработка сама по себе не означает улучшение качества.",
        a,
        v,
      );
  }
  return earned;
}

/** Compare JSON content independently of PostgreSQL JSONB property order. */
export function sameWorkState(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
