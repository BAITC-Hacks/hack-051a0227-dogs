import { z } from "zod";
export const deskVersion = "vision-desk-facts-v3";
export const deskSourceKinds = ["Анкета", "Мотивация", "Дневник проекта", "Уточнение кандидата", "Учебное упражнение"];
export const deskTools = [
  "application",
  "sources",
  "human_conclusions",
  "work_tasks",
  "meetings",
  "prepare",
] as const;
export const deskModes = {
  local: "Фактическая подготовка",
  openai: "Подготовка с OpenAI",
} as const;
export const deskSettingsSchema = z
  .object({
    provider: z.enum(["local", "openai"]),
    submitted: z.boolean(),
    clarification: z.boolean(),
    interview: z.boolean(),
  })
  .strict();
export type DeskSettings = z.infer<typeof deskSettingsSchema> & {
  enabledAt: string;
  staffId: string;
  revision: number;
};
export const deskConsentSchema = z.object({
  granted: z.boolean(),
  revision: z.number().int().nonnegative(),
  sourceIds: z.array(z.string()).max(30),
  at: z.string(),
});
export const deskSelectionSchema = z
  .object({
    sourceKeys: z.array(z.string()).min(1).max(3),
    questionKind: z.enum([
      "PERSONAL_ACTION",
      "REASONING",
      "RESULT",
      "LEARNING",
      "APPLICATION",
    ]),
  })
  .strict();
export type DeskRef = {
  key: string;
  version: string;
  title: string;
  quote: string;
  origin: string;
  sourceId: string;
};
export type DeskInput = {
  instructionVersion: string;
  applicationId: string;
  candidateName: string;
  hash: string;
  materialVersion: string;
  sources: DeskRef[];
  human: {
    text: string;
    key: string;
    version: string;
    title: string;
    origin: string;
    sourceIds: string[];
  }[];
  tasks: string[];
  meetings: {
    id: string;
    revision: number;
    scheduledAt: string;
    status: string;
  }[];
  pending: boolean;
  hasReply: boolean;
  operations: { tool: string; result: string }[];
  consentRevision: number;
  provider: "local" | "openai";
};
export type DeskResult = {
  summary: string;
  grounds: DeskRef[];
  human: DeskInput["human"];
  changes: string[];
  tasks: string[];
  questions: {
    id: string;
    text: string;
    section: "action" | "thinking" | "outcome" | "learning" | "application";
    sourceId: string;
  }[];
  clarification: string;
  feedback: {
    observation: string;
    suggestion: string;
    nextAction: string;
    sourceIds: string[];
  };
  operations: DeskInput["operations"];
};
export const deskDraftSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("QUESTION"),
      body: z.string().trim().min(15).max(3000),
      sourceIds: z.array(z.string()).min(1).max(10),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ATOLA"),
      questions: z
        .array(
          z.object({
            id: z.string(),
            text: z.string().trim().min(10).max(1000),
            section: z.enum([
              "action",
              "thinking",
              "outcome",
              "learning",
              "application",
            ]),
            sourceId: z.string(),
          }),
        )
        .min(1)
        .max(10),
    })
    .strict(),
]);
export type DeskDraft = z.infer<typeof deskDraftSchema>;
