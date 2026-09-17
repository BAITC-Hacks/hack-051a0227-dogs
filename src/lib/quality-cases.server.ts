import "server-only";
import { domains } from "./catalog";
import {
  assessmentStories,
  clarifiedAction,
  preparedStory,
  type StoryKey,
} from "./scoring-scenarios.server";
import { assessmentFacts, digest } from "./scoring-input.server";
import { LocalAssessmentProvider } from "./scoring-provider.server";
import { prepareTwin } from "./twin-cases.server";
import {
  validateScoringResult,
  type ScoringInput,
  type ScoringCriteria,
  type ScoringResult,
} from "./scoring-contract";

// Only authored fictional inputs. Expected assertions live in tests/quality/expectations.ts.
// Never includes real applications, private projects, or human benchmark annotations.
export const qualityCaseVersion = "coverage-cases-v2";
export const qualityCases = [
  { key: "rich", title: "Библиотечные встречи", family: "library" },
  { key: "generic", title: "Школьная инициатива", family: "initiative" },
  { key: "unclear", title: "Обмен книгами", family: "books" },
  {
    key: "duplicate",
    title: "Библиотечные встречи · материалы",
    family: "library",
  },
  { key: "conflict", title: "Запись на встречу", family: "meeting" },
  { key: "missing", title: "Музейный маршрут", family: "museum" },
  { key: "clarified", title: "Обмен книгами · переписка", family: "books" },
  { key: "language", title: "Школьная выставка", family: "exhibition" },
  {
    key: "sensitive",
    title: "Библиотечные встречи · пояснение",
    family: "library",
  },
  { key: "unavailable", title: "Архив встречи", family: "archive" },
  {
    key: "criteria",
    title: "Библиотечные встречи · критерии",
    family: "library",
  },
  { key: "unknown", title: "Дежурства мастерской", family: "workshop" },
] as const;
export type QualityCaseKey = (typeof qualityCases)[number]["key"];
export function caseDefinition(key: string) {
  const def = qualityCases.find((c) => c.key === key);
  if (!def) throw new Error("UNKNOWN_CONTROL_CASE");
  return def;
}
export function controlInput(key: QualityCaseKey): ScoringInput {
  const storyKey: StoryKey = ["unclear", "clarified"].includes(key)
    ? "unclear"
    : key === "conflict"
      ? "conflict"
      : key === "language"
        ? "language"
        : "rich";
  const story = assessmentStories[storyKey];
  const input: ScoringInput = {
    applicationId: `control-${key}`,
    applicationVersion: { id: `submitted-${key}`, revision: 1 },
    materialVersion: `${qualityCaseVersion}-${key}`,
    facts: assessmentFacts(story, "Цифровые продукты"),
    sources: [
      {
        id: `${key}-experience`,
        version: "v1",
        title: "Опыт и личная роль",
        kind: "Анкета",
        text: `${story.experience}\n\nЛичная роль: ${story.personalRole}`,
        episodeId: `${key}-project`,
        assessable: true,
        corrections: [],
        material: null,
      },
      {
        id: `${key}-motivation`,
        version: "v1",
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
      version: "control-rubric-1",
      rubricVersion: 1,
      guidance:
        "Личное действие в одном эпизоде или нескольких разных эпизодах. Связь с областью проверяет сотрудник; количество материалов не определяет достаточность.",
      levels: [
        {
          label: "Есть проявление",
          meaning:
            "Описано связанное с критерием личное действие в одном эпизоде.",
        },
        {
          label: "Устойчивое проявление",
          meaning:
            "Связанные с критерием действия в нескольких разных эпизодах; повтор рассказа не считается новым эпизодом.",
        },
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
  const replace = (experience: string, role: string, motivation: string) => {
    input.facts = {
      ...input.facts,
      experience,
      personalRole: role,
      motivation,
    };
    input.sources[0].text = `${experience}\n\nЛичная роль: ${role}`;
    input.sources[1].text = motivation;
  };
  if (key === "generic")
    replace(
      "Я прирождённый лидер, всегда вдохновляю окружающих и достигаю исключительных результатов.",
      "Я умею вести людей к успеху.",
      "Хочу стать лучшей версией себя и изменить мир.",
    );
  if (key === "missing")
    replace(
      "Начал исследовать маршрут по школьному музею. Результат ещё не описан.",
      "",
      "Хочу проверить, как посетители выбирают экспонаты.",
    );
  if (key === "unknown")
    replace(
      "Я составил таблицу дежурств школьной мастерской. Сравнил время трёх групп. После обсуждения поменял два дежурства.",
      "Собрал доступное время и изменил таблицу. Инструменты распределял другой участник.",
      "Хочу изучать проверку сервиса на конкретных ограничениях.",
    );
  if (key === "clarified")
    input.sources.push({
      ...input.sources[0],
      id: `${key}-reply`,
      version: "v2",
      title: "Ответ в переписке",
      text: clarifiedAction,
    });
  if (key === "language") {
    input.sources.push({
      ...input.sources[1],
      id: `${key}-english`,
      title: "Письменный языковой ответ",
      text: "I moved the time selection before contact details after observing visitors.",
      assessable: false,
    });
    input.language = {
      revision: 1,
      status: "PENDING_REVIEW",
      conclusion: "Ответ ожидает отдельной проверки.",
      transcripts: [],
    };
  }
  if (key === "sensitive") {
    replace(story.experience, story.personalRole, story.motivation);
    input.sources.push({
      ...input.sources[1],
      id: `${key}-privacy`,
      title: "Пояснение кандидата",
      text: "Не хочу раскрывать личные трудные обстоятельства.",
      assessable: false,
    });
  }
  if (key === "unavailable") {
    input.facts = {
      program: "Цифровые продукты",
      motivation: "",
      experience: "",
      personalRole: "",
    };
    input.sources = [
      {
        ...input.sources[0],
        title: "Документ об опыте",
        kind: "Документ",
        text: "",
        assessable: false,
        material: {
          id: "control-unavailable",
          mime: "application/pdf",
          digest: "unavailable-material-v1",
        },
      },
    ];
  }
  if (key === "criteria") {
    input.criteria.version = "control-rubric-2";
    input.criteria.rubricVersion = 2;
  }
  // Source versions bind content, not a mutable label.
  for (const source of input.sources)
    source.version = digest({ text: source.text, material: source.material });
  if (key === "duplicate") {
    const pair = prepareTwin(controlInputForDuplicate(), "duplicate");
    return pair.variants.B.input;
  }
  return input;
}
export type ControlPackage = {
  key: QualityCaseKey;
  title: string;
  version: string;
  family: string;
  input: ScoringInput;
  inputHash: string;
  profileVersion: string;
  result: ScoringResult | null;
  issue: string | null;
};
export async function controlPackage(
  key: QualityCaseKey,
  damaged = false,
  criteria?: ScoringCriteria,
): Promise<ControlPackage> {
  const def = caseDefinition(key),
    input = controlInput(key);
  if (criteria && key !== "criteria") input.criteria = criteria;
  const inputHash = digest(input);
  let prepared: ScoringResult | null = null;
  const canPrepare =
    input.criteria.rubricVersion === 1 && !input.criteria.numeric;
  if (
    canPrepare &&
    ["rich", "unclear", "conflict", "language", "clarified"].includes(key)
  )
    prepared = preparedStory(
      input,
      key === "clarified" ? "unclear" : (key as StoryKey),
      key === "clarified",
    );
  if (canPrepare && key === "duplicate")
    prepared = prepareTwin(controlInputForDuplicate(), "duplicate").prepared.B
      .result;
  if (canPrepare && key === "sensitive") {
    const base = structuredClone(input);
    base.sources = base.sources.filter(
      (s) => s.title !== "Пояснение кандидата",
    );
    prepared = preparedStory(base, "rich");
  }
  const scenarioVersion = `${qualityCaseVersion}:${key}`;
  const raw = await new LocalAssessmentProvider(
    "ASSESSMENT_QA",
    prepared ? { inputHash, scenarioVersion, result: prepared } : null,
  ).assess(input, { inputHash, scenarioVersion });
  if (damaged) {
    const r = raw as ScoringResult;
    if (r.evidence[0])
      r.evidence[0].quote =
        "Фрагмент, которого нет в предоставленном материале.";
  }
  let result: ScoringResult | null = null,
    issue: string | null = null;
  try {
    result = validateScoringResult(raw, input);
  } catch {
    issue =
      "Основания профиля не прошли проверку источников и версий. Рассмотрите исходные материалы; этот профиль нельзя использовать.";
  }
  return {
    ...def,
    version: qualityCaseVersion,
    input,
    inputHash,
    profileVersion: digest({ inputHash, scenarioVersion, raw }),
    result,
    issue,
  };
}
function controlInputForDuplicate(): ScoringInput {
  const input = controlInput("rich");
  input.applicationId = "control-duplicate";
  input.applicationVersion = { id: "submitted-duplicate", revision: 1 };
  input.materialVersion = `${qualityCaseVersion}-duplicate`;
  input.sources = input.sources.map((s) => ({
    ...s,
    id: s.id.replace("rich-", "duplicate-"),
    episodeId: s.episodeId?.replace("rich-", "duplicate-") ?? null,
  }));
  return input;
}
