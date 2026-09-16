import { notFound } from "next/navigation";
import { programFor } from "@/lib/catalog";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { ProjectEditor } from "@/components/project-editor";
export default async function Project({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!programFor(slug)) notFound();
  const u = await actor();
  const attempt = u
    ? await db.projectAttempt.findFirst({
        where: { userId: u.id, slug },
        orderBy: { updatedAt: "desc" },
        include: { versions: { orderBy: { revision: "desc" } } },
      })
    : null;
  return (
    <ProjectEditor
      slug={slug}
      attempt={attempt}
      authenticated={!!u && u.role !== "GUEST"}
    />
  );
}
