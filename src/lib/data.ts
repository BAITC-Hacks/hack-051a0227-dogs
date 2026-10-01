import { deskView } from "./vision-desk.server";
import { avatarIdentity, avatarSelect } from "./avatar";
import { projectMilestones } from "./journey";
import { db } from "./db";
import { accessFor } from "./access.server";
import { materialContext } from "./review-service.server";
import { scoringView } from "./scoring-service.server";
import { scoringInput } from "./scoring-input.server";
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
  purpose: true,
  section: true,
  version: true,
  userId: true,
  releasedAt: true,
  createdAt: true,
} as const;
export async function myData() {
  const u = await actor();
  if (!u) return null;
  const full = await accessFor(u) === "FULL";
  const [attempts, application, pointTotal] = await Promise.all([
    full ? db.projectAttempt.findMany({
      where: { userId: u.id },
      include: { versions: { orderBy: { revision: "desc" } } },
      orderBy: { updatedAt: "desc" },
    }) : Promise.resolve([]),
    db.application.findUnique({
      where: { userId: u.id },
      include: {
        materials: { select: materialSelect },
        messages: {
          include: {
            author: { select: { ...avatarSelect, name: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        language: {
          select: { id: true, state: true, revision: true, status: true, result: true },
        },
        interviews: {
          where: { invitationPublishedAt: { not: null } },
          select: {
            id: true,
            scheduledAt: true,
            timezone: true,
            durationMinutes: true,
            status: true,
            calendarStatus: true,
            meetUrl: true,
          },
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
        verificationRequests: {
          where: { status: { in: ["PUBLISHED", "ANSWERED"] } },
          select: {
            id: true,
            questionMessageId: true,
            kind: true,
            claim: true,
            status: true,
            attachments: { select: materialSelect },
          },
        },
        versions: { orderBy: { revision: "desc" } },
      },
    }),
    full ? db.uPointEntry.aggregate({ where: { userId: u.id }, _sum: { amount: true } }) : Promise.resolve({ _sum: { amount: null } }),
  ]);
  return {
    progress: { total: pointTotal._sum.amount ?? 0 },
    user: {
      ...avatarIdentity(u),
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
                    INTERVIEW_CANCELLED: "REVIEW",
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
      user: {
        select: { ...avatarSelect, name: true, email: true, interests: true },
      },
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
        include: {
          author: { select: { ...avatarSelect, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      decisions: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      interviews: {
        include: { calendarOperations: { orderBy: { createdAt: "desc" } } },
      },
      credentialReviews: { orderBy: { createdAt: "desc" } },
      domainReviews: { orderBy: { createdAt: "desc" } },
      feedback: { orderBy: { createdAt: "desc" } },
      transfers: true,
      verificationRequests: { orderBy: { createdAt: "desc" }, take: 30 },
      reReviewCases: { orderBy: { createdAt: "desc" }, take: 30 },
      essayChecks: { orderBy: { createdAt: "desc" }, take: 5 },
      versions: { orderBy: { revision: "desc" } },
    },
  });
  return {
    ...application,
    sources: application.sources.map((source) => {
      const answer = application.messages.find(
        (m) => m.id === source.messageId,
      );
      const question = answer?.replyToId
        ? application.messages.find((m) => m.id === answer.replyToId)
        : undefined;
      return {
        ...source,
        messageContext: answer
          ? {
              author: answer.author.name,
              createdAt: answer.createdAt,
              question: question
                ? {
                    body: question.body,
                    author: question.author.name,
                    createdAt: question.createdAt,
                  }
                : null,
            }
          : undefined,
      };
    }),
    preparation: await deskView(u, id),
    scoring: await scoringView(id),
    verificationSources: (await scoringInput(db, id)).sources
      .filter((source) => source.text && !source.material)
      .map((source) => ({
        id: source.id,
        version: source.version,
        title: source.title,
        kind: source.kind,
        text: source.text,
      })),
    reviewers: await db.user.findMany({
      where: { role: "STAFF" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    materialVersion: (await materialContext(db, id)).version,
  };
}
export async function queueData() {
  await requireStaff();
  const applications = await db.application.findMany({
    where: { submittedAt: { not: null } },
    include: {
      user: { select: { ...avatarSelect, name: true, email: true } },
      program: true,
      language: true,
      materials: { select: { id: true } },
      assessments: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" }, take: 1 },
      domainReviews: { orderBy: { createdAt: "desc" } },
      reReviewCases: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } },
      _count: { select: { sources: true, messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return Promise.all(
    applications.map(async (a) => ({
      ...a,
      scoring: await scoringView(a.id),
      materialVersion: (await materialContext(db, a.id)).version,
    })),
  );
}
export async function interviewData(id: string) {
  const user = await requireStaff();
  const interview = await db.interview.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          user: { select: { ...avatarSelect, name: true } },
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
      calendarOperations: { orderBy: { createdAt: "desc" } },
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
