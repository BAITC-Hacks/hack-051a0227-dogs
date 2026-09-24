import { z } from "zod";
import { domains } from "./catalog";
export const profileVersion = "profile-facts-v1";
export const profileTopics = {
  result: "Объяснить результат",
  changes: "Что изменилось?",
  next: "Что попробовать дальше?",
  direction: "Почему это направление?",
  transferred: "Что передано в заявку?",
  feedback: "Разобрать обратную связь",
  application: "Что сейчас с заявкой?",
  assessment: "Объяснить оценку",
  grounds: "Показать основания",
  gaps: "Непроверенные вопросы",
  contradictions: "Посмотреть противоречия",
  clarification: "До и после уточнения",
  interview: "Подготовка и результат интервью",
} as const;
export type ProfileTopic = keyof typeof profileTopics;
export const candidateTopics: ProfileTopic[] = [
  "result",
  "changes",
  "next",
  "direction",
  "transferred",
  "feedback",
  "application",
  "grounds",
];
export const staffTopics: ProfileTopic[] = [
  "assessment",
  "grounds",
  "gaps",
  "contradictions",
  "clarification",
  "transferred",
  "interview",
];
export const profileScopeSchema = z.object({
  applicationId: z.string().max(100).optional(),
  attemptId: z.string().max(100).optional(),
  revision: z.number().int().nonnegative().optional(),
  feedbackId: z.string().max(100).optional(),
  domain: z.enum(domains).optional(),
});
export type ProfileScope = z.infer<typeof profileScopeSchema>;
export type ProfileRef = { key: string; version: string; quote: string };
export type ProfileSource = {
  key: string;
  version: string;
  title: string;
  kind: string;
  text: string;
  origin: string;
  dependencies: { key: string; version: string }[];
  group:
    | "work"
    | "application"
    | "source"
    | "transfer"
    | "interest"
    | "publication"
    | "scoring"
    | "human"
    | "clarification"
    | "interview"
    | "plan"
    | "review"
    | "program"
    | "resource"
    | "personal";
  href?: string;
  current: boolean;
};
export const drive = {
  D: { name: "Disciplined Resilience", title: "Устойчивость" },
  R: { name: "Responsible Innovation", title: "Ответственные инновации" },
  I: { name: "Insightful Vision", title: "Проницательное видение" },
  V: {
    name: "Values-Driven Leadership",
    title: "Лидерство на основе ценностей",
  },
  E: {
    name: "Entrepreneurial Execution",
    title: "Предпринимательское действие",
  },
} as const;
export type DevelopmentRecommendation = {
  key: string;
  configVersion: string;
  kind: "REVISE" | "CONTEXT" | "EXPLAIN";
  title: string;
  basis: string;
  purpose: string;
  completion: string;
  drive: keyof typeof drive | null;
  origin: "Личное продолжение мастерской" | "Опубликованная обратная связь";
  source: ProfileRef;
  attemptId?: string;
  revision?: number;
  versionId?: string;
  href?: string;
};
export type ProfileAction = {
  key: string;
  label: string;
  kind: "LINK" | "ATOLA" | "FEEDBACK";
  href?: string;
  runId?: string;
  questionId?: string;
  sourceId?: string;
};
const referenceSchema = z.object({
  key: z.string(),
  version: z.string(),
  quote: z.string().max(12000),
});
export const profileAnswerSchema = z.object({
  topic: z.enum(
    Object.keys(profileTopics) as [ProfileTopic, ...ProfileTopic[]],
  ),
  text: z.string().max(4000),
  claims: z
    .array(
      z.object({
        text: z.string().max(12000),
        refs: z.array(referenceSchema).min(1),
      }),
    )
    .max(50),
  actions: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        kind: z.enum(["LINK", "ATOLA", "FEEDBACK"]),
        href: z.string().optional(),
        runId: z.string().optional(),
        questionId: z.string().optional(),
        sourceId: z.string().optional(),
      }),
    )
    .max(30),
  dependencies: z.array(z.object({ key: z.string(), version: z.string() })),
  supported: z.boolean(),
});
export type ProfileAnswer = z.infer<typeof profileAnswerSchema>;
export type ProfileTurnView = {
  id: string;
  question: string;
  createdAt: string;
  answer: ProfileAnswer | null;
  stale: boolean;
  unavailable: boolean;
  vision?: {
    proposal: {
      key: string;
      title: string;
      basis: string;
      completion: string;
      digest: string;
      expiresAt: string;
      applied?: boolean;
    } | null;
    operations: string[];
  };
};
export type DevelopmentView = {
  id: string;
  recommendation: DevelopmentRecommendation | null;
  note: string;
  status: "ACTIVE" | "RESULT_SAVED" | "SELF_REPORTED" | "UNAVAILABLE";
  completionSource?: ProfileRef;
  stale: boolean;
  revision: number;
};
export type ProfileView = {
  ownerKey: string;
  draftQuestion?: string;
  vision?: import("./vision-contract").VisionCapability;
  audience: "CANDIDATE" | "STAFF";
  topics: ProfileTopic[];
  works: { id: string; title: string; revision: number }[];
  history: ProfileTurnView[];
  recommendations: DevelopmentRecommendation[];
  steps: DevelopmentView[];
};

/** Exact commands only. This is not semantic recognition of arbitrary text. */
export function resolveProfileTopic(
  text: string,
  previous?: ProfileTopic,
): ProfileTopic | null {
  const normalize = (v: string) =>
    v.toLocaleLowerCase("ru").replace(/[?.!]/g, "").trim();
  const q = normalize(text);
  const exact = Object.entries(profileTopics).find(
    ([, label]) => normalize(label) === q,
  );
  if (exact) return exact[0] as ProfileTopic;
  const followups: Record<string, ProfileTopic | undefined> = {
    "а источник": "grounds",
    "покажи источник": "grounds",
    "покажи источники": "grounds",
    почему: previous,
    "а подробнее": previous,
    "что дальше": "next",
  };
  return followups[q] ?? null;
}
