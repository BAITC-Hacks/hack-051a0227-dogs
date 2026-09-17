import { z } from "zod";
import type { ScoringInput, ScoringResult } from "./scoring-contract";
export const workflowModes = {
  MATERIALS: "Материалы",
  PROFILE: "Материалы и профиль",
} as const;
export const workflowTask =
  "Найдите существенные основания, отметьте вопросы и предложите следующий шаг рассмотрения. Ответ относится только к этой проверке рабочего процесса.";
const text = z.string().trim().max(4000);
export const workflowWorkSchema = z
  .object({
    evidence: text,
    sourceIds: z.array(z.string().max(100)).max(20),
    questions: text,
    nextAction: z.enum(["", "INTERVIEW", "CLARIFICATION", "LANGUAGE", "CHECK"]),
    reason: text,
    errors: text,
    corrections: text,
  })
  .strict();
export type WorkflowWork = z.infer<typeof workflowWorkSchema>;
export const emptyWorkflowWork: WorkflowWork = {
  evidence: "",
  sourceIds: [],
  questions: "",
  nextAction: "",
  reason: "",
  errors: "",
  corrections: "",
};
export const supportLabels = {
  SUPPORTED: "Поддерживает",
  PARTIAL: "Частично",
  UNSUPPORTED: "Не поддерживает",
  NOT_CHECKED: "Не проверено",
} as const;
export type WorkflowAnnotation = {
  checked: boolean;
  authorId: string;
  at: string;
  version: string;
  support: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "NOT_CHECKED";
  missedEvidence: string[];
  missedQuestions: string[];
  correctionCount: number;
  note: string;
};
export const annotationSchema = z
  .object({
    checked: z.boolean().default(false),
    support: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED", "NOT_CHECKED"]),
    missedEvidence: z.array(z.string().trim().min(5).max(1000)).max(20),
    missedQuestions: z.array(z.string().trim().min(5).max(1000)).max(20),
    correctionCount: z.number().int().min(0).max(100),
    note: text.min(20),
  })
  .strict();
export type WorkflowClock = {
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  pausedMs: number;
};
export function workflowTime(clock: WorkflowClock, now = Date.now()) {
  const end = clock.completedAt ? Date.parse(clock.completedAt) : now;
  const elapsedMs = Math.max(0, end - Date.parse(clock.startedAt));
  const pausedMs = Math.min(
    elapsedMs,
    clock.pausedMs +
      (clock.pausedAt ? Math.max(0, end - Date.parse(clock.pausedAt)) : 0),
  );
  return { elapsedMs, pausedMs, withoutPausesMs: elapsedMs - pausedMs };
}
export type WorkflowView = WorkflowClock & {
  id: string;
  revision: number;
  caseKey: string;
  title: string;
  caseVersion: string;
  mode: keyof typeof workflowModes;
  participant: string;
  technical: boolean;
  order: number;
  familiar: boolean;
  familiarityNote: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  materialVersion: string;
  profileVersion: string | null;
  input: ScoringInput;
  profile: ScoringResult | null;
  profileIssue: string | null;
  work: WorkflowWork;
  savedAt: string;
  annotations: WorkflowAnnotation[];
};
export type WorkflowRow = Omit<
  WorkflowView,
  "input" | "profile" | "profileIssue"
> &
  ReturnType<typeof workflowTime>;
export function workflowSummary(rows: WorkflowRow[]) {
  const completed = rows.filter(
    (r) => !r.technical && r.status === "COMPLETED",
  );
  return {
    completed: completed.length,
    participants: new Set(completed.map((r) => r.participant)).size,
    cases: new Set(
      completed.map(
        (r) => `${r.caseKey}:${r.caseVersion}:${r.materialVersion}`,
      ),
    ).size,
    incomplete: rows.filter((r) => !r.technical && r.status !== "COMPLETED")
      .length,
    technical: rows.filter((r) => r.technical).length,
    modes: Object.keys(workflowModes).map((mode) => {
      const group = completed.filter((r) => r.mode === mode),
        annotated = group.filter((r) => r.annotations.at(-1)?.checked);
      return {
        mode: mode as keyof typeof workflowModes,
        count: group.length,
        familiar: group.filter((r) => r.familiar).length,
        elapsedMs: group.reduce((n, r) => n + r.elapsedMs, 0),
        withoutPausesMs: group.reduce((n, r) => n + r.withoutPausesMs, 0),
        annotated: annotated.length,
        corrections: annotated.reduce(
          (n, r) => n + r.annotations.at(-1)!.correctionCount,
          0,
        ),
        missedEvidence: annotated.reduce(
          (n, r) => n + r.annotations.at(-1)!.missedEvidence.length,
          0,
        ),
        missedQuestions: annotated.reduce(
          (n, r) => n + r.annotations.at(-1)!.missedQuestions.length,
          0,
        ),
      };
    }),
  };
}
export const durationLabel = (ms: number) =>
  `${Math.floor(ms / 60000)} мин ${Math.floor((ms % 60000) / 1000)} с`;
