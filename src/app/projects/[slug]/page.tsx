import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";
import { db } from "@/lib/db";
import { programFor } from "@/lib/catalog";
import { describeWork } from "@/lib/presentation";
import type { ProjectState } from "@/lib/types";
export default async function Project({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ attempt?: string; version?: string }> }) {
  const { slug } = await params, query = await searchParams;
  if (!programFor(slug)) notFound();
  const user = await actor(); const space = await accessFor(user);
  if (space !== "FULL") redirect(space === "GUEST" ? `/login?next=${encodeURIComponent(`/projects/${slug}${query.attempt ? `?attempt=${encodeURIComponent(query.attempt)}` : ""}`)}` : startRoute(space));
  if (!query.attempt) redirect("/my?view=projects#my-projects");
  const work = await db.projectAttempt.findFirst({ where: { id: query.attempt, userId: user!.id, slug }, include: { versions: { orderBy: { revision: "desc" } } } });
  if (!work) notFound();
  const revision = query.version ? Number(query.version) : work.revision;
  if (!Number.isInteger(revision) || revision < 0) notFound();
  const selected = work.versions.find((v) => v.revision === revision);
  if (!selected) notFound();
  return <main className="page wrap"><Link className="text-link" href="/my?view=projects#my-projects">← К личным материалам</Link><div className="page-title"><div><p className="eyebrow">Личный архив</p><h1>{programFor(slug)!.shortTitle}</h1><p>Сохранённая версия {revision}. Эта работа не участвует в новом дереве навыков.</p></div></div><section className="card" style={{ padding: 24, maxWidth: 860 }}><h2>Содержание работы</h2><pre style={{ whiteSpace: "pre-wrap", font: "inherit", lineHeight: 1.6 }}>{describeWork(slug, selected.state as ProjectState, work.context)}</pre><div className="row">{work.versions.map((v) => <Link key={v.id} className="button secondary small" href={`/projects/${slug}?attempt=${work.id}&version=${v.revision}`}>Версия {v.revision}</Link>)}</div></section></main>;
}
