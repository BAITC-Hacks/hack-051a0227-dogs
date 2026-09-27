import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";
import { WorkshopChoices } from "@/components/journey-actions";

export default async function World() {
  const space = await accessFor(await actor());
  if (space !== "FULL")
    redirect(space === "GUEST" ? "/login?next=/world" : startRoute(space));
  return (
    <div className="page wrap world-entry">
      <div className="page-title">
        <div>
          <p className="eyebrow">Добровольная практика</p>
          <h1>inVision World</h1>
          <p>
            Попробуй задачи направлений, сохрани решение и вернись к нему позже.
          </p>
        </div>
        <Link className="button secondary" href="/my">
          Вернуться в мой путь
        </Link>
      </div>
      <WorkshopChoices title="Выбери задачу" />
    </div>
  );
}
