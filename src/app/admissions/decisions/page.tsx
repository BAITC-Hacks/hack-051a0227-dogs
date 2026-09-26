import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock3,
  MessageSquare,
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
  if (action === "INTERVIEW") return <Check size={19} aria-hidden="true" />;
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
      feedback: { select: { publishedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const latest = rows.filter(
    (row, i) =>
      rows.findIndex((item) => item.applicationId === row.applicationId) === i,
  );
  const published = latest.filter((decision) =>
    decision.feedback.some((feedback) => feedback.publishedAt),
  ).length;

  return (
    <div className="staff-page decisions-page">
      <div className="decisions-heading">
        <div>
          <p className="decisions-eyebrow">Рассмотрение заявок</p>
          <h1>Решения</h1>
          <p className="decisions-intro">
            Последнее сохранённое действие по каждому кандидату и статус
            обратной связи.
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
            <div className="decisions-metric published">
              <span className="decisions-metric-icon">
                <MessageSquare size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{published}</strong>
                <span>с опубликованной обратной связью</span>
              </span>
            </div>
            <div className="decisions-metric pending">
              <span className="decisions-metric-icon">
                <Clock3 size={27} aria-hidden="true" />
              </span>
              <span>
                <strong>{latest.length - published}</strong>
                <span>без публикации по последнему решению</span>
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
              const isPublished = decision.feedback.some(
                (feedback) => feedback.publishedAt,
              );
              const hasDraft = decision.feedback.length > 0;
              return (
                <article className="decisions-card" key={decision.id}>
                  <div className="decisions-person">
                    <UserAvatar user={decision.application.user} size={88} />
                    <div>
                      <h2>{decision.application.user.name}</h2>
                      <p>{decision.application.program.shortTitle}</p>
                    </div>
                  </div>

                  <div className="decisions-detail">
                    <h3
                      className={`decisions-action ${actionTone(decision.action)}`}
                    >
                      <ActionIcon action={decision.action} />
                      {actionLabels[decision.action] ?? decision.action}
                    </h3>
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
                    <span
                      className={`decisions-publication ${isPublished ? "published" : "unpublished"}`}
                    >
                      {isPublished ? (
                        <Check size={17} aria-hidden="true" />
                      ) : (
                        <Clock3 size={17} aria-hidden="true" />
                      )}
                      {isPublished
                        ? "Обратная связь опубликована"
                        : hasDraft
                          ? "Черновик не опубликован"
                          : "Обратная связь не подготовлена"}
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
