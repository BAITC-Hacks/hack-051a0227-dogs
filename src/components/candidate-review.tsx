"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  FileText,
  Quote,
  History,
  Check,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import type { loadCandidate } from "@/lib/data";
import { action, dateLabel } from "@/lib/client";
import { applicationSnapshotText, languageSnapshot } from "@/lib/presentation";
import { stageLabels, domains, actionLabels } from "@/lib/catalog";
import type { ApplicationFields, LanguageState } from "@/lib/types";
import { AudioReviewPanel } from "./audio-review";
import type { AudioState } from "./audio-processing";
import { Messages } from "./messages";
import { Feedback, useTask, Tag } from "./ui";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
export function CandidateReview({
  application: a,
  guidance,
  audio,
}: {
  application: Candidate;
  guidance: string;
  audio: AudioState;
}) {
  const [sourceId, setSourceId] = useState(a.sources[0]?.id ?? "");
  const [tab, setTab] = useState("overview");
  const [decision, setDecision] = useState(
    a.stage === "DECIDED" ? "REOPEN" : "CLARIFICATION",
  );
  const [decisionReason, setDecisionReason] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [domain, setDomain] = useState<string>(domains[5]);
  const [sourceIds, setSourceIds] = useState<string[]>(
    a.sources[0] ? [a.sources[0].id] : [],
  );
  const task = useTask();
  const reviewTask = useTask();
  const router = useRouter();
  const source = a.sources.find((s) => s.id === sourceId);
  const fields = a.fields as unknown as ApplicationFields;
  const language = a.language?.state as unknown as LanguageState | undefined;
  const latestAssessment = (d: string) =>
    a.assessments.find((x) => x.domain === d);
  function openSource(id: string) {
    setSourceId(id);
    if (window.innerWidth < 1000)
      document
        .getElementById("source-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <div className="staff-page">
      <Link href="/admissions" className="breadcrumbs">
        <ArrowLeft size={14} />
        Все кандидаты
      </Link>
      <div className="page-title">
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <h1 style={{ margin: 0 }}>{a.user.name}</h1>
            <Tag tone={a.stage === "CLARIFICATION" ? "warning" : "blue"}>
              {stageLabels[a.stage]}
            </Tag>
          </div>
          <p style={{ fontSize: 13 }}>
            {a.program.title} · {fields.city} · Подана{" "}
            {a.submittedAt ? dateLabel(a.submittedAt) : ""}
          </p>
        </div>
        <span className="subtle">{a.user.email}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Рассмотрение кандидата">
        {[
          ["overview", "Обзор"],
          ["sources", "Все источники"],
          ["messages", "Переписка"],
          ["history", "История решений"],
        ].map(([value, label]) => (
          <button
            key={value}
            className="tab"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
            {value === "messages" ? " · " + a.messages.length : ""}
          </button>
        ))}
      </div>
      <div className="review-layout">
        <div className="review-main">
          {tab === "overview" && (
            <>
              <section
                className="review-section"
                style={{ borderTop: 0, paddingTop: 0 }}
              >
                <h2>Готовность</h2>
                <p className="section-subtitle">
                  Документы и язык. Отдельно от мотивации и лидерских
                  интерпретаций.
                </p>
                <div className="evidence-row">
                  <div className="evidence-top">
                    <h3>Английский язык</h3>
                    <Tag
                      tone={
                        a.language?.status === "REVIEWED"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {a.language?.status === "REVIEWED"
                        ? "Рассмотрено сотрудником"
                        : a.language?.status === "PENDING_REVIEW"
                          ? "Нужна проверка"
                          : "Ожидает ответа"}
                    </Tag>
                  </div>
                  <p>
                    {a.language?.result ?? "Языковой ответ пока не сохранён."}
                  </p>
                  {language?.writtenNote && (
                    <p className="notice info" style={{ marginTop: 12 }}>
                      Условия: {language.writtenNote}
                    </p>
                  )}
                  {language?.oralId && language?.followupId && (
                    <AudioReviewPanel
                      key={String(a.language!.revision) + (audio.job?.id ?? "")}
                      applicationId={a.id}
                      revision={a.language!.revision}
                      oralId={language.oralId}
                      followupId={language.followupId}
                      data={audio}
                      onRequestClarification={() => setTab("messages")}
                    />
                  )}
                </div>
                <div className="evidence-row">
                  <div className="evidence-top">
                    <h3>Материалы к заявке</h3>
                    <span className="subtle">
                      {
                        a.materials.filter(
                          (m) => m.kind === "document" || m.kind === "video",
                        ).length
                      }{" "}
                      файла
                    </span>
                  </div>
                  {fields.documentNote && <p>{fields.documentNote}</p>}
                  {a.materials
                    .filter((m) => m.kind === "document" || m.kind === "video")
                    .map((m) => (
                      <a
                        key={m.id}
                        className="file-row"
                        href={"/api/files/" + m.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={15} />
                        <span>{m.name}</span>
                        <ArrowUpRight size={15} />
                      </a>
                    ))}
                  {fields.videoUrl && (
                    <a
                      className="text-link"
                      href={fields.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginTop: 12 }}
                    >
                      Видеопрезентация <ArrowUpRight size={15} />
                    </a>
                  )}
                  <a
                    className="text-link"
                    style={{ marginTop: 12, fontSize: 11 }}
                    href="https://www.invisionu.education/ru/undergraduate"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Сверить с требованиями программы <ArrowUpRight size={13} />
                  </a>
                </div>
              </section>
              <section className="review-section">
                <h2>Направление и мотивация</h2>
                <p>{fields.motivation}</p>
                <div className="source-buttons" style={{ marginTop: 16 }}>
                  {a.sources
                    .filter(
                      (s) => s.kind === "Мотивация" || s.title === "Мотивация",
                    )
                    .map((s) => (
                      <button
                        className="source-button"
                        key={s.id}
                        onClick={() => openSource(s.id)}
                      >
                        <Quote size={13} />
                        Открыть источник
                      </button>
                    ))}
                </div>
                {latestAssessment(domains[0]) && (
                  <div className="evidence-row" style={{ marginTop: 15 }}>
                    <p>
                      <strong>Интерпретация сотрудника:</strong>{" "}
                      {latestAssessment(domains[0])?.interpretation}
                    </p>
                    <p className="meta">
                      {latestAssessment(domains[0])?.author.name} ·{" "}
                      {dateLabel(latestAssessment(domains[0])!.createdAt)}
                    </p>
                  </div>
                )}
              </section>
              <section className="review-section">
                <h2>Опыт и основания оценки</h2>
                <p className="section-subtitle">
                  Каждый проект объединяет связанные материалы в один эпизод.
                </p>
                {a.episodes.map((ep) => (
                  <div className="evidence-row" key={ep.id}>
                    <div className="evidence-top">
                      <h3>{ep.title}</h3>
                      <Tag>Один эпизод · {ep.sources.length} источника</Tag>
                    </div>
                    <p>
                      <strong>Личная роль:</strong> {ep.personalRole}
                    </p>
                    <div className="source-buttons">
                      {ep.sources.map((s) => (
                        <button
                          className="source-button"
                          key={s.id}
                          onClick={() => openSource(s.id)}
                        >
                          <Quote size={13} />
                          {s.kind}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {latestAssessment(domains[5]) && (
                  <div className="notice info" style={{ marginTop: 18 }}>
                    <div>
                      <strong>Что нужно уточнить</strong>
                      <p style={{ marginTop: 6 }}>
                        {latestAssessment(domains[5])?.contradiction}
                      </p>
                    </div>
                  </div>
                )}
                <p className="subtle" style={{ marginTop: 18 }}>
                  Рассказ кандидата остаётся его свидетельством. Точная цитата
                  сама по себе не является независимым подтверждением.
                </p>
              </section>
              <section className="review-section">
                <h2>Области рассмотрения</h2>
                <p className="section-subtitle">
                  Уровень проявления, достаточность оснований и противоречия
                  сохраняются раздельно.
                </p>
                <div className="table-scroll">
                  <table className="rubric-table">
                    <thead>
                      <tr>
                        <th>Область</th>
                        <th>Проявление</th>
                        <th>Основания</th>
                        <th>Противоречия / уточнения</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domains.map((d) => {
                        const assessment = latestAssessment(d);
                        return (
                          <tr key={d}>
                            <td>{d}</td>
                            <td>{assessment?.level ?? "Не рассмотрено"}</td>
                            <td>{assessment?.sufficiency ?? "Не оценены"}</td>
                            <td>
                              {assessment?.contradiction || "Не зафиксированы"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <details className="assessment-form">
                  <summary>Добавить оценку по существенному выводу</summary>
                  <p className="subtle" style={{ margin: "14px 0" }}>
                    {guidance}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      reviewTask.run(async () => {
                        await action("assessment", {
                          applicationId: a.id,
                          domain,
                          level: f.get("level"),
                          sufficiency: f.get("sufficiency"),
                          contradiction: f.get("contradiction"),
                          interpretation: f.get("interpretation"),
                          sourceIds,
                        });
                        form.reset();
                        router.refresh();
                      }, "Человеческая оценка сохранена. Предыдущие выводы остаются в истории.");
                    }}
                  >
                    <div className="form-grid two">
                      <label className="field">
                        Область
                        <select
                          value={domain}
                          onChange={(e) => setDomain(e.target.value)}
                        >
                          {domains.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Уровень проявления
                        <select name="level">
                          <option>Есть проявление</option>
                          <option>Устойчивое проявление</option>
                          <option>Нужно уточнение</option>
                          <option>Не рассмотрено</option>
                        </select>
                      </label>
                      <label className="field">
                        Достаточность оснований
                        <select name="sufficiency">
                          <option>Частично</option>
                          <option>Достаточно</option>
                          <option>Недостаточно</option>
                        </select>
                      </label>
                      <label className="field">
                        Противоречие или уточнение
                        <input
                          name="contradiction"
                          maxLength={2000}
                          placeholder="Что требует проверки"
                        />
                      </label>
                    </div>
                    <fieldset className="source-checks">
                      <legend className="subtle">Источники для вывода</legend>
                      {a.sources.map((s) => (
                        <label className="check-label" key={s.id}>
                          <input
                            type="checkbox"
                            checked={sourceIds.includes(s.id)}
                            onChange={(e) =>
                              setSourceIds((ids) =>
                                e.target.checked
                                  ? [...ids, s.id]
                                  : ids.filter((id) => id !== s.id),
                              )
                            }
                          />
                          {s.title}
                        </label>
                      ))}
                    </fieldset>
                    <label className="field">
                      Интерпретация сотрудника и личная роль
                      <textarea
                        name="interpretation"
                        required
                        minLength={15}
                        maxLength={4000}
                      />
                    </label>
                    <button
                      className="button primary small"
                      style={{ marginTop: 16 }}
                      disabled={reviewTask.busy || !sourceIds.length}
                    >
                      Сохранить оценку сотрудника
                    </button>
                  </form>
                </details>
                <Feedback task={reviewTask} />
              </section>
              {a.interviews.length > 0 && (
                <section className="review-section">
                  <h2>Интервью</h2>
                  {a.interviews.map((i) => (
                    <div className="evidence-row" key={i.id}>
                      <div className="row between">
                        <span className="inline">
                          <CalendarDays size={16} />
                          {dateLabel(i.scheduledAt)} · Алматы
                        </span>
                        <Tag>
                          {i.status === "COMPLETED" ? "Завершено" : "Назначено"}
                        </Tag>
                      </div>
                      <Link
                        className="text-link"
                        style={{ marginTop: 12 }}
                        href={"/admissions/interviews/" + i.id}
                      >
                        Открыть рабочее пространство <ArrowUpRight size={16} />
                      </Link>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {tab === "sources" && (
            <section>
              <h2>Источники и материалы</h2>
              <p className="subtle" style={{ margin: "12px 0 22px" }}>
                Выбери источник — он откроется рядом с контекстом заявки.
              </p>
              {a.sources.map((s) => (
                <div className="evidence-row" key={s.id}>
                  <div className="evidence-top">
                    <h3>{s.title}</h3>
                    <Tag>{s.kind}</Tag>
                  </div>
                  <p>
                    {s.content.slice(0, 180)}
                    {s.content.length > 180 ? "…" : ""}
                  </p>
                  <button
                    className="source-button"
                    style={{ marginTop: 12 }}
                    onClick={() => openSource(s.id)}
                  >
                    <Quote size={13} />
                    Открыть источник
                  </button>
                  {s.corrections.length > 0 && (
                    <Tag tone="warning">Есть уточнение кандидата</Tag>
                  )}
                </div>
              ))}
            </section>
          )}
          {tab === "messages" && (
            <section>
              <h2>Переписка по заявке</h2>
              <div id="candidate-messages" />
              <Messages applicationId={a.id} messages={a.messages} />
            </section>
          )}
          {tab === "history" && (
            <section>
              <h2>История решений и оценок</h2>
              <div className="timeline">
                {a.decisions.map((d) => (
                  <div className="timeline-item" key={d.id}>
                    <span className="subtle">
                      {dateLabel(d.createdAt)} · {d.author.name}
                    </span>
                    <h3>{actionLabels[d.action]}</h3>
                    <p>{d.reason}</p>
                    <p className="subtle">
                      {stageLabels[d.fromStage]} → {stageLabels[d.toStage]}
                    </p>
                  </div>
                ))}
              </div>
              {!a.decisions.length && (
                <p className="subtle">
                  Следующее действие сотрудника создаст первую запись в истории
                  решения.
                </p>
              )}
              <h3 style={{ marginTop: 25 }}>Подтверждённые интерпретации</h3>
              {a.assessments.map((x) => (
                <div className="evidence-row" key={x.id}>
                  <h3>{x.domain}</h3>
                  <p style={{ marginTop: 8 }}>{x.interpretation}</p>
                  <p className="meta">
                    {x.author.name} · {dateLabel(x.createdAt)} · рубрика{" "}
                    {x.rubricVersion}
                  </p>
                  <div className="source-buttons">
                    {x.sourceIds.map((id) => (
                      <button
                        className="source-button"
                        key={id}
                        onClick={() => openSource(id)}
                      >
                        Источник <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <details className="versions">
                <summary>Версии заявки · {a.versions.length}</summary>
                {a.versions.map((v) => (
                  <div className="version-row" key={v.id}>
                    <strong>
                      Версия {v.revision} · {dateLabel(v.createdAt)}
                    </strong>
                    <pre>{applicationSnapshotText(v.snapshot)}</pre>
                  </div>
                ))}
              </details>
              {a.language && (
                <details className="versions">
                  <summary>
                    История языкового ответа · {a.language.history.length}
                  </summary>
                  {a.language.history.map((v) => (
                    <div key={v.id} className="version-row">
                      <strong>
                        Версия {v.revision} · {dateLabel(v.createdAt)}
                      </strong>
                      <pre>{languageSnapshot(v.state).text}</pre>
                      {languageSnapshot(v.state).oralId && (
                        <audio
                          controls
                          src={"/api/files/" + languageSnapshot(v.state).oralId}
                        />
                      )}{" "}
                      {languageSnapshot(v.state).followupId && (
                        <audio
                          controls
                          src={
                            "/api/files/" + languageSnapshot(v.state).followupId
                          }
                        />
                      )}
                    </div>
                  ))}
                </details>
              )}
            </section>
          )}
        </div>
        <aside className="review-aside">
          <section
            className="source-panel"
            id="source-panel"
            aria-label="Открытый источник"
          >
            <div className="row between">
              <span className="inline subtle">
                <Quote size={16} />
                Источник рядом
              </span>
              {source && <Tag>{source.kind}</Tag>}
            </div>
            <label className="field" style={{ marginTop: 16 }}>
              Выбрать источник
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {a.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            {source ? (
              <>
                <h2>{source.title}</h2>
                <blockquote>{source.content}</blockquote>
                {source.material && (
                  <div>
                    {source.material.mime.startsWith("audio/") ? (
                      <audio
                        controls
                        src={"/api/files/" + source.material.id}
                      />
                    ) : source.material.mime.startsWith("video/") ? (
                      <video
                        controls
                        src={"/api/files/" + source.material.id}
                      />
                    ) : (
                      <a
                        className="button secondary small"
                        href={"/api/files/" + source.material.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть оригинал <ArrowUpRight size={15} />
                      </a>
                    )}
                  </div>
                )}
                {source.corrections.map((c) => (
                  <div
                    className="notice info"
                    key={c.id}
                    style={{ background: "#f2f8fb", marginBottom: 15 }}
                  >
                    <div>
                      <strong>Уточнение · {dateLabel(c.createdAt)}</strong>
                      <p>{c.explanation}</p>
                    </div>
                  </div>
                ))}
                <p className="source-foot">
                  {source.kind === "Учебное упражнение"
                    ? "Учебная работа, переданная кандидатом с отдельным разрешением."
                    : "Материал кандидата. Утверждения проверяются по контексту и доступным основаниям."}
                </p>
              </>
            ) : (
              <p>Источники появятся после отправки материалов кандидатом.</p>
            )}
          </section>
          <section className="staff-action">
            <h3>Следующее действие</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                task.run(async () => {
                  await action("decision", {
                    applicationId: a.id,
                    revision: a.revision,
                    action: decision,
                    reason: decisionReason,
                    scheduledAt: scheduled
                      ? new Date(scheduled).toISOString()
                      : undefined,
                  });
                  setDecisionReason("");
                  router.refresh();
                }, "Действие сотрудника и основание сохранены. Сообщение доступно кандидату в приложении.");
              }}
            >
              <label className="field">
                Действие сотрудника
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  {Object.entries(actionLabels)
                    .filter(([k]) =>
                      a.stage === "DECIDED" ? k === "REOPEN" : k !== "REOPEN",
                    )
                    .map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
              {decision === "INTERVIEW" && (
                <label className="field">
                  Дата и время интервью (часовой пояс устройства)
                  <input
                    type="datetime-local"
                    required
                    value={scheduled}
                    onChange={(e) => setScheduled(e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                {decision === "CLARIFICATION"
                  ? "Вопрос кандидату"
                  : "Основание и сообщение кандидату"}
                <textarea
                  required
                  minLength={15}
                  maxLength={4000}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder={
                    decision === "CLARIFICATION"
                      ? "Что именно нужно уточнить и почему?"
                      : "На какие источники и обстоятельства опирается действие?"
                  }
                />
              </label>
              {["ACCEPT", "DECLINE"].includes(decision) && (
                <label className="check-label" style={{ marginTop: 15 }}>
                  <input type="checkbox" required />
                  Подтверждаю личное решение после рассмотрения источников.
                </label>
              )}
              <button className="button primary" disabled={task.busy}>
                {decision === "CLARIFICATION" ? (
                  <MessageSquare size={16} />
                ) : decision === "INTERVIEW" ? (
                  <CalendarDays size={16} />
                ) : (
                  <Check size={16} />
                )}
                Зафиксировать действие
              </button>
              <p className="subtle" style={{ marginTop: 10, fontSize: 11 }}>
                Сообщение сохраняется в приложении. Решение имеет автора и
                остаётся в истории.
              </p>
            </form>
            <Feedback task={task} />
          </section>
          <div className="row" style={{ marginTop: 18 }}>
            <button
              className="text-link"
              style={{ fontSize: 12 }}
              onClick={() => setTab("history")}
            >
              <History size={14} />
              Открыть историю
            </button>
            <Link
              href="/admissions"
              className="text-link"
              style={{ fontSize: 12 }}
            >
              К очереди <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
