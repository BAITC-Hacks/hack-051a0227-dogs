import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { actionLabels } from "@/lib/catalog";
import { dateLabel } from "@/lib/client";
import { avatarSelect } from "@/lib/avatar";
import { UserAvatar } from "@/components/user-avatar";
import "./decisions-page.css";

function actionTone(action: string) {
  if (action === "INTERVIEW") return "interview";
  if (action === "DECLINE") return "decline";
  if (action === "ACCEPT") return "accept";
  return "other";
}

function ActionIcon({ action }: { action: string }) {
  if (action === "INTERVIEW") return <CalendarDays size={19} aria-hidden="true" />;
  if (action === "DECLINE") return <X size={19} aria-hidden="true" />;
  return <ClipboardCheck size={19} aria-hidden="true" />;
}

function candidateWord(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return "кандидатов";
  if (count % 10 === 1) return "кандидат";
  if (count % 10 >= 2 && count % 10 <= 4) return "кандидата";
  return "кандидатов";
}

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
    },
    orderBy: { createdAt: "desc" },
  });
  const latest = rows.filter(
    (row, i) =>
      rows.findIndex((item) => item.applicationId === row.applicationId) === i,
  );
  const interviews = latest.filter((decision) => decision.action === "INTERVIEW").length;
  const finalDecisions = latest.filter((decision) =>
    decision.action === "ACCEPT" || decision.action === "DECLINE",
  ).length;

  return (
    <div className="staff-page decisions-page">
      <div className="decisions-heading">
        <div>
          <p className="decisions-eyebrow">Рассмотрение заявок</p>
          <h1>Решения</h1>
          <p className="decisions-intro">
            Последнее сохранённое действие по каждому кандидату и его основание.
          </p>
        </div>
        <Link href="/admissions" className="decisions-back">
          <ArrowLeft size={20} aria-hidden="true" />К кандидатам
        </Link>
      </div>

      {!!latest.length && (
        <>
          <div
            className="decisions-metrics"
            role="group"
            aria-label="Сводка по решениям"
          >
            <div className="decisions-metric candidates">
              <span className="decisions-metric-icon">
                <UsersRound size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{latest.length}</strong>
                <span>{candidateWord(latest.length)} с решением</span>
              </span>
            </div>
            <div className="decisions-metric interviews">
              <span className="decisions-metric-icon">
                <CalendarDays size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{interviews}</strong>
                <span>приглашены на интервью</span>
              </span>
            </div>
            <div className="decisions-metric final">
              <span className="decisions-metric-icon">
                <ClipboardCheck size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{finalDecisions}</strong>
                <span>с предложением или отказом</span>
              </span>
            </div>
          </div>

          <div className="decisions-list">
            {latest.map((decision) => {
              const history = rows.filter(
                (row) =>
                  row.applicationId === decision.applicationId &&
                  row.id !== decision.id,
              );
              return (
                <article className="decisions-card" key={decision.id}>
                  <div className="decisions-person">
                    <UserAvatar user={decision.application.user} size={60} />
                    <div>
                      <h2>{decision.application.user.name}</h2>
                      <p>{decision.application.program.shortTitle}</p>
                    </div>
                  </div>

                  <div className="decisions-detail">
                    <p className="decisions-reason">{decision.reason}</p>
                    <p className="decisions-author">
                      <UserRound size={17} aria-hidden="true" />
                      <span>{decision.author.name}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={decision.createdAt.toISOString()}>
                        {dateLabel(decision.createdAt)}
                      </time>
                    </p>
                    {!!history.length && (
                      <details className="decisions-history">
                        <summary>
                          Предыдущие действия · {history.length}
                        </summary>
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className="decisions-history-entry"
                          >
                            <strong>
                              {actionLabels[item.action] ?? item.action}
                            </strong>
                            <p>{item.reason}</p>
                            <small>
                              {item.author.name} · {dateLabel(item.createdAt)}
                            </small>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>

                  <div className="decisions-controls">
                    <Link
                      className="decisions-open"
                      href={`/admissions/candidates/${decision.applicationId}#decision`}
                    >
                      Открыть решение
                    </Link>
                    <span className={`decisions-status ${actionTone(decision.action)}`}>
                      <ActionIcon action={decision.action} />
                      {actionLabels[decision.action] ?? decision.action}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {!rows.length && (
        <div className="empty decisions-empty">
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
