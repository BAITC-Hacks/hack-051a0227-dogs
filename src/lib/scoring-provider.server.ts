import "server-only";
import { domains } from "./catalog";
import { woundedBoundary } from "./review-contract";
import type { ScoringInput, ScoringResult } from "./scoring-contract";

export interface AssessmentProvider {
  readonly id: "local" | "external";
  assess(
    input: ScoringInput,
    context: { inputHash: string; scenarioVersion: string },
  ): Promise<unknown>;
}
export function isolatedAssessmentEnvironment() {
  return (
    process.env.ASSESSMENT_ENVIRONMENT === "isolated-local" &&
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL ?? "http://invalid").hostname,
    )
  );
}
export function assertPreparedScope(origin: string, scenarioVersion = "") {
  const showcase = scenarioVersion === "showcase-scoring-v1";
  if (
    !isolatedAssessmentEnvironment() ||
    (origin !== "ASSESSMENT_QA" &&
      !(showcase && ["SEED", "QA"].includes(origin)))
  )
    throw new Error("PREPARED_SCOPE_BLOCKED");
}
/** No keyword scoring. Unknown records get only attributed fields and explicit gaps. */
export function factualAssessment(input: ScoringInput): ScoringResult {
  const s =
    input.sources.find((s) => s.assessable && s.text) ?? input.sources[0];
  if (!s) throw new Error("NO_SOURCES");
  return {
    state: "REQUIRES_REVIEW",
    summary: `Выбрана программа «${input.facts.program}». Мотивация и личная роль сохранены как ответы кандидата. Требуется содержательная проверка оснований по областям.`,
    domains: domains.map((domain) => ({
      domain,
      rating: null,
      sufficiency: "Недостаточно",
      consistency: "Не проверено",
      interpretation:
        domain === domains[8]
          ? woundedBoundary
          : "По доступным структурированным сведениям уровень проявления не установлен. Нужна проверка конкретного эпизода сотрудником.",
      evidenceIds: [],
      gaps:
        domain === domains[8]
          ? []
          : [
              "Не установлена связь между конкретным действием и критерием области.",
            ],
    })),
    evidence: s.text
      ? [
          {
            id: "field",
            sourceId: s.id,
            sourceVersion: s.version,
            quote: s.text.slice(0, 500),
            explanation:
              "Дословный фрагмент ответа. Это авторское свидетельство, без подтверждения достоверности или смысловой оценки.",
          },
        ]
      : [],
    contradictions: [],
    questions: input.criteria.operations.includes("questions")
      ? [
          {
            id: "personal-action",
            section: "action",
            sourceId: s.id,
            domain: domains[5],
            gap: "Нужна проверка личного действия",
            text: "Какое конкретное действие в этом эпизоде выполнили вы и по какому материалу можно проследить результат?",
          },
        ]
      : [],
    recommendation: {
      action: "CLARIFICATION",
      reason:
        "Уровни по областям не установлены. Выберите один эпизод и уточните личное действие и доступное основание результата.",
      sourceIds: [s.id],
    },
    feedback: {
      observation: "В заявке сохранены описание опыта и выбранная программа.",
      suggestion:
        "Выделите один эпизод: ваше действие, результат и материал, по которому можно его обсудить.",
      nextAction:
        "Ответьте на уточнение в «Моём пути», когда сотрудник опубликует конкретный вопрос.",
      sourceIds: [s.id],
    },
  };
}
export class LocalAssessmentProvider implements AssessmentProvider {
  readonly id = "local" as const;
  constructor(
    private origin: string,
    private prepared: {
      inputHash: string;
      scenarioVersion: string;
      result: unknown;
    } | null,
  ) {}
  async assess(
    input: ScoringInput,
    context: { inputHash: string; scenarioVersion: string },
  ) {
    if (!this.prepared) return factualAssessment(input);
    assertPreparedScope(this.origin, context.scenarioVersion);
    if (
      this.prepared.inputHash !== context.inputHash ||
      this.prepared.scenarioVersion !== context.scenarioVersion
    )
      return factualAssessment(input);
    return this.prepared.result;
  }
}
/** Transport is deliberately absent from runtime configuration in this release.
 * A future server integration supplies it explicitly, with permitted operations;
 * neither an API key nor an error ever selects another adapter. */
export class ExternalAssessmentProvider implements AssessmentProvider {
  readonly id = "external" as const;
  constructor(
    private transport?: (
      input: ScoringInput,
      context: { inputHash: string; scenarioVersion: string },
    ) => Promise<unknown>,
  ) {}
  async assess(
    input: ScoringInput,
    context: { inputHash: string; scenarioVersion: string },
  ) {
    if (!this.transport) throw new Error("EXTERNAL_TRANSPORT_DISABLED");
    return this.transport(input, context);
  }
}
export function configuredAssessmentProvider() {
  const value = process.env.ASSESSMENT_PROVIDER ?? "local";
  if (value !== "local" && value !== "external")
    throw new Error("ASSESSMENT_CONFIGURATION");
  return value;
}
