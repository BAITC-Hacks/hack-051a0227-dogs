import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";

export default async function World() {
  const space = await accessFor(await actor());
  if (space !== "FULL")
    redirect(space === "GUEST" ? "/login?next=/world" : startRoute(space));
  return (
    <div className="page wrap world-entry">
      <div className="page-title">
        <div>
          <p className="eyebrow">Личное пространство</p>
          <h1>inVision World</h1>
          <p>
            Игровое пространство пока без доступных миссий. Новые задания уже есть в дереве навыков.
          </p>
        </div>
        <Link className="button secondary" href="/my">
          Вернуться в мой путь
        </Link>
      </div>
      <section className="card" style={{ maxWidth: 680, padding: 28 }}><h2>Продолжить развитие</h2><p>Выбери направление и пройди интерактивную ситуацию, диалог или короткое задание.</p><Link className="button primary" href="/my?view=route">Открыть дерево навыков</Link></section>
    </div>
  );
}
