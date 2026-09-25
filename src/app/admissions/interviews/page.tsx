import { avatarSelect } from "@/lib/avatar";
import { InterviewsList } from "@/components/interviews-list";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
export default async function Interviews() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  const rows = await db.interview.findMany({
    include: {
      application: {
        include: {
          user: { select: { ...avatarSelect, name: true } },
          program: { select: { shortTitle: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });
  const now = new Date();
  return (
    <InterviewsList
      today={new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Almaty",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now)}
      now={now.getTime()}
      rows={rows.map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        user: row.application.user,
        program: row.application.program.shortTitle,
        scheduledAt: row.scheduledAt.toISOString(),
        performedAt: row.performedAt?.toISOString() ?? null,
        status: row.status,
        hasPlan: row.plan !== null,
      }))}
    />
  );
}
