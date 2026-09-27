import { domains } from "./catalog";
import type { ScoringResult, ScoringView } from "./scoring-contract";

export const axisDefinitionVersion = "axis-rubric-levels-v1";
export type AxisPoint = {
  criterionId: string;
  value: number | null;
  minimum: number;
  maximum: number;
  scaleVersion: string;
  explanation: string;
  evidenceIds: string[];
  origin: "Сотрудник" | "Подготовленная история" | "Обработка материалов";
  status: "Не оценено" | "Требует проверки" | "Проверено сотрудником";
};

/** The original rubric has two ordered, named levels. No interpolation to 100. */
export function axisPoints(run: ScoringView["runs"][number], humanOnly = false): AxisPoint[] {
  const review = run.reviews.length ? run.reviews[0] : undefined;
  const result: ScoringResult | null = humanOnly
    ? review?.result ?? null
    : review?.result ?? run.result;
  const originalLevels =
    run.criteria.rubricVersion === 1 &&
    run.criteria.levels.length === 2 &&
    run.criteria.levels[0].label === "Есть проявление" &&
    run.criteria.levels[1].label === "Устойчивое проявление";
  return domains.map((criterionId) => {
    const domain = result?.domains.find((item) => item.domain === criterionId);
    const initialDomain = run.result?.domains.find((item) => item.domain === criterionId);
    const humanChanged = !!review && JSON.stringify(domain) !== JSON.stringify(initialDomain);
    const prepared = !humanChanged ? run.showcaseAxis?.find((point) => point.criterionId === criterionId) : undefined;
    const rating = domain?.rating;
    const numeric = run.criteria.numeric;
    let value: number | null = null;
    let minimum = 1;
    let maximum = 2;
    let scaleVersion = axisDefinitionVersion;
    if (rating && numeric && rating.value !== null) {
      const values = numeric.points.map((point) => point.value);
      minimum = Math.min(...values);
      maximum = Math.max(...values);
      value = values.includes(rating.value) ? rating.value : null;
      scaleVersion = run.criteria.version;
    } else if (rating && originalLevels) {
      const index = run.criteria.levels.findIndex((level) => level.label === rating.label);
      value = index < 0 ? null : index + 1;
    }
    if (prepared) {
      value = prepared.value;
      minimum = 1;
      maximum = 2;
      scaleVersion = prepared.scaleVersion;
    }
    return {
      criterionId,
      value,
      minimum,
      maximum,
      scaleVersion,
      explanation: prepared?.basis ?? domain?.interpretation ?? "Основание ещё не рассмотрено.",
      evidenceIds: prepared?.evidenceIds ?? domain?.evidenceIds ?? [],
      origin: humanChanged
        ? "Сотрудник"
        : prepared
          ? "Подготовленная история"
          : "Обработка материалов",
      status: value === null
        ? "Не оценено"
        : humanChanged
          ? "Проверено сотрудником"
          : "Требует проверки",
    };
  });
}

export function comparableAxisRun(
  current: ScoringView["runs"][number],
  candidate: ScoringView["runs"][number],
) {
  return candidate.id !== current.id &&
    candidate.status === "COMPLETED" &&
    candidate.criteriaVersion === current.criteriaVersion &&
    candidate.provider === current.provider &&
    candidate.scenarioVersion === current.scenarioVersion &&
    candidate.applicationVersion.revision <= current.applicationVersion.revision;
}
