"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  FileText,
  Quote,
  History,
  CalendarDays,
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
import { ReviewMap } from "./review-map";
import { ReviewDecision } from "./review-decision";
import { SourceContent } from "./review-source";
import { EpisodeNotes, MergeEpisodes } from "./episode-notes";
import { submissionIssues } from "@/lib/validation";
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
  const [sourceId, setSourceId] = useState(
    a.sources.find((s) => s.title === "Опыт и личная роль")?.id ??
      a.sources[0]?.id ??
      "",
  );
  const [tab, setTab] = useState("overview");
  const [domain, setDomain] = useState<string>(domains[5]);
  const [sourceIds, setSourceIds] = useState<string[]>(
    a.sources[0] ? [a.sources[0].id] : [],
  );
  const sourceTask = useTask();
  const returnFocus = useRef<HTMLElement | null>(null);
  const reviewTask = useTask();
  const router = useRouter();
  const source = a.sources.find((s) => s.id === sourceId);
  const fields = a.fields as unknown as ApplicationFields;
  const language = a.language?.state as unknown as LanguageState | undefined;
  const latestAssessment = (d: string) =>
    a.assessments.find((x) => x.domain === d);
  function openSource(id: string) {
    returnFocus.current = document.activeElement as HTMLElement;
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
          ["check", "Карта проверки"],
          ["decision", "Решение и публикация"],
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
                <p className="notice info">
                  {submissionIssues(
                    fields,
                    a.materials.map((m) => m.kind),
                  ).length
                    ? submissionIssues(
                        fields,
                        a.materials.map((m) => m.kind),
                      ).join(" ")
                    : "Условия отправки выполнены. Комплектность проверена по полям формы; достоверность рассказа и доступность ссылок требуют проверки сотрудником."}
                </p>
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
                      загружено
                    </span>
                  </div>
                  {!a.materials.some((m) => m.kind === "document") && (
                    <p>
                      Документ не загружен. Вместо него кандидат оставил
                      пояснение.
                    </p>
                  )}
                  {fields.documentNote && (
                    <p>Пояснение кандидата: {fields.documentNote}</p>
                  )}
                  {fields.videoUrl && (
                    <p>
                      Видео указано ссылкой. Доступность и содержание ещё нужно
                      проверить.
                    </p>
                  )}
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
                <p>
                  <strong>Кандидат пишет:</strong>{" "}
                  {fields.motivation.slice(0, 280)}
                  {fields.motivation.length > 280 ? "…" : ""}
                </p>
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
                {a.episodes
                  .filter((ep) => !ep.mergedIntoId)
                  .map((ep) => (
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
                      {[
                        ep,
                        ...a.episodes.filter((e) => e.mergedIntoId === ep.id),
                      ]
                        .flatMap((e) => e.annotations)
                        .map((n) => (
                          <div className="episode-note" key={n.id}>
                            <blockquote>{n.quote}</blockquote>
                            <p>
                              <strong>Личное действие:</strong>{" "}
                              {n.personalAction}
                            </p>
                            <button
                              className="source-button"
                              onClick={() => openSource(n.sourceId)}
                            >
                              Открыть фрагмент в источнике
                            </button>
                          </div>
                        ))}
                      {a.episodes
                        .filter((e) => e.mergedIntoId === ep.id)
                        .map((e) => (
                          <div className="notice info" key={e.id}>
                            <div>
                              <strong>Связано с «{e.title}»</strong>
                              <p>{e.mergeReason}</p>
                              {e.sources.map((source) => (
                                <button
                                  className="source-button"
                                  key={source.id}
                                  onClick={() => openSource(source.id)}
                                >
                                  {source.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                <MergeEpisodes application={a} />
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
                <p>
                  Девять областей, просмотренные основания, вопросы и
                  человеческие оценки — в карте проверки.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setTab("check")}
                >
                  Открыть карту проверки
                </button>
              </section>
              {a.interviews.length > 0 && (
                <section className="review-section">
                  <h2>Интервью</h2>
                  {a.interviews.map((i) => (
                    <div className="evidence-row" key={i.id}>
                      <div className="row between">
                        <span className="inline">
                          <CalendarDays size={16} />
                          {dateLabel(
                            i.status === "COMPLETED" && i.performedAt
                              ? i.performedAt
                              : i.scheduledAt,
                          )}{" "}
                          · Алматы
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
          {tab === "check" && (
            <>
              <ReviewMap application={a} onSource={openSource} />
              <section className="review-section">
                <h2>Оценка сотрудника</h2>{" "}
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
                          materialVersion: a.materialVersion,
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
            </>
          )}
          {tab === "decision" && <ReviewDecision application={a} />}
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
                    <p className="meta">
                      {d.materialVersion === a.materialVersion
                        ? "По текущим материалам"
                        : "Требует сверки с текущими материалами"}
                    </p>
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
              <h3 style={{ marginTop: 25 }}>Интерпретации сотрудников</h3>
              {a.assessments.map((x) => (
                <div className="evidence-row" key={x.id}>
                  <h3>{x.domain}</h3>
                  <p style={{ marginTop: 8 }}>{x.interpretation}</p>
                  <p className="meta">
                    {x.materialVersion === a.materialVersion
                      ? "По текущим материалам"
                      : "После вывода изменились материалы или их версия не зафиксирована"}
                  </p>
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
                <button
                  className="text-link source-return"
                  onClick={() => {
                    returnFocus.current?.scrollIntoView({ block: "center" });
                    returnFocus.current?.focus({ preventScroll: true });
                  }}
                >
                  Вернуться к выводу
                </button>
                <SourceContent source={source} />
                <button
                  className="button secondary small"
                  disabled={sourceTask.busy}
                  onClick={() =>
                    sourceTask.run(async () => {
                      await action("review.source", {
                        applicationId: a.id,
                        materialVersion: a.materialVersion,
                        sourceId: source.id,
                      });
                      router.refresh();
                    }, "Просмотр этой версии источника отмечен. Это не подтверждение истинности.")
                  }
                >
                  Отметить просмотр источника
                </button>
                {source.views[0] && (
                  <p className="meta">
                    Просмотр отмечен {dateLabel(source.views[0].createdAt)}
                  </p>
                )}
                <Feedback task={sourceTask} />
                <EpisodeNotes
                  key={source.id}
                  application={a}
                  sourceId={source.id}
                />
              </>
            ) : (
              <p>Источники появятся после передачи материалов.</p>
            )}
          </section>
          <section className="staff-action">
            <h3>Следующий шаг рассмотрения</h3>
            <p>
              {a.decisions[0]
                ? actionLabels[a.decisions[0].action]
                : "Отметьте просмотренные источники и существенный вопрос в карте проверки."}
            </p>
            <button
              className="button primary"
              onClick={() => {
                setTab("decision");
                document
                  .querySelector(".tabs")
                  ?.scrollIntoView({ block: "start" });
              }}
            >
              Решение и публикация
            </button>
            <p className="subtle">
              Внутренние заметки кандидату не показываются.
            </p>
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
