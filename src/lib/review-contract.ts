import { z } from "zod";
import { domains } from "./catalog";
export const sections = [
  {
    key: "action",
    title: "Действие",
    prompt: "Что вы сделали лично в выбранном эпизоде?",
  },
  {
    key: "thinking",
    title: "Мышление",
    prompt: "Как вы выбирали подход и какие альтернативы рассматривали?",
  },
  {
    key: "outcome",
    title: "Результат",
    prompt: "Что получилось и на каких материалах основан этот вывод?",
  },
  {
    key: "learning",
    title: "Выводы",
    prompt: "Какой вывод вы сделали после этого опыта?",
  },
  {
    key: "application",
    title: "Применение",
    prompt:
      "Где вы уже применили этот вывод или как проверили бы его в новой ситуации?",
  },
] as const;
export const gaps = {
  NONE: "Нет отмеченного пробела",
  PERSONAL_ACTION: "Неясен личный вклад",
  REASONING: "Неясен выбор подхода",
  RESULT: "Не раскрыт результат",
  LEARNING: "Не сформулирован вывод",
  APPLICATION: "Не раскрыто применение вывода",
  GENERAL_ANSWER: "Вопрос задан, ответ остался общим",
  CONTRADICTION: "Есть несогласованность сведений",
} as const;
export const questionTemplates: Record<
  string,
  { section: string; text: string }
> = {
  PERSONAL_ACTION: {
    section: "action",
    text: "Какое действие в этом эпизоде выполнили именно вы, а что сделали другие участники?",
  },
  REASONING: {
    section: "thinking",
    text: "Почему вы выбрали этот подход? Какую альтернативу вы проверяли?",
  },
  RESULT: {
    section: "outcome",
    text: "Что изменилось после вашего действия и как это можно проверить?",
  },
  LEARNING: {
    section: "learning",
    text: "Какой конкретный вывод вы сделали из этого эпизода?",
  },
  APPLICATION: {
    section: "application",
    text: "Как вы применили бы этот вывод в новой ситуации? С какого действия начали бы?",
  },
  GENERAL_ANSWER: {
    section: "action",
    text: "Можете привести один конкретный пример по заданному вопросу?",
  },
  CONTRADICTION: {
    section: "outcome",
    text: "Как вы объясняете отмеченное различие между этими материалами?",
  },
};
export const woundedBoundary =
  "Личные травматические подробности не требуются. Отказ раскрывать такой опыт не снижает оценку; психологическое состояние не определяется.";
const text = z.string().trim().max(4000);
const ids = z.array(z.string().min(1).max(100)).max(30);
export const domainReviewSchema = z.object({
  domain: z.enum(domains),
  sourceIds: ids,
  sufficiency: z.enum([
    "Не рассмотрено",
    "Недостаточно",
    "Частично",
    "Достаточно",
  ]),
  consistency: z.enum([
    "Не проверено",
    "Не обнаружено противоречий",
    "Есть противоречие",
  ]),
  question: text,
  gap: z.enum(
    Object.keys(gaps) as [keyof typeof gaps, ...(keyof typeof gaps)[]],
  ),
  observation: text,
});
export const questionSchema = z.object({
  id: z.string().min(1).max(100),
  section: z.enum(["action", "thinking", "outcome", "learning", "application"]),
  text: z.string().trim().min(5).max(1000),
  sourceId: z.string().max(100),
  reviewId: z.string().max(100).optional(),
});
export const planSchema = z.object({
  questions: z.array(questionSchema).max(30),
  notes: z.string().max(6000),
});
export type InterviewPlan = z.infer<typeof planSchema>;
export const emptyAnswers = {
  action: "",
  thinking: "",
  outcome: "",
  learning: "",
  application: "",
};
export const resultSchema = z.object({
  answers: z.object({
    action: text,
    thinking: text,
    outcome: text,
    learning: text,
    application: text,
  }),
  observation: text.min(10),
  conclusion: text.min(20),
});
export type InterviewResult = z.infer<typeof resultSchema>;
export const feedbackSchema = z.object({
  decisionId: z.string().min(1).max(100),
  observation: text.min(15),
  suggestion: text.min(10),
  nextAction: text.min(10),
  sourceIds: ids.min(1),
});
export type CandidateFeedback = z.infer<typeof feedbackSchema>;
export function feedbackBody(
  v: Pick<CandidateFeedback, "observation" | "suggestion" | "nextAction">,
) {
  return `Наблюдение\n${v.observation}\n\nЧто уточнить или развивать\n${v.suggestion}\n\nСледующий шаг\n${v.nextAction}`;
}
export const reviewActions = {
  CLARIFICATION: "Нужно уточнение",
  CHECK: "Дополнительная проверка",
  LANGUAGE: "Языковая проверка",
  INTERVIEW: "Интервью",
  CONTINUE: "Продолжить рассмотрение",
  FINAL_REVIEW: "Итоговое рассмотрение",
  REOPEN: "Возобновить рассмотрение",
};
