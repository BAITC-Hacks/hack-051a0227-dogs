"use client";
import "./candidate-review.css";
import "./intake.css";
import { calendarMessages } from "@/lib/calendar-contract";
import { IntakeSummary } from "./intake-fields";
import { CredentialReview } from "./credential-review";
import type { IntakeRules } from "@/lib/intake-contract";
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
import { stageLabels } from "@/lib/catalog";
import type { ApplicationFields, LanguageState } from "@/lib/types";
import type { AudioState } from "./audio-processing";
import { Messages } from "./messages";
import { Feedback, useTask, Tag } from "./ui";
import { ReviewDecision } from "./review-decision";
import { SourceContent } from "./review-source";
import { EpisodeNotes } from "./episode-notes";
import { ScoringPanel } from "./scoring-panel";
import { AudioReviewPanel } from "./audio-review";
import { VerificationPanel } from "./verification-panel";
import { ReReviewPanel } from "./re-review-panel";
import { CandidateActions } from "./candidate-actions";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const legacySections: Record<string, string> = {
  "#scoring": "profile",
  "#overview": "sources",
  "#check": "profile",
  "#sources": "sources",
  "#candidate-messages": "messages",
  "#history": "profile",
  "#decision": "profile",
  "#decision-publication": "profile",
  "#review-case": "profile",
};
export function CandidateReview({
  application: a,
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
  const mainTab = ["scoring", "overview", "check", "history", "decision"].includes(tab) ? "profile" : tab;
  const activeInterview = a.interviews.find(
    (i) => !["COMPLETED", "CANCELLED"].includes(i.status),
  );
  const waiting = unansweredQuestions(a.messages).length > 0;
  const newAnswer = a.sources.some((s) => s.messageId && !s.views.length);
  const sourceTask = useTask();
  const returnFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const source = a.sources.find((s) => s.id === sourceId);
  const fields = a.fields as unknown as ApplicationFields & {
    iin?: string;
    phone?: string;
  };
  const language = a.language?.state as unknown as LanguageState | undefined;
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
    if (legacySections[hash]) {
      const target = ["#decision", "#decision-publication"].includes(hash) ? "candidate-actions" : hash.slice(1);
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    }
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
          {mainTab === "profile" && (
            <ScoringPanel
              applicationId={a.id}
              data={a.scoring}
              language={
                a.language?.result ??
                (a.language
                  ? "ответ ожидает проверки"
                  : "не начат")
              }
              onSource={openSource}
              actions={<CandidateActions application={a} />}
            />
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
              {fields.intake && <section className="review-section candidate-materials-review">
                <IntakeSummary fields={fields} rules={a.intakeRules as IntakeRules | null} />
                {fields.intake.essay.text && <p className="subtle">Проверка текста эссе: {(() => {
                  const check = a.essayChecks[0];
                  if (!check) return "ещё не запускалась";
                  if (["QUEUED", "RUNNING"].includes(check.status)) return "выполняется";
                  if (check.status === "FAILED") return "не завершилась";
                  return "результат не используется для решения о поступлении";
                })()}.</p>}
                <CredentialReview applicationId={a.id} materialVersion={a.materialVersion} reviews={a.credentialReviews} />
                <VerificationPanel
                  applicationId={a.id}
                  sources={a.verificationSources}
                  requests={a.verificationRequests}
                  onSource={openSource}
                />
                <ReReviewPanel applicationId={a.id} cases={a.reReviewCases} sources={a.sources} reviewers={a.reviewers} onSource={openSource} />
              </section>}
              <section className="review-section candidate-materials-review">
                <h3>Английский язык</h3>
                <p>{a.language?.result ?? "Языковая попытка не начата."}</p>
                {language?.oralId && language?.followupId && <AudioReviewPanel
                  key={String(a.language!.revision) + (audio.job?.id ?? "")}
                  applicationId={a.id}
                  revision={a.language!.revision}
                  oralId={language.oralId}
                  followupId={language.followupId}
                  data={audio}
                  onRequestClarification={() => setTab("messages")}
                />}
              </section>
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
              {a.decisions.length > 0 && <details className="review-detail">
                <summary>Написать кандидату</summary>
                <ReviewDecision application={a} feedbackOnly />
              </details>}
            </section>
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
