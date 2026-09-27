import { z } from "zod";
import { domains } from "./catalog";
import { questionSchema } from "./review-contract";

const text = z.string().trim().min(1).max(4000);
const id = z.string().min(1).max(100);
export const scoringActions = {
  INTERVIEW: "Рассмотреть приглашение на интервью",
  CLARIFICATION: "Уточнить конкретный эпизод",
  LANGUAGE: "Проверить английский",
  CHECK: "Разобрать противоречие или проверить основания",
} as const;
export const ratingSchema = z
  .object({
    label: text,
    value: z.number().nullable(),
  })
  .strict()
  .nullable();
export const evidenceSchema = z
  .object({
    id,
    sourceId: id,
    sourceVersion: id,
    quote: text,
    explanation: text,
  })
  .strict();
export const domainScoreSchema = z
  .object({
    domain: z.enum(domains),
    rating: ratingSchema,
    sufficiency: z.enum(["Недостаточно", "Частично", "Достаточно"]),
    consistency: z.enum([
      "Не проверено",
      "Не обнаружено противоречий",
      "Есть противоречие",
    ]),
    interpretation: text,
    evidenceIds: z.array(id).max(20),
    gaps: z.array(text).max(5),
  })
  .strict();
export const scoringResultSchema = z
  .object({
    state: z.enum(["READY", "REQUIRES_REVIEW"]),
    summary: text,
    domains: z.array(domainScoreSchema).length(9),
    evidence: z.array(evidenceSchema).max(40),
    contradictions: z
      .array(
        z.object({ text, evidenceIds: z.array(id).min(2).max(6) }).strict(),
      )
      .max(10),
    questions: z
      .array(
        questionSchema.extend({ gap: text, domain: z.enum(domains) }).strict(),
      )
      .max(20),
    recommendation: z
      .object({
        action: z.enum(["INTERVIEW", "CLARIFICATION", "LANGUAGE", "CHECK"]),
        reason: text,
        sourceIds: z.array(id).min(1).max(20),
      })
      .strict(),
    feedback: z
      .object({
        observation: text,
        suggestion: text,
        nextAction: text,
        sourceIds: z.array(id).min(1).max(20),
      })
      .strict(),
  })
  .strict();
export type ScoringResult = z.infer<typeof scoringResultSchema>;
export type ScoringDomain = ScoringResult["domains"][number];
export type ScoringCriteria = {
  version: string;
  rubricVersion: number;
  guidance: string;
  levels: { label: string; meaning: string }[];
  numeric: null | {
    rule: "distinct_episodes";
    points: {
      value: number;
      label: string;
      minimumEpisodes: number;
      meaning: string;
    }[];
  };
  ratingDomains: string[];
  operations: ("facts" | "domain_rating" | "questions" | "feedback")[];
};
export type ScoringInput = {
  applicationId: string;
  applicationVersion: { id: string; revision: number };
  materialVersion: string;
  facts: {
    program: string;
    motivation: string;
    experience: string;
    personalRole: string;
  };
  sources: {
    id: string;
    version: string;
    title: string;
    kind: string;
    text: string;
    episodeId: string | null;
    assessable: boolean;
    corrections: { id: string; text: string }[];
    material: { id: string; mime: string; digest: string } | null;
  }[];
  // Audio consent authorizes language processing, not personality interpretation.
  language: {
    revision: number;
    status: string;
    conclusion: string;
    transcripts: { id: string; version: number; text: string }[];
  } | null;
  clarifications: {
    domain: string;
    sourceIds: string[];
    observation: string;
    question: string;
    gap: string;
    materialVersion: string;
  }[];
  criteria: ScoringCriteria;
};

