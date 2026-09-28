import { notFound } from "next/navigation";
import Link from "next/link";
import { programFor, SOURCE_URL } from "@/lib/catalog";
import { actor } from "@/lib/security";
import { ProgramInterest } from "@/components/program-interest";
import { External } from "@/components/ui";
export default async function Program({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = programFor(slug);
  if (!p) notFound();
  const u = await actor();
  return (
    <div className="page wrap">
      <div className="breadcrumbs">
        <Link href="/">Проекты</Link>

        <span>Направление</span>
      </div>
      <div className="page-title">
        <div>
          <h1 style={{ maxWidth: 800 }}>{p.title}</h1>
          <p style={{ maxWidth: 690, fontSize: 18 }}>{p.description}</p>
        </div>
      </div>
      <div className="journey-layout">
        <div>
          <div className="next-step">
            <h2>Твой интерес к направлению</h2>
            <p>Программа заявки выбирается тобой. Изучить направления и сохранить выбор можно в заявке.</p>
            <Link href="/apply" className="button dark">
              Открыть заявку
            </Link>
          </div>
          <h2>Что можно изучать глубже</h2>
          <div className="stack" style={{ marginTop: 25 }}>
            {p.disciplines.map((d) => (
              <div className="review-section" key={d}>
                <h3>{d}</h3>
              </div>
            ))}
          </div>
          <External href={SOURCE_URL}>
            Описание программы на сайте inVision U
          </External>
          <p className="subtle" style={{ marginTop: 10 }}>
            Названия направлений и дисциплин сверены с публичными страницами
            университета 14 сентября 2026.
          </p>
        </div>
        <aside className="panel">
          <h2>Выбор может меняться</h2>
          <p>
            Сохрани интерес, попробуй деятельность и вернись к решению позже.
            Проект не определяет твою профессию и не даёт баллов при
            поступлении.
          </p>
          <div style={{ marginTop: 24 }}>
            <ProgramInterest
              slug={slug}
              interested={u?.interests.includes(slug) ?? false}
              authenticated={!!u && u.role !== "GUEST"}
            />
          </div>
          <Link href={"/apply?program=" + slug} className="text-link">
            Перейти к заявке
          </Link>
        </aside>
      </div>
    </div>
  );
}
