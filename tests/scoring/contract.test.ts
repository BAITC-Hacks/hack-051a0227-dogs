import { test } from "node:test";
import assert from "node:assert/strict";
import { domains } from "../../src/lib/catalog";
import {
  validateScoringResult,
  type ScoringInput,
} from "../../src/lib/scoring-contract";
import {
  assessmentStories,
  preparedStory,
} from "../../src/lib/scoring-scenarios.server";
import { digest } from "../../src/lib/scoring-input.server";
import {
  ExternalAssessmentProvider,
  LocalAssessmentProvider,
  configuredAssessmentProvider,
} from "../../src/lib/scoring-provider.server";
function sample(): ScoringInput {
  const story = assessmentStories.rich;
  return {
    applicationId: "own",
    applicationVersion: { id: "submitted", revision: 1 },
    materialVersion: "materials",
    facts: { program: "Цифровые продукты", ...story },
    sources: [
      {
        id: "experience",
        version: "experience-v1",
        title: "Опыт и личная роль",
        kind: "Анкета",
        text: story.experience + "\n\nЛичная роль: " + story.personalRole,
        episodeId: "same-project",
        assessable: true,
        corrections: [],
        material: null,
      },
      {
        id: "motivation",
        version: "motivation-v1",
        title: "Мотивация",
        kind: "Анкета",
        text: story.motivation,
        episodeId: null,
        assessable: true,
        corrections: [],
        material: null,
      },
    ],
    language: null,
    clarifications: [],
    criteria: {
      version: "1",
      rubricVersion: 1,
      guidance: "Действие в одном эпизоде либо в нескольких разных эпизодах.",
      levels: [
        { label: "Есть проявление", meaning: "Одно действие" },
        { label: "Устойчивое проявление", meaning: "Разные эпизоды" },
      ],
      numeric: null,
      ratingDomains: [
        domains[0],
        domains[1],
        domains[2],
        domains[3],
        domains[5],
        domains[6],
      ],
      operations: ["facts", "domain_rating", "questions", "feedback"],
    },
  };
}
test("число только по настроенному правилу; повтор одного проекта не увеличивает уровень", () => {
  const input = sample(),
    result = preparedStory(input, "rich");
  input.criteria.numeric = {
    rule: "distinct_episodes",
    points: [
      {
        value: 1,
        label: "Один эпизод",
        minimumEpisodes: 1,
        meaning: "Основания из одного отдельного эпизода",
      },
      {
        value: 2,
        label: "Несколько эпизодов",
        minimumEpisodes: 2,
        meaning: "Основания из разных эпизодов",
      },
    ],
  };
  result.domains[5].rating = { value: 1, label: "Один эпизод" };
  assert.equal(
    validateScoringResult(result, input).domains[5].rating!.value,
    1,
  );
  result.domains[5].evidenceIds = ["experience", "role"];
  result.domains[5].rating = { value: 2, label: "Несколько эпизодов" };
  assert.throws(() => validateScoringResult(result, input), /NUMERIC_RULE/);
  result.domains[5].rating = { value: null, label: "Устойчивое проявление" };
  assert.throws(() => validateScoringResult(result, input), /REPEATED_EPISODE/);
  result.domains[5].rating = null;
  result.domains[5].sufficiency = "Недостаточно";
  assert.equal(validateScoringResult(result, input).domains[5].rating, null);
});
test("девять областей, разрешённые операции и основания проверяются независимо", () => {
  const input = sample(),
    result = preparedStory(input, "rich");
  const changed = structuredClone(input);
  changed.sources[0].corrections.push({
    id: "correction",
    text: "Рассказ уточнён",
  });
  assert.throws(
    () => preparedStory(changed, "rich"),
    /STORY_MATERIALS_MISMATCH/,
  );
  let invalid = structuredClone(result);
  invalid.domains[8] = { ...invalid.domains[2], domain: domains[8] };
  assert.throws(
    () => validateScoringResult(invalid, input),
    /OPERATION_NOT_ALLOWED/,
  );
  invalid = structuredClone(result);
  invalid.questions[0].domain = domains[8];
  assert.throws(
    () => validateScoringResult(invalid, input),
    /WOUNDED_QUESTION/,
  );
  invalid = structuredClone(result);
  invalid.domains[1].domain = domains[0];
  assert.throws(() => validateScoringResult(invalid, input), /DOMAINS/);
  invalid = structuredClone(result);
  invalid.domains[2].consistency = "Есть противоречие";
  assert.throws(() => validateScoringResult(invalid, input), /CONTRADICTION/);
  const limited = structuredClone(input);
  limited.sources[0].assessable = false;
  assert.throws(
    () => validateScoringResult(result, limited),
    /MATERIAL_NOT_FOR_RATING/,
  );
  limited.sources[0].text = "";
  assert.throws(() => validateScoringResult(result, limited), /UNBOUND_QUOTE/);
  invalid = structuredClone(result);
  invalid.evidence[0].sourceVersion = "new";
  assert.throws(() => validateScoringResult(invalid, input), /UNBOUND_QUOTE/);
  assert.throws(() =>
    validateScoringResult({ ...result, usage: { tokens: 100 } }, input),
  );
  const questionsDenied = structuredClone(input);
  questionsDenied.criteria.operations =
    questionsDenied.criteria.operations.filter((o) => o !== "questions");
  assert.throws(
    () => validateScoringResult(result, questionsDenied),
    /QUESTIONS_NOT_ALLOWED/,
  );
});
test("локальный адаптер и отключённый внешний транспорт не обращаются к сети; ключ не переключает адаптер", async () => {
  const fetchBefore = globalThis.fetch,
    keyBefore = process.env.OPENAI_API_KEY,
    providerBefore = process.env.ASSESSMENT_PROVIDER;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Network forbidden");
  };
  try {
    delete process.env.ASSESSMENT_PROVIDER;
    process.env.OPENAI_API_KEY = "unused-test-value";
    assert.equal(configuredAssessmentProvider(), "local");
    const input = sample(),
      context = {
        inputHash: digest(input),
        scenarioVersion: "structured-fields-v1",
      };
    const result = validateScoringResult(
      await new LocalAssessmentProvider("USER", null).assess(input, context),
      input,
    );
    assert.equal(result.state, "REQUIRES_REVIEW");
    assert.ok(result.domains.every((d) => d.rating === null));
    await assert.rejects(
      new ExternalAssessmentProvider().assess(input, context),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetchBefore;
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyBefore;
    if (providerBefore === undefined) delete process.env.ASSESSMENT_PROVIDER;
    else process.env.ASSESSMENT_PROVIDER = providerBefore;
  }
});