/** Shared boundary for every adapter and for the effective human interpretation. */
export function validateScoringResult(
  raw: unknown,
  input: ScoringInput,
  human = false,
): ScoringResult {
  const result = scoringResultSchema.parse(raw);
  if (new Set(result.domains.map((d) => d.domain)).size !== domains.length)
    throw new Error("DOMAINS");
  const evidence = new Map(result.evidence.map((e) => [e.id, e]));
  if (evidence.size !== result.evidence.length)
    throw new Error("DUPLICATE_EVIDENCE");
  const source = (id: string) => {
    const s = input.sources.find((s) => s.id === id);
    if (!s) throw new Error("FOREIGN_SOURCE");
    return s;
  };
  for (const e of result.evidence) {
    const s = source(e.sourceId);
    if (!s.text || s.version !== e.sourceVersion || !s.text.includes(e.quote))
      throw new Error("UNBOUND_QUOTE");
  }
  for (const d of result.domains) {
    if (
      new Set(d.evidenceIds).size !== d.evidenceIds.length ||
      d.evidenceIds.some((id) => !evidence.has(id))
    )
      throw new Error("EVIDENCE");
    if (d.sufficiency === "Достаточно" && !d.evidenceIds.length)
      throw new Error("SUFFICIENCY");
    if (d.rating) {
      if (
        !human &&
        (!input.criteria.operations.includes("domain_rating") ||
          !input.criteria.ratingDomains.includes(d.domain))
      )
        throw new Error("OPERATION_NOT_ALLOWED");
      if (!d.evidenceIds.length || d.sufficiency === "Недостаточно")
        throw new Error("UNSUPPORTED_RATING");
      if (
        d.evidenceIds.some(
          (id) => !source(evidence.get(id)!.sourceId).assessable,
        )
      )
        throw new Error("MATERIAL_NOT_FOR_RATING");
      if (d.rating.value !== null) {
        const scale = input.criteria.numeric;
        if (!scale) throw new Error("NO_NUMERIC_SCALE");
        const episodes = new Set(
          d.evidenceIds
            .map((id) => source(evidence.get(id)!.sourceId).episodeId)
            .filter(Boolean),
        ).size;
        const point = [...scale.points]
          .sort((a, b) => b.minimumEpisodes - a.minimumEpisodes)
          .find((p) => episodes >= p.minimumEpisodes);
        if (
          !point ||
          point.value !== d.rating.value ||
          point.label !== d.rating.label
        )
          throw new Error("NUMERIC_RULE");
      } else if (
        !input.criteria.levels.some((l) => l.label === d.rating!.label)
      )
        throw new Error("UNKNOWN_LEVEL");
      if (
        d.rating.label === "Устойчивое проявление" &&
        new Set(
          d.evidenceIds
            .map((id) => source(evidence.get(id)!.sourceId).episodeId)
            .filter(Boolean),
        ).size < 2
      )
        throw new Error("REPEATED_EPISODE");
    }
    if (
      d.consistency === "Есть противоречие" &&
      !result.contradictions.some((c) =>
        c.evidenceIds.some((id) => d.evidenceIds.includes(id)),
      )
    )
      throw new Error("CONTRADICTION");
  }
  for (const c of result.contradictions)
    if (
      new Set(c.evidenceIds).size < 2 ||
      c.evidenceIds.some((id) => !evidence.has(id))
    )
      throw new Error("CONTRADICTION_EVIDENCE");
  for (const q of result.questions) {
    source(q.sourceId);
    if (q.domain === domains[8])
      throw new Error("WOUNDED_QUESTION_REQUIRES_HUMAN");
  }
  if (
    !human &&
    result.questions.length &&
    !input.criteria.operations.includes("questions")
  )
    throw new Error("QUESTIONS_NOT_ALLOWED");
  [...result.recommendation.sourceIds, ...result.feedback.sourceIds].forEach(
    source,
  );
  return result;
}

export type ScoringView = {
  criteria: ScoringCriteria;
  runs: {
    id: string;
    status: string;
    current: boolean;
    provider: string;
    scenarioVersion: string;
    materialVersion: string;
    applicationVersion: { id: string; revision: number };
    sources: {
      id: string;
      version: string;
      title: string;
      text: string;
      assessable: boolean;
      episodeId: string | null;
    }[];
    createdAt: string;
    completedAt: string | null;
    criteriaVersion: string;
    criteria: ScoringCriteria;
    result: ScoringResult | null;
    showcaseScore: null | {
      value: number;
      maximum: 100;
      basis: string;
      evidenceIds: string[];
    };
    showcaseAxis: null | {
      criterionId: (typeof domains)[number];
      value: 1 | 2;
      scaleVersion: "prepared-axis-v1";
      basis: string;
      evidenceIds: string[];
    }[];
    reviews: {
      id: string;
      author: string;
      createdAt: string;
      reason: string;
      rejectedEvidenceIds: string[];
      result: ScoringResult;
    }[];
  }[];
};
