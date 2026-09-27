import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";
import { db } from "@/lib/db";

export default async function Complete() {
  const user = await actor();
  const space = await accessFor(user);
  if (space !== "FULL" || !user) redirect(startRoute(space));
  const app = await db.application.findUnique({
    where: { userId: user.id },
    select: { submittedAt: true },
  });
  if (!app?.submittedAt) redirect("/my");
  return (
    <div className="page wrap submit-complete">
      <span className="submit-mark" aria-hidden="true">
        ✓
      </span>
      <h1>Заявка отправлена</h1>
      <p>
        Отправленная версия сохранена. Рассмотрение и подготовка материалов
        могут продолжаться в фоне. Следующее действие и сообщения появятся в
        «Моём пути».
      </p>
      <div className="hero-actions">
        <Link className="button primary large" href="/my">
          Открыть мой путь
        </Link>
        <Link className="button secondary large" href="/my?view=university">
          Посмотреть заявку
        </Link>
      </div>
    </div>
  );
}
