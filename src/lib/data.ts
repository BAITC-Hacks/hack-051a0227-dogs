import { projectMilestones } from "./journey";
import { db } from "./db";
import { materialContext } from "./review-service.server";
import { scoringView } from "./scoring-service.server";
import {
  actor,
  assertApplication,
  requireStaff,
  requireUser,
} from "./security";
export const materialSelect = {
  id: true,
  name: true,
  mime: true,
  size: true,
  kind: true,
  createdAt: true,
} as const;
export async function myData() {
  const u = await actor();
  if (!u) return null;
  const [attempts, application] = await Promise.all([
    db.projectAttempt.findMany({
      where: { userId: u.id },
      include: { versions: { orderBy: { revision: "desc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.application.findUnique({
      where: { userId: u.id },
      include: {
        materials: { select: materialSelect },
        messages: {
          include: { author: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        language: {
          select: { id: true, state: true, revision: true, status: true },
        },
        transfers: true,
        feedback: {
          where: { publishedAt: { not: null } },
          select: {
            id: true,
            observation: true,
            suggestion: true,
            nextAction: true,
            sourceIds: true,
            publishedAt: true,
            decision: { select: { toStage: true } },
          },
          orderBy: { publishedAt: "desc" },
        },
        sources: { include: { corrections: true } },
        versions: { orderBy: { revision: "desc" } },
      },
    }),
  ]);
  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      interests: u.interests,
    },
    attempts,
    milestones: projectMilestones(attempts),
    application: application
      ? {
          ...application,
          stage:
            application.feedback[0]?.decision.toStage ??
            (application.submittedAt
              ? (() => {
                  const publicStages: Record<string, string> = {
                    CLARIFICATION: "CLARIFICATION",
                    LANGUAGE: "LANGUAGE",
                    INTERVIEW: "INTERVIEW",
                    ACCEPT: "DECIDED",
                    DECLINE: "DECIDED",
                    CONTINUE: "REVIEW",
                    REOPEN: "REVIEW",
                  };
                  const previous = [...application.messages]
                    .reverse()
                    .find((m) => publicStages[m.kind]);
                  return previous ? publicStages[previous.kind] : "REVIEW";
                })()
              : "DRAFT"),
          feedback: application.feedback.map((f) => ({
            id: f.id,
            observation: f.observation,
            suggestion: f.suggestion,
            nextAction: f.nextAction,
            sourceIds: f.sourceIds,
            publishedAt: f.publishedAt,
          })),
        }
      : null,
  };
}
export async function loadCandidate(id: string) {
  const u = await requireStaff();
  await assertApplication(id, u);
  const application = await db.application.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { name: true, email: true, interests: true } },
      program: true,
      episodes: { include: { sources: true, annotations: true } },
      sources: {
        include: {
          material: { select: materialSelect },
          corrections: true,
          views: { orderBy: { createdAt: "desc" } },
        },
      },
      materials: { select: materialSelect },
      assessments: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      language: { include: { history: { orderBy: { revision: "desc" } } } },
      messages: {
        include: { author: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      decisions: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      interviews: true,
      domainReviews: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
      transfers: true,
      versions: { orderBy: { revision: "desc" } },
    },
  });
  return {
    ...application,
    scoring: await scoringView(id),
    materialVersion: (await materialContext(db, id)).version,
  };
}
export async function queueData() {
  await requireStaff();
  const applications = await db.application.findMany({
    where: { submittedAt: { not: null } },
    include: {
      user: { select: { name: true, email: true } },
      program: true,
      language: true,
      materials: { select: { id: true } },
      assessments: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" }, take: 1 },
      domainReviews: { orderBy: { createdAt: "desc" } },
      _count: { select: { sources: true, messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return Promise.all(
    applications.map(async (a) => ({ ...a, scoring: await scoringView(a.id) })),
  );
}
export async function interviewData(id: string) {
  const user = await requireStaff();
  const interview = await db.interview.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          user: { select: { name: true } },
          program: true,
          sources: {
            include: {
              material: { select: materialSelect },
              corrections: true,
            },
          },
          domainReviews: { orderBy: { createdAt: "desc" } },
          assessments: { orderBy: { createdAt: "desc" } },
        },
      },
      revisions: { orderBy: { revision: "desc" } },
    },
  });
  if (!interview) return null;
  await assertApplication(interview.applicationId, user);
  return {
    ...interview,
    scoring: await scoringView(interview.applicationId),
    currentMaterialVersion: (await materialContext(db, interview.applicationId))
      .version,
  };
}
export async function ownApplication() {
  const u = await requireUser();
  return db.application.findUnique({ where: { userId: u.id } });
}
