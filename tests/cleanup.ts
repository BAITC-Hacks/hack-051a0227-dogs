import type { PrismaClient } from "@prisma/client";

/** Remove only records created by the named integration run; never user or seed data. */
export async function cleanupRun(db: PrismaClient, emails: string[]) {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("Integration cleanup requires a local database.");
  const users = await db.user.findMany({
    where: { origin: "QA", email: { in: emails } },
    select: { id: true },
  });
  for (const { id } of users)
    await db.$transaction(async (tx) => {
      const apps = await tx.application.findMany({
        where: { userId: id, origin: "QA" },
        select: { id: true },
      });
      for (const app of apps) {
        const applicationId = app.id;
        await tx.actionPreview.deleteMany({ where: { applicationId } });
        await tx.correction.deleteMany({
          where: { source: { applicationId } },
        });
        await tx.source.deleteMany({ where: { applicationId } });
        await tx.episode.deleteMany({ where: { applicationId } });
        await tx.interviewVersion.deleteMany({
          where: { interview: { applicationId } },
        });
        await tx.interview.deleteMany({ where: { applicationId } });
        await tx.languageVersion.deleteMany({
          where: { check: { applicationId } },
        });
        await tx.languageCheck.deleteMany({ where: { applicationId } });
        await tx.assessment.deleteMany({ where: { applicationId } });
        await tx.decision.deleteMany({ where: { applicationId } });
        await tx.message.deleteMany({ where: { applicationId } });
        await tx.workTransfer.deleteMany({ where: { applicationId } });
        await tx.material.deleteMany({ where: { applicationId } });
        await tx.applicationVersion.deleteMany({ where: { applicationId } });
        await tx.application.delete({ where: { id: applicationId } });
      }
      await tx.material.deleteMany({ where: { userId: id } });
      await tx.uPointEntry.deleteMany({ where: { userId: id } });
      await tx.learningCompletion.deleteMany({ where: { userId: id } });
      await tx.learningAttempt.deleteMany({ where: { userId: id } });
      await tx.learningMedia.deleteMany({ where: { userId: id } });
      await tx.projectAttempt.deleteMany({ where: { userId: id } });
      await tx.actionPreview.deleteMany({ where: { authorId: id } });
      await tx.googleConnection.deleteMany({ where: { userId: id } });
      await tx.googleOAuthState.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
}
