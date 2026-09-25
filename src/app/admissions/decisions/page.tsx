import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { actionLabels } from "@/lib/catalog";
import { dateLabel } from "@/lib/client";
import { avatarSelect } from "@/lib/avatar";
import { UserAvatar } from "@/components/user-avatar";
export default async function Decisions() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  const rows = await db.decision.findMany({
    include: {
      application: {
        include: {
          user: { select: { ...avatarSelect, name: true } },
          program: { select: { shortTitle: true } },
        },
      },
      author: { select: { name: true } },
      feedback: { select: { publishedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const latest = rows.filter(
    (row, i) =>
      rows.findIndex((r) => r.applicationId === row.applicationId) === i,
  );
  const published = latest.filter((d) =>
    d.feedback.some((f) => f.publishedAt),
  ).length;
  return (
    <div className="staff-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">Рассмотрение заявок</p>
          <h1>Решения</h1>
          <p>
            Последнее действие по каждому кандидату. Основания и предыдущие
            записи остаются рядом.
          </p>
        </div>
        <Link href="/admissions" className="button secondary">
          К кандидатам
        </Link>
      </div>
      {!!latest.length && (
        <>
          <div className="decision-overview">
            <span>
              <strong>{latest.length}</strong> кандидатов с решением
            </span>
            <span>
              <strong>{published}</strong> с опубликованной обратной связью
            </span>
            <span>
              <strong>{latest.length - published}</strong> без публикации по
              последнему решению
            </span>
          </div>
          <div className="decision-list">
            {latest.map((d) => {
              const history = rows.filter(
                (r) => r.applicationId === d.applicationId && r.id !== d.id,
              );
              return (
                <article className="decision-entry" key={d.id}>
                  <div className="decision-person">
                    <UserAvatar user={d.application.user} size={48} />
                    <div>
                      <h2>{d.application.user.name}</h2>
                      <p className="meta">{d.application.program.shortTitle}</p>
                    </div>
                  </div>
                  <div>
                    <h3>{actionLabels[d.action]}</h3>
                    <p className="decision-reason">{d.reason}</p>
                    <p className="meta">
                      {d.author.name} · {dateLabel(d.createdAt)}
                    </p>
                    <span className="tag">
                      {d.feedback.some((f) => f.publishedAt)
                        ? "Обратная связь опубликована"
                        : d.feedback.length
                          ? "Черновик обратной связи"
                          : "Обратная связь не опубликована"}
                    </span>
                    {!!history.length && (
                      <details>
                        <summary>
                          Предыдущие действия · {history.length}
                        </summary>
                        {history.map((h) => (
                          <article key={h.id}>
                            <strong>{actionLabels[h.action]}</strong>
                            <p className="decision-reason">{h.reason}</p>
                            <p className="meta">
                              {h.author.name} · {dateLabel(h.createdAt)}
                            </p>
                          </article>
                        ))}
                      </details>
                    )}
                  </div>
                  <Link
                    className="button secondary"
                    href={`/admissions/candidates/${d.applicationId}#decision`}
                  >
                    Открыть решение
                  </Link>
                </article>
              );
            })}
          </div>
        </>
      )}
      {!rows.length && (
        <div className="empty">
          <h2>Здесь сохранятся решения комиссии</h2>
          <p>
            Откройте заявку, проверьте источники и зафиксируйте следующее
            действие. Решение и публикация обратной связи выполняются отдельно.
          </p>
          <Link href="/admissions" className="button primary">
            Открыть кандидатов
          </Link>
        </div>
      )}
    </div>
  );
}
