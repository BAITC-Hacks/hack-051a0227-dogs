import { redirect } from "next/navigation";
import Link from "next/link";
import {   FileText } from "lucide-react";
import { myData } from "@/lib/data";
import { stageLabels, programFor } from "@/lib/catalog";
import type { ApplicationFields } from "@/lib/types";
import { dateLabel } from "@/lib/client";
import { Messages } from "@/components/messages";
import { Tag } from "@/components/ui";
import { PublishedFeedback } from "@/components/published-feedback";
import { DeskConsent } from "@/components/desk-consent";
import { CorrectionForm } from "@/components/correction-form";
export default async function Status() {
  const data = await myData();
  if (!data || data.user.role === "GUEST")
    redirect("/login?next=/apply/status");
  const app = data.application;
  if (!app?.submittedAt) redirect("/apply");
  const fields = app.fields as unknown as ApplicationFields;
  const replied =
    app.messages.at(-1)?.authorId === data.user.id &&
    app.messages.at(-1)?.kind === "MESSAGE";
  return (
    <div className="page wrap">
      <div className="page-title">
        <div>
          <h1>
            {app.stage === "CLARIFICATION"
              ? replied
                ? "Твой ответ у комиссии"
                : "Давай уточним одну деталь"
              : "Заявка сохранена в рассмотрении"}
          </h1>
          <p>{programFor(app.programSlug)?.title}</p>
        </div>
        <Tag tone="blue">{stageLabels[app.stage]}</Tag>
      </div>
      <div className="journey-layout">
        <div>
          <section className="next-step">
            <h2>{stageLabels[app.stage]}</h2>
            <p>
              {app.feedback[0]
                ? app.feedback[0].nextAction
                : app.stage === "CLARIFICATION"
                  ? replied
                    ? "Ответ сохранён в переписке. Сотрудник рассмотрит уточнение и сообщит следующий шаг."
                    : "Сотрудник задал вопрос. Ответь ниже. Сообщение будет сохранено в истории заявки."
                  : app.stage === "LANGUAGE"
                    ? "Комиссия просит пройти отдельную языковую проверку. Технические сложности можно указать в пояснении."
                    : app.stage === "INTERVIEW"
                      ? "Приглашение и время интервью находятся в переписке. Можно задать уточняющий вопрос."
                      : app.stage === "DECIDED"
                        ? "Сотрудник зафиксировал решение и основание. Они доступны ниже в истории."
                        : "Комиссия получила заявку. Следующие действия и вопросы будут появляться в этом разделе."}
            </p>
            {app.stage === "LANGUAGE" ? (
              <Link className="button dark" href="/apply/english">
                Перейти к языковому ответу
              </Link>
            ) : (
              <a href="#messages" className="button dark">
                Сообщения университета
              </a>
            )}
          </section>
          <PublishedFeedback application={app} />
          <DeskConsent applicationId={app.id} initial={app.deskConsent} sources={app.sources.map(s=>({id:s.id,title:s.title,kind:s.kind}))} />
          <section id="messages">
            <h2>Переписка с комиссией</h2>
            <Messages
              applicationId={app.id}
              messages={app.messages.filter((m) => m.kind !== "FEEDBACK")}
            />
          </section>
          <section className="review-section" style={{ marginTop: 35 }}>
            <h2>Отправленная заявка</h2>
            <p className="subtle">
              Версия зафиксирована {dateLabel(app.submittedAt)}. Уточнения
              сохраняются отдельно.
            </p>
            <dl>
              {[
                ["Кандидат", fields.name],
                ["Опыт", fields.experience],
                ["Личная роль", fields.personalRole],
                ["Мотивация", fields.motivation],
              ].map(([label, value]) => (
                <div className="review-item" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="file-list">
              {app.materials.map((m) => (
                <a
                  key={m.id}
                  href={"/api/files/" + m.id}
                  className="file-row"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={16} />
                  <span>{m.name}</span>

                </a>
              ))}
            </div>
            {app.sources
              .filter((s) => s.kind === "Анкета")
              .map((s) => (
                <details className="versions" key={s.id}>
                  <summary>{s.title} · источник</summary>
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
                    {s.content}
                  </p>
                  {s.corrections.map((c) => (
                    <div
                      className="notice info"
                      style={{ marginTop: 14 }}
                      key={c.id}
                    >
                      {c.explanation} · {dateLabel(c.createdAt)}
                    </div>
                  ))}
                  <CorrectionForm sourceId={s.id} />
                </details>
              ))}
          </section>
        </div>
        <aside>
          <section className="panel">
            <h2>История рассмотрения</h2>
            <div className="timeline">
              <div className="timeline-item">
                <span className="subtle">{dateLabel(app.submittedAt)}</span>
                <h3>Заявка отправлена</h3>
                <p>Материалы зафиксированы для рассмотрения.</p>
              </div>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 24 }}>
            <h2>Языковая готовность</h2>
            <p>
              {app.language?.status === "REVIEWED"
                ? "Ответ рассмотрен сотрудником. Опубликованные рекомендации доступны в обратной связи."
                : "Языковой ответ рассматривается отдельно от опыта. Его можно открыть и дополнить."}
            </p>
            <Link
              href="/apply/english"
              className="text-link"
              style={{ marginTop: 18 }}
            >
              Открыть языковую проверку
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
