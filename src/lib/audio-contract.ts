import { z } from "zod";

export const audioConsentVersion = "openai-audio-v1";
export const audioConsentText =
  "Разрешаю передать в OpenAI эти устные ответы для расшифровки на исходном языке и подготовки сводки по заданию. Передаются записи, их текст и условия задания, без остальных полей заявки. Сводку проверяет сотрудник. Это согласие можно отозвать для будущих запросов; уже переданный запрос нельзя отменить задним числом. Условия хранения внешнего сервиса описаны в его политике обработки данных.";
export const audioInstructionVersion = "content-only-v1";
export const languageTask = {
  version: "workshop-language-v1",
  context:
    "Our open workshop will start at 4 p.m. instead of 2 p.m. because the library hall will be available later. The location has not changed. Participation is free and no previous experience is needed. Please let the visitors know about the new time.",
  oral: "Explain the change to a visitor who planned to arrive at 2 p.m. What should they know? Answer in English.",
  followup:
    "A visitor cannot come at 4 p.m. How would you respond, and what would you need to check with the team? Answer in English.",
  requirements: [
    {
      id: "new-time",
      kind: "oral",
      text: "Объяснить посетителю новое время начала.",
    },
    {
      id: "reason",
      kind: "oral",
      text: "Объяснить причину изменения времени.",
    },
    {
      id: "visitor-information",
      kind: "oral",
      text: "Сообщить полезные условия участия из сообщения команды.",
    },
    {
      id: "response-to-visitor",
      kind: "followup",
      text: "Ответить посетителю, который не может прийти в новое время.",
    },
    {
      id: "check-with-team",
      kind: "followup",
      text: "Указать, что нужно уточнить у команды, не выдавая неизвестное за обещание.",
    },
  ],
} as const;
const ids = z.array(z.string().min(1).max(100)).max(12);
export const audioSummarySchema = z
  .object({
    answerSummary: z
      .array(
        z
          .object({
            id: z.string(),
            text: z.string().min(1).max(800),
            evidenceIds: ids.min(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    taskChecks: z
      .array(
        z
          .object({
            requirementId: z.string(),
            coverage: z.enum([
              "covered",
              "partial",
              "not_addressed",
              "uncertain",
            ]),
            explanation: z.string().min(1).max(600),
            evidenceIds: ids,
          })
          .strict(),
      )
      .max(8),
    evidence: z
      .array(
        z
          .object({
            id: z.string(),
            transcriptId: z.string(),
            version: z.literal(0),
            kind: z.enum(["oral", "followup"]),
            quote: z.string().min(3).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    limitations: z.array(z.string().min(1).max(500)).min(1).max(6),
    pointsForHumanReview: z
      .array(
        z
          .object({
            id: z.string(),
            question: z.string().min(1).max(500),
            evidenceIds: ids,
            requirementId: z.string(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();
export type AudioSummary = z.infer<typeof audioSummarySchema>;
export type TranscriptInput = {
  id: string;
  kind: string;
  text: string;
  version: number;
};

// Exact membership supports navigation and traceability, never proof of semantic correctness.
export function validateAudioSummary(
  value: unknown,
  sources: TranscriptInput[],
  task: typeof languageTask = languageTask,
): AudioSummary {
  const data = audioSummarySchema.parse(value);
  const evidenceIds = new Set(data.evidence.map((e) => e.id));
  const pointIds = [...data.answerSummary, ...data.pointsForHumanReview].map(
    (p) => p.id,
  );
  if (
    evidenceIds.size !== data.evidence.length ||
    new Set(pointIds).size !== pointIds.length
  )
    throw new Error("INVALID_EVIDENCE");
  for (const e of data.evidence) {
    const source = sources.find(
      (s) =>
        s.id === e.transcriptId && s.kind === e.kind && s.version === e.version,
    );
    if (!source || !source.text.includes(e.quote))
      throw new Error("INVALID_EVIDENCE");
  }
  for (const point of [
    ...data.answerSummary,
    ...data.taskChecks,
    ...data.pointsForHumanReview,
  ]) {
    if (point.evidenceIds.some((id) => !evidenceIds.has(id)))
      throw new Error("INVALID_EVIDENCE");
  }
  if (
    new Set(data.taskChecks.map((c) => c.requirementId)).size !==
    task.requirements.length
  )
    throw new Error("INVALID_EVIDENCE");
  for (const c of data.taskChecks) {
    const req = task.requirements.find((r) => r.id === c.requirementId);
    if (
      !req ||
      c.evidenceIds.some(
        (id) => data.evidence.find((e) => e.id === id)?.kind !== req.kind,
      )
    )
      throw new Error("INVALID_EVIDENCE");
    if (["covered", "partial"].includes(c.coverage) && !c.evidenceIds.length)
      throw new Error("INVALID_EVIDENCE");
    if (c.coverage === "not_addressed" && c.evidenceIds.length)
      throw new Error("INVALID_EVIDENCE");
  }
  for (const p of data.pointsForHumanReview)
    if (!task.requirements.some((r) => r.id === p.requirementId))
      throw new Error("INVALID_EVIDENCE");
  return data;
}
export const audioStatusLabels: Record<string, string> = {
  QUEUED: "Ответ ожидает обработки",
  TRANSCRIBING: "Готовится расшифровка",
  SUMMARIZING: "Готовится сводка по заданию",
  RETRY_WAIT: "Обработка прервалась. Повтор будет выполнен автоматически",
  COMPLETED: "Расшифровка и сводка готовы к проверке",
  FAILED: "Обработку не удалось завершить. Оригиналы сохранены",
  UNAVAILABLE: "Ответ доступен для проверки сотрудником",
  CANCELLED: "Дальнейшая обработка остановлена",
  SUPERSEDED: "Эта обработка относится к предыдущим записям",
};
export const activeAudioStatuses = [
  "QUEUED",
  "TRANSCRIBING",
  "SUMMARIZING",
  "RETRY_WAIT",
];
export const audioErrorLabels: Record<string, string> = {
  INVALID_EVIDENCE:
    "Сводку не удалось подтвердить по расшифровке. Сотрудник может проверить сохранённые записи и текст.",
  EMPTY_TRANSCRIPT:
    "Не удалось получить текст речи. Оригинал сохранён для прослушивания; это не языковой результат.",
  INVALID_AUDIO:
    "Запись не удалось прочитать. Оригинал сохранён; можно отправить другой файл.",
  INVALID_DURATION:
    "Длительность записи не подходит для обработки. Можно отправить ответ до трёх минут.",
  PROVIDER_REFUSAL:
    "Сводка не получена. Оригиналы доступны для проверки сотрудником.",
  RETRY_EXHAUSTED:
    "Доступные повторы завершены. Сотрудник может проверить оригиналы.",
  DAILY_BUDGET:
    "На сегодня обработка приостановлена. Оригиналы доступны сотруднику.",
};
