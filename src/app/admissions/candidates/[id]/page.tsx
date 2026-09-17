import { notFound, redirect } from "next/navigation";
import { audioStatus } from "@/lib/audio-service.server";
import { actor } from "@/lib/security";
import { loadCandidate } from "@/lib/data";
import { db } from "@/lib/db";
import { CandidateReview } from "@/components/candidate-review";
import { queueReturn } from "@/lib/queue-location";
export default async function Candidate({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queue?: string }>;
}) {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  const { id } = await params;
  const exists = await db.application.findUnique({
    where: { id },
    select: { submittedAt: true },
  });
  if (!exists?.submittedAt) notFound();
  const [a, setting] = await Promise.all([
    loadCandidate(id),
    db.setting.findUnique({ where: { key: "rubric" } }),
  ]);
  return (
    <CandidateReview
      returnHref={queueReturn((await searchParams).queue)}
      application={a}
      audio={await audioStatus(id, user)}
      guidance={(setting?.value as { guidance: string })?.guidance ?? ""}
    />
  );
}
