import "server-only";
import { domains } from "./catalog";
import { assessmentFacts, digest } from "./scoring-input.server";
import { preparedStory } from "./scoring-scenarios.server";
import { factualAssessment } from "./scoring-provider.server";
import {
  validateScoringResult,
  type ScoringInput,
  type ScoringResult,
} from "./scoring-contract";
import {
  twinRulesVersion,
  type PreparedTwin,
  type TwinVariant,
} from "./twin-contract";

export const twinCases = [
  {
    key: "style",
    title: "Форма изложения",
    purpose: "Одинаковые действия и числа в обычном и литературном описании.",
    factor: "Только формулировка опыта",
    expected: "Оценка опыта не меняется из-за литературной формы.",
  },
  {
    key: "background",
    title: "Школа и регион вне оценки",
    purpose: "Проверить исключение неоценочных полей до обработки.",
    factor: "Школа и регион в контрольных исходных данных",
    expected:
      "В оценочных пакетах нет школы и региона; их содержимое одинаково.",
  },
  {
    key: "duplicate",
    title: "Один проект в двух источниках",
    purpose: "Повторный рассказ не становится вторым достижением.",
    factor: "Добавлено второе описание того же библиотечного проекта",
    expected:
      "Один жизненный эпизод; повтор не повышает уровень и не создаёт независимого подтверждения.",
  },
  {
    key: "role",
    title: "Содержательное изменение роли",
    purpose: "Отделить чувствительность к фактам от устойчивости к форме.",
    factor: "Опрос и сравнение расписаний выполнены другим участником",
    expected:
      "Меняются основания, интерпретация или вопросы. Рост оценки не требуется.",
  },
  {
    key: "language",
    title: "Язык отдельно от опыта",
    purpose: "Другое языковое заключение не переписывает опыт.",
    factor: "Только отдельное языковое заключение",
    expected:
      "Оценка опыта сохраняется. Не требуем совпадения языкового заключения.",
  },
  {
    key: "lost-fact",
    title: "Непригодная пара: потерян результат",
    purpose: "Не засчитать удалённый результат как изменение стиля.",
    factor: "В изменённом тексте отсутствует число участников",
    expected: "Пара не пригодна для проверки формы изложения.",
  },
  {
    key: "criteria",
    title: "Непригодная пара: другие критерии",
    purpose: "Не смешивать разные рубрики в проверке формы.",
    factor: "Версия критериев второго варианта",
    expected: "Результаты не сопоставляются как проверка устойчивости.",
  },
  {
    key: "divergence",
    title: "Расхождение при той же оценке",
    purpose: "Контроль обнаружения разных оснований при одинаковом уровне.",
    factor:
      "Форма изложения; отдельно подготовлена спорная интерпретация результата",
    expected:
      "Механизм замечает различие достаточности, оснований или объяснения, даже если уровень одинаков.",
  },
] as const;
export type TwinCaseKey = (typeof twinCases)[number]["key"];
const literary =
  "В школьной библиотеке я организовала цикл из четырёх встреч читателей. Сначала я опросила 12 участников, затем сопоставила два расписания и предложила субботу для встречи. Команда распределила роли ведущего и редактора. Журнал нашего проекта фиксирует 48 участников за четыре встречи; эти записи не являются независимой проверкой. Готовя следующую встречу, я заранее выяснила предпочтения участников по времени.";
const changedRole =
  "В школьной библиотеке я организовала четыре встречи читателей. Редактор опросил 12 участников, сравнил два расписания и предложил перенести встречу на субботу. Команда распределила роли ведущего и редактора. На четыре встречи пришли 48 участников; это записи нашего журнала, а не независимая проверка. На следующей встрече я заранее собрала предпочтения по времени.";
const otherRole =
  "Я организовала встречи и заранее собрала предпочтения для следующей. Опрос 12 участников и сравнение расписаний выполнил редактор.";
