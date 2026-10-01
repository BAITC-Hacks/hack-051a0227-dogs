import type { InterviewPlan } from "./review-contract";

type Section = InterviewPlan["questions"][number]["section"];
type Source = { id: string; title: string; content?: string };
type ScoringQuestion = {
  id: string;
  text: string;
  section: Section;
  sourceId: string;
  gap: string;
};
export type InterviewSuggestion = {
  id: string;
  text: string;
  section: Section;
  sourceId: string;
  sourceTitle: string;
  focus: string;
  scoringQuestionId?: string;
};

const showcaseQuestions: Record<string, {
  focus: string;
  section: Section;
  source: string;
  text: string;
}[]> = {
  mira: [
    { focus: "Понять выбор", section: "thinking", source: "Эссе · ответ", text: "После олимпиады вы изменили способ подготовки. Что именно в разборе решений помогло понять вашу ошибку?" },
    { focus: "Уточнить личную роль", section: "action", source: "Опыт и личная роль", text: "Как вы решили разделить встречи по уровню и какую часть занятий вели сами?" },
    { focus: "Обсудить результат", section: "outcome", source: "Опыт и личная роль", text: "Как вы поняли, что новый формат подготовки оказался удобнее участникам, кроме того что встречи продолжились?" },
  ],
  dana: [
    { focus: "Разобрать редактуру", section: "thinking", source: "Эссе · ответ", text: "Как при сокращении цитаты выпускницы исчезло её «пока не решила» и на каком этапе вы это заметили?" },
    { focus: "Уточнить личную роль", section: "action", source: "Опыт и личная роль", text: "Что вы исправили в заметке после повторного прослушивания записи и как согласовали итог с героиней?" },
    { focus: "Проверить перенос опыта", section: "application", source: "Мотивация", text: "Что вы сделаете, если заголовок будущего материала звучит ярко, но герою кажется неточным?" },
  ],
  amir: [
    { focus: "Уточнить измерение", section: "thinking", source: "Опыт и личная роль", text: "Почему первое значение напряжения показалось неверным и как вы проверили настройку прибора?" },
    { focus: "Разделить роли", section: "action", source: "Опыт и личная роль", text: "Какую часть лабораторного тура выполнили вы, а что заметила напарница?" },
    { focus: "Проверить вывод", section: "learning", source: "Эссе · ответ", text: "Как этот случай изменил ваш подход к неожиданному результату на следующих лабораторных работах?" },
  ],
  leya: [
    { focus: "Проверить выборку", section: "thinking", source: "Опыт и личная роль", text: "Как вы нашли шестерых участников, пропускавших занятия, и чьё мнение могло не попасть в эти разговоры?" },
    { focus: "Разобрать вывод", section: "outcome", source: "Эссе · ответ", text: "Как вы отделили проблему времени от стоимости дороги и что передали координатору центра?" },
    { focus: "Предложить продолжение", section: "application", source: "Мотивация", text: "Как бы вы проверили, важна ли стоимость проезда для остальных записавшихся, не делая вывод по шести ответам?" },
  ],
  alina: [
    { focus: "Понять первое решение", section: "thinking", source: "Эссе · ответ", text: "Почему первая подробная инструкция по выбору элективов не помогла участникам начать?" },
    { focus: "Уточнить личный вклад", section: "action", source: "Опыт и личная роль", text: "Какие повторяющиеся вопросы вы записали и что именно изменили в тексте после них?" },
    { focus: "Проверить границу вывода", section: "outcome", source: "Эссе · ответ", text: "Вы пишете, что новой группе было проще. Как вы могли бы проверить это точнее, не опираясь только на впечатление?" },
  ],
  ruslan: [
    { focus: "Разделить вклад", section: "action", source: "Опыт и личная роль", text: "Какие проверки цепи чайника вы делали сами, а когда решение принимал мастер?" },
    { focus: "Разобрать ошибку", section: "thinking", source: "Эссе · ответ", text: "Почему вы сначала заподозрили нагреватель и что в измерениях указало на разъём?" },
    { focus: "Определить следующий шаг", section: "application", source: "Мотивация", text: "Как вы теперь организуете проверку устройства, если первая догадка кажется очень убедительной?" },
  ],
};

/** Questions are interview prompts, not a new assessment of the applicant. */
export function interviewSuggestions(input: {
  origin: string | null;
  email: string | null;
  sources: Source[];
  scoringQuestions?: ScoringQuestion[];
}): InterviewSuggestion[] {
  const sourceByTitle = new Map(input.sources.map((source) => [source.title, source]));
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const alias = input.email?.match(/^([a-z]+)\.showcase@invision\.invalid$/)?.[1];
  if (input.origin === "SHOWCASE_PUBLIC_20260930" && alias && showcaseQuestions[alias]) {
    return showcaseQuestions[alias].flatMap((question, index) => {
      const source = sourceByTitle.get(question.source);
      return source ? [{ id: `${alias}-${index}`, text: question.text, section: question.section,
        sourceId: source.id, sourceTitle: source.title, focus: question.focus }] : [];
    });
  }
  const fromScoring = (input.scoringQuestions ?? []).flatMap((question) => {
    const source = sourceById.get(question.sourceId);
    return source ? [{ id: question.id, text: question.text, section: question.section,
      sourceId: source.id, sourceTitle: source.title, focus: question.gap,
      scoringQuestionId: question.id }] : [];
  });
  const firstSentence = (value: string) => {
    const sentence = value.split(/(?<=[.!?])\s|\n/u)[0].trim();
    return sentence.length > 115 ? `${sentence.slice(0, 112).replace(/\s+\S*$/u, "")}…` : sentence;
  };
  const fallback: InterviewSuggestion[] = [
    { title: "Опыт и личная роль", focus: "Личное действие", section: "action" as Section,
      make: (excerpt: string) => `Вы описали: «${excerpt}» Что в этой истории сделали лично вы, а что — другие участники?` },
    { title: "Эссе · ответ", focus: "Вывод из опыта", section: "learning" as Section,
      make: (excerpt: string) => `В эссе есть эпизод: «${excerpt}» Какой вывод вы из него сделали и где он пригодился после этого?` },
    { title: "Мотивация", focus: "Выбор программы", section: "application" as Section,
      make: (excerpt: string) => `Вы написали: «${excerpt}» Какую конкретную задачу хотели бы попробовать решить в первый год учёбы?` },
  ].flatMap((template, index) => {
    const source = sourceByTitle.get(template.title);
    const excerpt = source?.content ? firstSentence(source.content) : "";
    return source && excerpt ? [{ id: `source-${index}`, text: template.make(excerpt),
      section: template.section, sourceId: source.id, sourceTitle: source.title, focus: template.focus }] : [];
  });
  return [...fromScoring, ...fallback.filter((suggestion) =>
    !fromScoring.some((question) => question.sourceId === suggestion.sourceId && question.section === suggestion.section),
  )].slice(0, 4);
}
