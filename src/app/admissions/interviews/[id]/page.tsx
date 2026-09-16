import { notFound, redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { interviewData } from "@/lib/data";
import { InterviewWorkspace } from "@/components/interview-workspace";
export default async function Interview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  const i = await interviewData((await params).id);
  if (!i) notFound();
  return <InterviewWorkspace interview={i} />;
}