const lostResult =
  "В школьной библиотеке я организовала четыре встречи читателей. Я опросила 12 участников, сравнила два расписания и предложила перенести встречу на субботу. Команда распределила роли ведущего и редактора. Число посетителей в этом описании не приведено. Журнал проекта не проходил независимую проверку. На следующей встрече я заранее собрала предпочтения по времени.";
const repeat =
  "Повторное описание того же библиотечного проекта: я опросила 12 участников и сравнила два расписания. Всего на четыре встречи пришли 48 участников по нашему журналу. Независимой проверки журнала нет.";
const commonFacts = [
  {
    id: "role",
    label: "Личная роль",
    value: "Автор организует встречи, проводит опрос и сравнивает расписания",
  },
  {
    id: "actions",
    label: "Действия и последовательность",
    value:
      "Опрос → два расписания → предложение субботы → предпочтения перед следующей встречей",
  },
  {
    id: "numbers",
    label: "Числа",
    value: "4 встречи, 12 опрошенных, 2 расписания",
  },
  {
    id: "result",
    label: "Результат",
    value: "48 участников за четыре встречи",
  },
  {
    id: "confirmation",
    label: "Степень подтверждения",
    value: "Рассказ и журнал проекта; без независимой проверки",
  },
  {
    id: "episode",
    label: "Жизненный эпизод",
    value: "Один библиотечный проект",
  },
];
const gap = "Способ подсчёта участников требует проверки.";
const roleGap = "Нужно уточнить личный вклад в выбор расписания.";
const interpretation =
  "В одном библиотечном проекте описаны собственные действия и работа команды. Журнал остаётся свидетельством автора, без независимого подтверждения.";

