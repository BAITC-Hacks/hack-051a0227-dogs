import "server-only";
import { privatePurposes } from "./intake-contract";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { domains } from "./catalog";
import { materialContext } from "./review-service.server";
import type { ScoringInput, ScoringCriteria } from "./scoring-contract";

// PostgreSQL jsonb normalizes object-key order. Hash the semantic JSON, not insertion order.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => [k, canonical(value)]),
    );
  return v;
}
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
/** Allowlist shared by production collection and controlled background-isolation checks. */
export function assessmentFacts(
  fields: Record<string, unknown>,
  program: string,
) {
  const value = (key: string) =>
    typeof fields[key] === "string" ? (fields[key] as string) : "";
  return {
    program,
    motivation: value("motivation"),
    experience: value("experience"),
    personalRole: value("personalRole"),
  };
}
const rubricSchema = z.object({
  version: z.number().int().positive(),
  guidance: z.string().min(20),
});
const numericSchema = z.object({
  rule: z.literal("distinct_episodes"),
  points: z
    .array(
      z.object({
        value: z.number().finite(),
        label: z.string().min(1),
        minimumEpisodes: z.number().int().positive(),
        meaning: z.string().min(10),
      }),
    )
    .min(2)
    .max(5),
});
export async function scoringCriteria(
  tx: Prisma.TransactionClient,
): Promise<ScoringCriteria> {
  const rubric = rubricSchema.parse(
    (await tx.setting.findUnique({ where: { key: "rubric" } }))?.value,
  );
  const numericSetting = await tx.setting.findUnique({
    where: { key: "assessmentNumericScale" },
  });
  const numeric = numericSetting
    ? numericSchema.parse(numericSetting.value)
    : null;
  if (
    numeric &&
    (new Set(numeric.points.map((p) => p.value)).size !==
      numeric.points.length ||
      new Set(numeric.points.map((p) => p.minimumEpisodes)).size !==
        numeric.points.length)
  )
    throw new Error("NUMERIC_CONFIGURATION");
  const criteriaBase: Omit<ScoringCriteria, "version"> = {
    rubricVersion: rubric.version,
    guidance: rubric.guidance,
    levels: [
      {
        label: "Есть проявление",
        meaning:
          "Личное действие описано в одном эпизоде и связано с критерием. Рассказ требует человеческой проверки.",
      },
      {
        label: "Устойчивое проявление",
        meaning:
          "Связанные с критерием действия описаны в нескольких разных эпизодах. Повтор рассказа об одном проекте не считается новым эпизодом.",
      },
    ],
    numeric,
    ratingDomains: [
      domains[0],
      domains[1],
      domains[2],
      domains[3],
      domains[5],
      domains[6],
    ],
    operations: ["facts", "domain_rating", "questions", "feedback"],
  };
  return {
    ...criteriaBase,
    version: `${rubric.version}-${digest(criteriaBase).slice(0, 12)}`,
  };
}
export async function scoringInput(
  tx: Prisma.TransactionClient,
  applicationId: string,
): Promise<ScoringInput> {
  const app = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      program: true,
      versions: {
        where: { kind: "SUBMITTED" },
        orderBy: { revision: "desc" },
        take: 1,
      },
      sources: {
        orderBy: { id: "asc" },
        include: {
          material: {
            select: {
              id: true,
              mime: true,
              sha256: true,
              bytes: true,
              purpose: true,
            },
          },
          corrections: { orderBy: { id: "asc" } },
          episode: { select: { mergedIntoId: true } },
        },
      },
      language: true,
      domainReviews: { orderBy: { id: "asc" } },
    },
  });
  const submitted = app.versions[0];
  if (!app.submittedAt || !submitted) throw new Error("NOT_SUBMITTED");
  const criteria = await scoringCriteria(tx);
  const fields =
    (submitted.snapshot as { fields?: Record<string, unknown> }).fields ?? {};
  // Private milestones, activity, test mappings, bytes and contact data never enter the provider contract.
  const sources = app.sources
    .filter(
      (s) =>
        s.title !== "Выбор утверждений" &&
        !(s.material && privatePurposes.includes(s.material.purpose)),
    )
    .map((s) => {
      const material = s.material
        ? {
            id: s.material.id,
            mime: s.material.mime,
            digest:
              s.material.sha256 ??
              digest(Buffer.from(s.material.bytes).toString("base64")),
          }
        : null;
      const corrections = s.corrections.map((c) => ({
        id: c.id,
        text: c.explanation,
      }));
      // A file descriptor is not extracted document text, audio or video understanding.
      const text =
        material || s.kind === "Видео" || s.title.includes("Видеопрезентация")
          ? ""
          : s.content;
      const assessable =
        !material &&
        (["Опыт и личная роль", "Мотивация", "Ответ в переписке"].includes(
          s.title,
        ) ||
          (s.provenance === "SEED_CANDIDATE_ACCOUNT" &&
            (s.title.startsWith("Опыт · ") ||
              s.title === "Почему inVision U")));
      return {
        id: s.id,
        version: digest({ content: s.content, corrections, material }),
        title: s.title,
        kind: s.kind,
        text,
        episodeId: s.episode?.mergedIntoId ?? s.episodeId,
        assessable,
        corrections,
        material,
      };
    });
  // Existing audio consent is scoped to language. Transcripts stay in that separate input branch.
  const consent = await tx.audioConsent.findUnique({
    where: { applicationId },
  });
  const jobs = consent?.granted
    ? await tx.audioJob.findMany({
        where: {
          applicationId,
          status: "COMPLETED",
          consentRevision: consent.revision,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          transcripts: {
            include: { corrections: { orderBy: { version: "desc" }, take: 1 } },
          },
        },
      })
    : [];
  return {
    applicationId,
    applicationVersion: { id: submitted.id, revision: submitted.revision },
    materialVersion: (await materialContext(tx, applicationId)).version,
    facts: assessmentFacts(fields, app.program.title),
    sources,
    language: app.language
      ? {
          revision: app.language.revision,
          status: app.language.status,
          conclusion: app.language.result,
          transcripts: jobs.flatMap((j) =>
            j.transcripts.map((t) => ({
              id: t.id,
              version: t.corrections[0]?.version ?? t.version,
              text: t.corrections[0]?.text ?? t.text,
            })),
          ),
        }
      : null,
    clarifications: app.domainReviews.map((r) => ({
      domain: r.domain,
      sourceIds: r.sourceIds,
      observation: r.observation,
      question: r.question,
      gap: r.gap,
      materialVersion: r.materialVersion,
    })),
    criteria,
  };
}
