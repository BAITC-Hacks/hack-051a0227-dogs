import { notFound } from "next/navigation";
import { programFor } from "@/lib/catalog";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { ProjectEditor } from "@/components/project-editor";
import { projectMilestones } from "@/lib/journey";
export default async function Project({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ attempt?: string; version?: string; from?: string }>;
}) {
  const { slug } = await params,
    query = await searchParams;
  if (!programFor(slug)) notFound();
  const u = await actor();
  const owned = u
    ? await db.projectAttempt.findMany({
        where: { userId: u.id },
        include: { versions: { orderBy: { revision: "desc" } } },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const attempt = query.attempt
    ? owned.find((a) => a.id === query.attempt && a.slug === slug)
    : owned.find((a) => a.slug === slug && a.context === "WORKSHOP");
  if (query.attempt && !attempt) notFound();
  for (const requested of [query.version, query.from])
    if (
      requested !== undefined &&
      (!/^\d+$/.test(requested) ||
        !attempt?.versions.some((v) => v.revision === Number(requested)))
    )
      notFound();
  const parent = attempt?.parentVersionId
    ? owned
        .flatMap((a) => a.versions.map((v) => ({ attempt: a, version: v })))
        .find((p) => p.version.id === attempt.parentVersionId)
    : undefined;
  return (
    <ProjectEditor
      key={`${attempt?.id ?? slug}-${query.from ?? "current"}-${query.version ?? "latest"}`}
      slug={slug}
      attempt={attempt ?? null}
      authenticated={!!u && u.role !== "GUEST"}
      milestones={projectMilestones(owned)}
      selectedRevision={
        query.version === undefined ? undefined : Number(query.version)
      }
      fromRevision={query.from === undefined ? undefined : Number(query.from)}
      parent={
        parent
          ? {
              attemptId: parent.attempt.id,
              revision: parent.version.revision,
              feedback: parent.version.feedback,
            }
          : undefined
      }
    />
  );
}