// These are independently authored response specifications, not a copy of run A's output.
type ResponseSpec = {
  rated: number[];
  enough: number[];
  grounds: "both" | "experience" | "repeated";
  text: string;
  gap: string;
  action: "INTERVIEW" | "CLARIFICATION";
  reason: string;
  question?: string;
};
const originalResponse: ResponseSpec = {
  rated: [2, 3, 5, 6],
  enough: [5],
  grounds: "both",
  text: interpretation,
  gap,
  action: "INTERVIEW",
  reason: "Обсудить учёт участников и личные действия в одном проекте.",
};
const changedResponses: Record<TwinCaseKey, ResponseSpec> = {
  style: {
    rated: [2, 3, 5, 6],
    enough: [5],
    grounds: "both",
    text: interpretation,
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
  background: {
    rated: [2, 3, 5, 6],
    enough: [5],
    grounds: "both",
    text: interpretation,
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
  duplicate: {
    rated: [2, 3, 5, 6],
    enough: [5],
    grounds: "repeated",
    text: interpretation,
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
  role: {
    rated: [3, 5],
    enough: [],
    grounds: "experience",
    text: "Опрос и сравнение расписаний принадлежат редактору. Автору можно отнести организацию встреч и сбор предпочтений; выбор подхода нужно уточнить.",
    gap: roleGap,
    action: "CLARIFICATION",
    reason: "Уточнить, какое решение о расписании принимал сам автор.",
  },
  language: {
    rated: [2, 3, 5, 6],
    enough: [5],
    grounds: "both",
    text: interpretation,
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
  "lost-fact": {
    rated: [2, 3, 5, 6],
    enough: [],
    grounds: "experience",
    text: "Действия описаны, но число участников отсутствует. Необходимо уточнить результат.",
    gap,
    action: "CLARIFICATION",
    reason: "Уточнить результат и способ его учёта.",
    question: "Какой результат получился и как вы учитывали участников?",
  },
  criteria: {
    rated: [2, 3, 5, 6],
    enough: [5],
    grounds: "both",
    text: interpretation,
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
  divergence: {
    rated: [2, 3, 5, 6],
    enough: [],
    grounds: "experience",
    text: "Действия автора описаны. Для результата использован только общий рассказ; отдельное поле роли не учтено. Достаточность требует разбора.",
    gap,
    action: "INTERVIEW",
    reason: "Обсудить учёт участников и личные действия в одном проекте.",
  },
};
function response(input: ScoringInput, spec: ResponseSpec): ScoringResult {
  const result = factualAssessment(input);
  const source = input.sources.find((s) => s.title === "Опыт и личная роль")!;
  result.state = "READY";
  result.summary = spec.text;
  result.evidence = [
    {
      id: "action",
      sourceId: source.id,
      sourceVersion: source.version,
      quote: input.facts.experience,
      explanation: "Описание одного проекта со слов автора.",
    },
  ];
  if (spec.grounds !== "experience")
    result.evidence.push({
      id: "role",
      sourceId: source.id,
      sourceVersion: source.version,
      quote: input.facts.personalRole,
      explanation: "Личная роль в том же проекте; не отдельное достижение.",
    });
  if (spec.grounds === "repeated") {
    const additional = input.sources.find(
      (s) => s.title === "Повторное описание проекта",
    )!;
    result.evidence.push({
      id: "action-repeat",
      sourceId: additional.id,
      sourceVersion: additional.version,
      quote: repeat,
      explanation: "Описание одного проекта со слов автора.",
    });
  }
  for (const index of [2, 3, 5, 6])
    Object.assign(result.domains[index], {
      rating: spec.rated.includes(index)
        ? { label: "Есть проявление", value: null }
        : null,
      sufficiency: spec.enough.includes(index) ? "Достаточно" : "Частично",
      consistency: "Не обнаружено противоречий",
      interpretation: spec.text,
      evidenceIds: result.evidence.map((e) => e.id),
      gaps: [spec.gap],
    });
  result.questions = [
    {
      id: spec.gap === roleGap ? "personal-choice" : "participant-count",
      section: spec.gap === roleGap ? "action" : "outcome",
      domain: domains[5],
      gap: spec.gap,
      sourceId: source.id,
      text:
        spec.question ??
        (spec.gap === roleGap
          ? "Как вы лично участвовали в выборе расписания?"
          : "Как учитывались 48 участников: это посещения или разные люди?"),
    },
  ];
  result.recommendation = {
    action: spec.action,
    reason: spec.reason,
    sourceIds: [source.id],
  };
  result.feedback = {
    observation: spec.text,
    suggestion: spec.gap,
    nextAction: "Подготовьте пояснение к обсуждению этого эпизода.",
    sourceIds: [source.id],
  };
  return validateScoringResult(result, input);
}
export function prepareTwin(
  base: ScoringInput,
  key: TwinCaseKey,
): PreparedTwin {
  // Bind only this existing fictional story, never reinterpret arbitrary applications.
  preparedStory(base, "rich");
  const meta = twinCases.find((c) => c.key === key);
  if (!meta) throw new Error("UNKNOWN_TWIN_CASE");
  const variants = {} as PreparedTwin["variants"];
  const prepared = {} as PreparedTwin["prepared"];
  for (const side of ["A", "B"] as const) {
    const input = structuredClone(base);
    const facts = structuredClone(commonFacts);
    let background: TwinVariant["background"] = null;
    if (key === "background") {
      background =
        side === "A"
          ? { school: "Школа на Озёрной", region: "Алматы" }
          : { school: "Школа у реки", region: "Северный район" };
      input.facts = assessmentFacts(
        {
          ...input.facts,
          school: background.school,
          region: background.region,
        },
        input.facts.program,
      );
    }
    if (side === "B") {
      if (key === "style" || key === "divergence")
        input.facts.experience = literary;
      if (key === "role") {
        input.facts.experience = changedRole;
        input.facts.personalRole = otherRole;
        facts[0].value =
          "Автор организует встречи; опрос и сравнение расписаний выполняет редактор";
        facts[1].value =
          "Редактор: опрос → сравнение → предложение субботы. Автор: предпочтения перед следующей встречей";
      }
      if (key === "lost-fact") {
        input.facts.experience = lostResult;
        facts[3].value = "Число участников не указано";
      }
      if (key === "criteria")
        input.criteria = {
          ...input.criteria,
          version: "comparison-control-rubric-2",
          rubricVersion: 2,
          guidance:
            "Другая контрольная рубрика. Её нельзя сопоставлять с рубрикой исходного варианта.",
        };
    }
    const source = input.sources.find((s) => s.title === "Опыт и личная роль")!;
    if (!source.episodeId) throw new Error("TWIN_EPISODE_UNLINKED");
    source.text = `${input.facts.experience}\n\nЛичная роль: ${input.facts.personalRole}`;
    source.version = digest({
      content: source.text,
      corrections: source.corrections,
      material: source.material,
    });
    if (side === "B" && key === "duplicate")
      input.sources.push({
        ...source,
        id: source.id + "-repeat",
        title: "Повторное описание проекта",
        text: repeat,
        version: digest(repeat),
      });
    if (key === "language")
      input.language = {
        revision: side === "A" ? 1 : 2,
        status: side === "A" ? "PENDING_REVIEW" : "REVIEWED",
        conclusion:
          side === "A"
            ? "Нужно перепроверить письменный английский."
            : "Письменный ответ рассмотрен сотрудником; для устной части нужен отдельный ответ.",
        transcripts: [],
      };
    input.materialVersion = digest({
      facts: input.facts,
      sources: input.sources,
      language: input.language,
    });
    const inputHash = digest(input);
    const variant: TwinVariant = {
      input,
      inputHash,
      facts,
      background,
      provider: "local",
      processingVersion: "assessment-contract-v1",
      rulesVersion: twinRulesVersion,
      scenarioVersion: `library-${key}-${key === "lost-fact" ? "v2" : "v1"}-${side}`,
      sourceLinks: input.sources.map((s) => ({
        sourceId: s.id,
        key:
          s.title === "Повторное описание проекта"
            ? "Опыт и личная роль"
            : s.title,
        episode:
          s.episodeId === source.episodeId && s.episodeId
            ? "library-project"
            : null,
      })),
      evidenceLinks: {
        action: "project-actions",
        role: "personal-role",
        "action-repeat": "project-actions",
      },
      gapLinks: { [gap]: "result-verification", [roleGap]: "personal-choice" },
    };
    variants[side] = variant;
    prepared[side] = {
      inputHash,
      result: response(
        input,
        side === "A" ? originalResponse : changedResponses[key],
      ),
    };
  }
  return {
    ...meta,
    version: key === "lost-fact" ? "library-lost-fact-v2" : "library-pairs-v1",
    domains: [domains[2], domains[3], domains[5], domains[6]],
    preserved: commonFacts
      .map((f) => f.id)
      .filter((id) => key !== "role" || !["role", "actions"].includes(id)),
    changed: key === "role" ? ["role", "actions"] : [],
    suitability:
      key === "lost-fact"
        ? "Число участников потеряно: такая пара не проверяет только форму."
        : key === "criteria"
          ? "Рубрики отличаются: пара непригодна для заявленной проверки."
          : "Сохраняемые факты сверены в подготовленном манифесте. Сотрудник должен проверить их по двум текстам; автоматического понимания перефразирования здесь нет.",
    tolerance:
      key === "duplicate"
        ? "Число источников и цитат может отличаться. Сопоставляются связанные факты и уникальный эпизод, а не число файлов."
        : key === "language"
          ? "Языковое заключение исключено из сопоставления опыта; его изменение показано отдельно."
          : "Числовых допусков нет. Любое изменение проверяемого поля или текста интерпретации требует разбора.",
    variants,
    prepared,
  };
}
export function publicTwin(pair: PreparedTwin) {
  const { prepared: _prepared, ...definition } = pair;
  void _prepared;
  return definition;
}
