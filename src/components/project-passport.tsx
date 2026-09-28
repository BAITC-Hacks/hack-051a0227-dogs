"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { myData } from "@/lib/data";
import { programFor } from "@/lib/catalog";
import { workHref } from "@/lib/journey";
import { action } from "@/lib/client";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
export function ProjectPassport({ data }: { data: Data }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  return <section className="project-passport" id="my-projects"><div className="section-heading"><h2>Архив личных работ</h2><p>Ранние сохранённые версии остаются у тебя. В заявку попадает только версия, которую ты выберешь сам.</p></div><div className="passport-grid">{data.attempts.map((work) => <article className="passport-project" id={`work-${work.id}`} key={work.id}><h3>{programFor(work.slug)?.shortTitle ?? "Личная работа"}</h3><p>Сохранено версий: {work.versions.length}</p><Link className="button secondary" href={workHref(work, work.revision)}>Открыть архивную версию</Link>{data.application && !data.application.submittedAt && work.revision > 0 && !data.application.transfers.some((t) => t.attemptId === work.id && t.revision === work.revision) && <button type="button" className="button secondary" disabled={busy === work.id} onClick={async () => { setBusy(work.id); try { await action("work.transfer", { attemptId: work.id, revision: work.revision, consent: true }); router.refresh(); } finally { setBusy(""); } }}>Передать эту версию в заявку</button>}</article>)}</div></section>;
}
