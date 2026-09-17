import { redirect, notFound } from "next/navigation";
import { actor, AppError } from "@/lib/security";
import { workflowList, workflowView } from "@/lib/workflow-service.server";
import { WorkflowWorkspace } from "@/components/workflow-workspace";
export default async function Workflow({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  const { session } = await searchParams;
  let initial, list;
  try {
    initial = session ? await workflowView(session, user) : null;
    list = initial ? null : await workflowList(user);
  } catch (e) {
    if (e instanceof AppError && [403, 404].includes(e.status)) notFound();
    throw e;
  }
  return (
    <WorkflowWorkspace key={session ?? "start"} initial={initial} list={list} />
  );
}
