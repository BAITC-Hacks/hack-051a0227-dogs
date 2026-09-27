import { test } from "node:test";
import assert from "node:assert/strict";
import { domains } from "../../src/lib/catalog";
import { axisPoints, comparableAxisRun } from "../../src/lib/axis-profile";
import type { ScoringView } from "../../src/lib/scoring-contract";

type Run = ScoringView["runs"][number];
function run(prepared: boolean): Run {
  const domainsResult = domains.map((domain) => ({
    domain, rating: null, sufficiency: "Недостаточно", consistency: "Не проверено",
    interpretation: "Основание ещё не проверено.", evidenceIds: [], gaps: [],
  }));
  return {
    id: "run-a", status: "COMPLETED", current: true, provider: "local",
    scenarioVersion: prepared ? "showcase-scoring-v1" : "structured-fields-v1",
    materialVersion: "m1", applicationVersion: { id: "v1", revision: 1 },
    sources: [], createdAt: "2026-09-27T00:00:00.000Z", completedAt: "2026-09-27T00:00:00.000Z",
    criteriaVersion: "c1", criteria: {
      version: "c1", rubricVersion: 1, guidance: "Два уровня, основанные на разных эпизодах.",
      levels: [
        { label: "Есть проявление", meaning: "Один эпизод" },
        { label: "Устойчивое проявление", meaning: "Два эпизода" },
      ],
      numeric: null, ratingDomains: [], operations: [],
    },
    result: { state: "REQUIRES_REVIEW", summary: "Проверка", domains: domainsResult,
      evidence: [], contradictions: [], questions: [],
      recommendation: { action: "CHECK", reason: "Проверить", sourceIds: [] },
      feedback: { observation: "Проверить", suggestion: "Проверить", nextAction: "Проверить", sourceIds: [] },
    } as Run["result"],
    showcaseScore: null,
    showcaseEnglishScore: null,
    showcaseAxis: prepared ? domains.map((criterionId, index) => ({
      criterionId, value: (index % 2 ? 1 : 2) as 1 | 2,
      scaleVersion: "prepared-axis-v1" as const,
      basis: "Подготовленное значение требует проверки.", evidenceIds: [],
    })) : null,
    reviews: [],
  };
}

test("AXIS: девять значений только у подготовленной истории; отсутствие данных не равно нулю", () => {
  const prepared = axisPoints(run(true));
  assert.equal(prepared.length, 9);
  assert.ok(prepared.every((point) => point.value === 1 || point.value === 2));
  assert.ok(prepared.every((point) => point.origin === "Подготовленная история" && point.status === "Требует проверки"));
  const newCandidate = axisPoints(run(false));
  assert.ok(newCandidate.every((point) => point.value === null && point.status === "Не оценено"));
});

test("AXIS: ручное изменение одной области не стирает остальные подготовленные значения", () => {
  const initial = run(true);
  const edited = structuredClone(initial.result)!;
  edited.domains[3].rating = { label: "Есть проявление", value: null };
  edited.domains[3].interpretation = "Сотрудник сверил конкретный эпизод.";
  initial.reviews = [{ id: "review", author: "Сотрудник", createdAt: "2026-09-27T01:00:00.000Z",
    reason: "Сверен источник и изменена оценка.", rejectedEvidenceIds: [], result: edited }];
  const points = axisPoints(initial);
  assert.equal(points[3].value, 1);
  assert.equal(points[3].origin, "Сотрудник");
  assert.equal(points[2].origin, "Подготовленная история");
  assert.equal(points.filter((point) => point.value !== null).length, 9);
  const prior = { ...run(true), id: "run-prior", applicationVersion: { id: "v0", revision: 0 } };
  assert.ok(comparableAxisRun(initial, prior));
  assert.equal(comparableAxisRun(initial, { ...prior, criteriaVersion: "different" }), false);
});
