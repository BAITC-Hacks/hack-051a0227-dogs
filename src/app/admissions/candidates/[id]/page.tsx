import { notFound, redirect } from "next/navigation";
import { audioStatus } from "@/lib/audio-service.server";
import { actor } from "@/lib/security";
import { loadCandidate } from "@/lib/data";
import { db } from "@/lib/db";
import { CandidateReview } from "@/components/candidate-review";
export default async function Candidate({
  params,
}: {
  params: Promise<{ id: string }>;
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
      application={a}
      audio={await audioStatus(id, user)}
      guidance={(setting?.value as { guidance: string })?.guidance ?? ""}
    />
  );
}
