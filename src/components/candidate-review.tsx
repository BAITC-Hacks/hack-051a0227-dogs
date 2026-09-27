"use client";
import "./candidate-review.css";
import "./intake.css";
import { calendarMessages } from "@/lib/calendar-contract";
import { IntakeSummary } from "./intake-fields";
import { CredentialReview } from "./credential-review";
import { preflight, routeFor, type IntakeRules } from "@/lib/intake-contract";
import { DeskChatLauncher } from "./desk-chat";
import { UserAvatar } from "./user-avatar";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Quote,
  CalendarDays,
  IdCard,
  Mail,
  Phone,
  UserRound,
  Globe2,
} from "lucide-react";
import type { loadCandidate } from "@/lib/data";
import { unansweredQuestions } from "@/lib/message-state";
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
import { ScoringPanel } from "./scoring-panel";
import { VerificationPanel } from "./verification-panel";
import { ReReviewPanel } from "./re-review-panel";
import type { ScoringResult } from "@/lib/scoring-contract";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const legacySections: Record<string, string> = {
  "#scoring": "profile",
  "#overview": "overview",
  "#check": "check",
  "#sources": "sources",
  "#candidate-messages": "messages",
  "#history": "history",
  "#decision": "decision",
  "#decision-publication": "decision",
  "#review-case": "profile",
};
export function CandidateReview({
  application: a,
  guidance,
  audio,
  returnHref = "/admissions",
}: {
  application: Candidate;
  guidance: string;
  audio: AudioState;
  returnHref?: string;
}) {
  const [sourceId, setSourceId] = useState("");
  const [tab, setTab] = useState("profile");
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  const [seenHash, setSeenHash] = useState(hash);
  if (seenHash !== hash) {
    setSeenHash(hash);
    if (legacySections[hash]) setTab(legacySections[hash]);
  }
  const mainTab = ["scoring", "overview", "check"].includes(tab)
    ? "profile"
    : tab === "history"
      ? "decision"
      : tab;
  const activeInterview = a.interviews.find(
    (i) => !["COMPLETED", "CANCELLED"].includes(i.status),
  );
  const waiting = unansweredQuestions(a.messages).length > 0;
  const newAnswer = a.sources.some((s) => s.messageId && !s.views.length);
  const [scoringDraft, setScoringDraft] = useState<{
    result: ScoringResult;
    runId: string;
  } | null>(null);
  const [domain, setDomain] = useState<string>(domains[5]);
  const [sourceIds, setSourceIds] = useState<string[]>(
    a.sources[0] ? [a.sources[0].id] : [],
  );
  const sourceTask = useTask();
  const returnFocus = useRef<HTMLElement | null>(null);
  const reviewTask = useTask();
  const router = useRouter();
  const source = a.sources.find((s) => s.id === sourceId);
  const fields = a.fields as unknown as ApplicationFields & {
    iin?: string;
    phone?: string;
  };
  const language = a.language?.state as unknown as LanguageState | undefined;
  const latestAssessment = (d: string) =>
    a.assessments.find((x) => x.domain === d);
  function openSource(id: string) {
    returnFocus.current = document.activeElement as HTMLElement;
    setSourceId(id);
  }
  useEffect(() => {
    if (sourceId) {
      const panel = document.getElementById("source-panel");
      panel?.focus({ preventScroll: true });
      if (window.innerWidth < 1000) panel?.scrollIntoView({ block: "start" });
    }
  }, [sourceId]);
  useEffect(() => {
    if (legacySections[hash])
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: "start" });
  }, [hash, tab]);
  function closeSource() {
    setSourceId("");
    requestAnimationFrame(() => {
      const target = returnFocus.current?.isConnected
        ? returnFocus.current
        : document.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
          );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
  }
  return (
    <div className="staff-page">
      <Link href={returnHref} className="breadcrumbs">
        <ArrowLeft size={14} />
        Все кандидаты
      </Link>
      <div className="page-title">
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <UserAvatar user={a.user} size={52} />
            <h1 style={{ margin: 0 }}>{a.user.name}</h1>
            <Tag tone={a.stage === "CLARIFICATION" ? "warning" : "blue"}>
              {stageLabels[a.stage]}
            </Tag>
          </div>
          <p className="candidate-meta">
            {a.program.title} · {fields.city} · Подана{" "}
            {a.submittedAt ? dateLabel(a.submittedAt) : ""}
          </p>
        </div>
        <div className="queue-heading-actions">
          <DeskChatLauncher
            compact
            applicationIds={[a.id]}
            names={[a.user.name]}
          />
          <details className="candidate-contact">
            <summary>Контакт</summary>
            <div className="candidate-contact-content">
              <p>
                <Mail size={16} aria-hidden="true" />{" "}
                <span>
                  {a.user.email || fields.email || "Почта не указана"}
                </span>
              </p>
              <p>
                <Phone size={16} aria-hidden="true" />{" "}
                <span>
                  {fields.intake?.phone?.trim() ||
                    fields.phone?.trim() ||
                    "Телефон не указан"}
                </span>
              </p>
            </div>
          </details>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Рассмотрение кандидата">
        {[
          ["profile", "Профиль"],
          ["sources", "Материалы"],
          ["messages", "Вопросы кандидату"],
          ["decision", "Решение"],
        ].map(([value, label]) => (
          <button
            key={value}
            className="tab"
            role="tab"
            aria-selected={mainTab === value}
            onClick={() => {
              setTab(value);
              window.location.hash = (
                {
                  profile: "scoring",
                  sources: "sources",
                  messages: "candidate-messages",
                  decision: "decision",
                } as Record<string, string>
              )[value];
            }}
          >
            {label}
            {value === "messages"
              ? newAnswer
                ? " · получен ответ"
                : waiting
                  ? " · ожидается ответ"
                  : ""
              : ""}
          </button>
        ))}
      </div>
      {activeInterview && mainTab !== "profile" && (
        <div className="current-interview">
          <span>
            {calendarMessages[activeInterview.calendarStatus]}{" "}
            {new Intl.DateTimeFormat("ru", {
              timeZone: activeInterview.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(activeInterview.scheduledAt))}{" "}
            · {activeInterview.timezone}
          </span>
          <Link
            className="button secondary"
            href={`/admissions/interviews/${activeInterview.id}`}
          >
            Открыть подготовку интервью
          </Link>
        </div>
      )}
      <div
        className={`review-layout ${mainTab === "profile" ? "candidate-review-layout" : ""} ${source ? "has-source" : "source-closed"}`}
      >
        <div
          className={`review-main ${mainTab === "profile" ? "candidate-profile-layout" : ""}`}
        >
          {mainTab === "profile" &&
            ["ACCEPT", "DECLINE"].includes(a.decisions[0]?.action ?? "") && (
              <section
                className="candidate-outcome"
                aria-label="Решение сотрудника"
              >
                <div>
                  <span className="candidate-outcome-label">
                    Решение сотрудника
                  </span>
                  <h2>{actionLabels[a.decisions[0].action]}</h2>
                  <p>{a.decisions[0].reason}</p>
                  <small>
                    {a.decisions[0].author.name} ·{" "}
                    {dateLabel(a.decisions[0].createdAt)}
                  </small>
                  {a.sources.some(
                    (source) => source.createdAt > a.decisions[0].createdAt,
                  ) && (
                    <p className="candidate-outcome-update">
                      После решения добавлены материалы. Их нужно сверить
                      отдельно; сохранённое решение не переписывается
                      автоматически.
                    </p>
                  )}
                </div>
                <button
                  className="button secondary"
                  onClick={() => setTab("decision")}
                >
                  Открыть решение
                </button>
              </section>
            )}
          {mainTab === "profile" && (
            <ScoringPanel
              applicationId={a.id}
              data={a.scoring}
              language={
                a.language?.result ??
                (a.language
                  ? "Ответ ожидает проверки"
                  : "Языковая попытка не начата")
              }
              onReadiness={() => setTab("overview")}
              onSource={openSource}
              interviewId={
                a.interviews.find((i) => i.status !== "COMPLETED")?.id
              }
              onUse={(result, runId) => {
                setScoringDraft({ result, runId });
                setTab("decision");
              }}
            />
          )}
          {mainTab === "profile" && (
            <ReReviewPanel
              applicationId={a.id}
              cases={a.reReviewCases}
              sources={a.sources}
              reviewers={a.reviewers}
              onSource={openSource}
            />
          )}
          {mainTab === "profile" && a.intakeRules && (
            <details className="review-detail">
              <summary>Фактическая сводка по заявке</summary>
              {a.preparation.runs.find((r) => r.current && r.result)?.result ? (
                <>
                  {a.preparation.runs
                    .filter((r) => r.current && r.result)
                    .slice(0, 1)
                    .map((r) => (
                      <div key={r.id}>
                        <p>{r.result!.summary}</p>
                        {r.result!.grounds.map((g) => (
                          <button
                            key={g.key}
                            className="text-link"
                            type="button"
                            onClick={() => openSource(g.sourceId)}
                          >
                            {g.title} · «{g.quote}»
                          </button>
                        ))}
                      </div>
                    ))}
                </>
              ) : (
                <>
                  <p>
                    {a.preparationStatus === "NO_CONSENT"
                      ? "Разрешение на внешнюю подготовку не предоставлено. Материалы доступны для человеческого рассмотрения."
                      : a.preparationStatus === "WAITING_SETTINGS"
                        ? "Подготовка ожидает настройки подключения OpenAI."
                        : "Сводка ещё не готова. Состояние последней операции: " +
                          ((
                            {
                              QUEUED: "в очереди",
                              RUNNING: "обрабатывается",
                              FAILED: "ошибка, доступен повтор",
                              PENDING: "ожидает обработки",
                              NONE: "не запускалась",
                              WAITING_SOURCES: "нет разрешённых текстов",
                            } as Record<string, string>
                          )[
                            a.preparation.runs[0]?.status ?? a.preparationStatus
                          ] ?? "требуется проверка настройки")}
                  </p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      reviewTask.run(async () => {
                        await action("desk.event.retry", {
                          applicationId: a.id,
                        });
                        router.refresh();
                      })
                    }
                  >
                    Повторить подготовку
                  </button>
                </>
              )}
            </details>
          )}
          {mainTab === "profile" && (
            <details
              className="review-detail"
              id="overview"
              open={tab === "overview"}
            >
              <summary>Образование, результаты, эссе и готовность</summary>
              <section
                className="review-section"
                style={{ borderTop: 0, paddingTop: 0 }}
              >
                {fields.intake && (
                  <>
                    <IntakeSummary
                      fields={fields}
                      rules={a.intakeRules as IntakeRules | null}
                    />
                    {fields.intake.essay.text && <section className="review-section" aria-label="Проверка использования AI в эссе">
                      <h3>Проверка использования AI</h3>
                      <p>{(() => {
                        const check = a.essayChecks[0];
                        if (!check) return "Проверка текста ещё не запускалась.";
                        if (check.status === "QUEUED" || check.status === "RUNNING") return "Текст обрабатывается. Результат появится после проверки модели и версии.";
                        if (check.status === "TOO_SHORT") return "Текст слишком короткий для этой проверки. Это не является подозрением.";
                        if (check.status === "UNSUPPORTED_LANGUAGE") return "Язык или смешанный текст не поддерживается проверенным набором. Вывод не делается.";
                        if (check.status === "FAILED") return "Обработка прервалась. Оценка по этому сигналу не формируется.";
                        return "Техническая проверка выполнена, но модель проверена на другом типе русских эссе. Для вступительного текста вывод о происхождении не формируется.";
                      })()}</p>
                      <p className="subtle">Версия текста и модели сохраняется отдельно. Этот сигнал не меняет оценки AXIS и решение комиссии.</p>
                      <a className="text-link" href="#essay-verification">Уточнить содержание</a>
                    </section>}
                    <VerificationPanel
                      applicationId={a.id}
                      sources={a.verificationSources}
                      requests={a.verificationRequests}
                      suggestion={a.scoring.runs.find((run) => run.current)?.result?.questions[0]
                        ? {
                            sourceId: a.scoring.runs.find((run) => run.current)!.result!.questions[0].sourceId,
                            question: a.scoring.runs.find((run) => run.current)!.result!.questions[0].text,
                          }
                        : undefined}
                      onSource={openSource}
                    />
                    <CredentialReview
                      applicationId={a.id}
                      materialVersion={a.materialVersion}
                      reviews={a.credentialReviews}
                    />
                  </>
                )}
                <h2>Готовность</h2>
                <p className="notice info">
                  {fields.intake && a.intakeRules
                    ? preflight(
                        fields,
                        a.materials,
                        a.intakeRules as IntakeRules,
                        a.programSlug,
                      )
                        .filter((i) => i.group === "BLOCK")
                        .map((i) => i.text)
                        .join(" ") ||
                      "Формальные условия отправки выполнены. Содержание и достоверность проверяет сотрудник."
                    : submissionIssues(
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
                  <p>{a.language?.result ?? "Языковая попытка не начата."}</p>
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
                      Видеопрезентация
                    </a>
                  )}
                  <a
                    className="text-link"
                    style={{ marginTop: 12, fontSize: 11 }}
                    href={
                      a.intakeRules
                        ? routeFor(
                            a.intakeRules as unknown as IntakeRules,
                            fields.intake?.entryType ?? "BACHELOR",
                            a.programSlug,
                          ).source
                        : "https://www.invisionu.education/ru/undergraduate"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Сверить с требованиями программы
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
                  человеческие оценки доступны в карте проверки.
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
                          {new Intl.DateTimeFormat("ru", {
                            timeZone: i.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(
                            new Date(
                              i.status === "COMPLETED" && i.performedAt
                                ? i.performedAt
                                : i.scheduledAt,
                            ),
                          )}{" "}
                          · {i.timezone}
                        </span>
                        <Tag>
                          {i.status === "COMPLETED"
                            ? "Завершено"
                            : i.status === "SCHEDULED"
                              ? "Назначено"
                              : i.status === "CANCELLED"
                                ? "Отменено"
                                : "Создание встречи"}
                        </Tag>
                      </div>
                      <Link
                        className="text-link"
                        style={{ marginTop: 12 }}
                        href={"/admissions/interviews/" + i.id}
                      >
                        Открыть рабочее пространство
                      </Link>
                    </div>
                  ))}
                </section>
              )}
            </details>
          )}
          {mainTab === "profile" && (
            <details
              className="review-detail"
              id="check"
              open={tab === "check"}
            >
              <summary>Карта проверки и оценка сотрудника</summary>
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
                          {s.messageId ? "Ответ кандидата" : s.title}
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
            </details>
          )}
          {mainTab === "profile" && (
            <aside
              className="candidate-profile-aside"
              aria-label="Сведения о кандидате"
            >
              <section className="candidate-profile-card">
                <h2>Сведения о кандидате</h2>
                <dl className="candidate-facts">
                  <div>
                    <UserRound size={19} aria-hidden="true" />
                    <dt>ФИО по заявке</dt>
                    <dd>{fields.name?.trim() || a.user.name}</dd>
                  </div>
                  <div>
                    <IdCard size={19} aria-hidden="true" />
                    <dt>ИИН</dt>
                    <dd>
                      {/^\d{12}$/.test(fields.iin ?? "")
                        ? fields.iin
                        : "Не указан в заявке"}
                    </dd>
                  </div>
                  <div>
                    <Globe2 size={19} aria-hidden="true" />
                    <dt>Гражданство</dt>
                    <dd>{fields.citizenship?.trim() || "Не указано"}</dd>
                  </div>
                  <div>
                    <FileText size={19} aria-hidden="true" />
                    <dt>ID заявки</dt>
                    <dd className="candidate-application-id">{a.id}</dd>
                  </div>
                </dl>
              </section>
              <section className="candidate-profile-card">
                <div className="candidate-card-heading">
                  <h2>Материалы заявки</h2>
                  <button
                    className="text-link"
                    onClick={() => setTab("sources")}
                  >
                    Все источники
                  </button>
                </div>
                {a.sources.length ? (
                  <ul className="candidate-material-list">
                    {a.sources.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <FileText size={18} aria-hidden="true" />
                        <button onClick={() => openSource(item.id)}>
                          {item.messageId ? "Ответ кандидата" : item.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : a.materials.length ? (
                  <ul className="candidate-material-list">
                    {a.materials.slice(0, 4).map((material) => {
                      const linkedSource = a.sources.find(
                        (s) => s.materialId === material.id,
                      );
                      return (
                        <li key={material.id}>
                          <FileText size={18} aria-hidden="true" />
                          {linkedSource ? (
                            <button onClick={() => openSource(linkedSource.id)}>
                              {material.name}
                            </button>
                          ) : (
                            <a
                              href={`/api/files/${material.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {material.name}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="subtle">Материалы пока не добавлены.</p>
                )}
              </section>
              {activeInterview && (
                <section className="candidate-profile-card candidate-interview-card">
                  <h2>
                    <CalendarDays size={19} aria-hidden="true" /> Интервью
                  </h2>
                  <p>
                    {new Intl.DateTimeFormat("ru", {
                      timeZone: activeInterview.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(activeInterview.scheduledAt))}{" "}
                    · {activeInterview.timezone}
                  </p>
                  <p className="subtle">
                    {calendarMessages[activeInterview.calendarStatus]}
                  </p>
                  <Link
                    className="button secondary"
                    href={`/admissions/interviews/${activeInterview.id}`}
                  >
                    Открыть подготовку
                  </Link>
                </section>
              )}
            </aside>
          )}
          {mainTab === "decision" && (
            <ReviewDecision application={a} scoringDraft={scoringDraft} />
          )}
          {tab === "sources" && (
            <section>
              <h2>Источники и материалы</h2>
              <p className="subtle" style={{ margin: "12px 0 22px" }}>
                Выберите материал. Он откроется рядом; после закрытия вы
                вернётесь к этому месту.
              </p>
              {a.sources.map((s) => (
                <div className="evidence-row" key={s.id}>
                  <div className="evidence-top">
                    <h3>{s.messageId ? "Ответ кандидата" : s.title}</h3>
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
              <h2>Вопросы кандидату</h2>
              <div id="candidate-messages" />
              <Messages
                applicationId={a.id}
                messages={a.messages}
                staff
                onSource={(messageId) => {
                  const s = a.sources.find((s) => s.messageId === messageId);
                  if (s) openSource(s.id);
                }}
              />
            </section>
          )}
          {mainTab === "decision" && (
            <details
              className="review-detail"
              id="history"
              open={tab === "history"}
            >
              <summary>История решений и оценок</summary>
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
                      Было: {stageLabels[d.fromStage]}. Сейчас:{" "}
                      {stageLabels[d.toStage]}.
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
                        Источник
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
            </details>
          )}
        </div>
        {source && (
          <aside className="review-aside">
            <section
              className="source-panel"
              id="source-panel"
              tabIndex={-1}
              aria-label="Открытый источник"
            >
              <div className="row between">
                <span className="inline subtle">
                  <Quote size={16} />
                  Открытый материал
                </span>
                <button className="button quiet" onClick={closeSource}>
                  Закрыть источник
                </button>
              </div>
              <label className="field" style={{ marginTop: 16 }}>
                Выбрать источник
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  {a.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.messageId ? "Ответ кандидата" : s.title}
                    </option>
                  ))}
                </select>
              </label>
              {source ? (
                <>
                  <button
                    className="text-link source-return"
                    onClick={() => {
                      closeSource();
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
          </aside>
        )}
      </div>
    </div>
  );
}
