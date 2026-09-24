import Link from "next/link";
import { programFor } from "@/lib/catalog";
import { readMission, missions } from "@/lib/missions";
import { versionCompleted, type Work } from "@/lib/journey";
import type { Feedback } from "@/lib/types";
import { PersonalDeepening } from "./personal-deepening";
export function WorkOutcome({
  work,
  revision,
}: {
  work: Pick<Work, "slug" | "context" | "versions"> & { id?: string };
  revision: number;
}) {
  const v = work.versions.find((v) => v.revision === revision),
    p = programFor(work.slug);
  if (!v || v.revision === 0 || !p) return null;
  const feedback = v.feedback as unknown as Feedback,
    completed = versionCompleted(work, v);
  const done = feedback.checks.filter((c) => c.passed),
    issue = feedback.checks.find((c) => !c.passed);
  return (
    <div className="work-outcome">
      <div className="outcome-direction">
        <p className="eyebrow">Ты попробовал · {p.shortTitle}</p>
        <h3>
          {work.context === "EQUIPMENT"
            ? "Маршрут бронирования оборудования"
            : readMission(v.state)
              ? missions[work.slug].result
              : p.artifact}
        </h3>
        <p>
          {done.length
            ? done
                .slice(0, 2)
                .map((c) => c.detail)
                .join(" ")
            : (issue?.detail ?? feedback.summary)}
        </p>
        {done.length > 0 && issue && (
          <p>
            <strong>
              {issue.label === "Проверка после нового условия"
                ? "Следующая проверка:"
                : "Доработай:"}
            </strong>{" "}
            {issue.detail}
          </p>
        )}
        <p>
          {p.description} Если понравилась эта часть работы, посмотри содержание
          программы.
        </p>
        <div className="button-row">
          <Link className="text-link" href={`/programs/${work.slug}`}>
            Изучить направление
          </Link>
          <Link className="text-link" href="/apply">
            Перейти к заявке
          </Link>
        </div>
      </div>
      {completed && work.context === "WORKSHOP" && work.id && (
        <PersonalDeepening
          key={`${work.id}:${revision}`}
          attemptId={work.id}
          revision={revision}
          slug={work.slug}
        />
      )}
      <p className="subtle">
        {completed
          ? "Условия этой работы выполнены. Можно идти дальше или углубиться по желанию."
          : "Это сохранённый вариант. Можно вернуться к работе и проверить следующее решение."}
      </p>
    </div>
  );
}
