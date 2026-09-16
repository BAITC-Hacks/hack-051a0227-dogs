import { db } from "./db";
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
        language: true,
        transfers: true,
        decisions: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
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
    application,
  };
}
export async function loadCandidate(id: string) {
  const u = await requireStaff();
  await assertApplication(id, u);
  return db.application.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { name: true, email: true, interests: true } },
      program: true,
      episodes: { include: { sources: true } },
      sources: {
        include: { material: { select: materialSelect }, corrections: true },
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
      transfers: true,
      versions: { orderBy: { revision: "desc" } },
    },
  });
}
export async function queueData() {
  await requireStaff();
  return db.application.findMany({
    where: { submittedAt: { not: null } },
    include: {
      user: { select: { name: true, email: true } },
      program: true,
      language: true,
      materials: { select: { id: true } },
      assessments: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { sources: true, messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
export async function interviewData(id: string) {
  await requireStaff();
  return db.interview.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          user: { select: { name: true } },
          program: true,
          sources: true,
          assessments: { orderBy: { createdAt: "desc" } },
        },
      },
      revisions: { orderBy: { revision: "desc" } },
    },
  });
}
export async function ownApplication() {
  const u = await requireUser();
  return db.application.findUnique({ where: { userId: u.id } });
}
