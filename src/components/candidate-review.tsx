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
import { dateLabel } from "@/lib/client";
import { stageLabels } from "@/lib/catalog";
import type { ApplicationFields, LanguageState } from "@/lib/types";
import type { AudioState } from "./audio-processing";
import { Messages } from "./messages";
import { Tag } from "./ui";
import { SourceContent } from "./review-source";
import { ScoringPanel } from "./scoring-panel";
import { AudioReviewPanel } from "./audio-review";
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
  const pendingQuestions = unansweredQuestions(a.messages).length;
  const answerCount = a.messages.filter((message) => message.author.role !== "STAFF" && message.replyToId).length;
  const messageCount = Math.max(pendingQuestions, answerCount);
  const returnFocus = useRef<HTMLElement | null>(null);
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
  function openMaterialsTab() {
    setTab("sources");
    window.location.hash = "sources";
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
            {value === "messages" && messageCount > 0 ? <span className="candidate-message-count" aria-label={`${messageCount} сообщений`}>{messageCount}</span> : null}
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
        </div>
      )}
      <div
        className={`review-layout ${mainTab === "profile" ? "candidate-review-layout" : ""} ${source ? "has-source" : "source-closed"}`}
      >
        <div
          className={`review-main ${mainTab === "profile" ? "candidate-profile-layout" : ""}`}
        >
          {mainTab === "profile" && (
            <>
            <a className="mobile-action-jump" href="#candidate-actions">Действия по заявке</a>
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
            />
            </>
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
                    onClick={openMaterialsTab}
                  >
                    Все источники
                  </button>
                </div>
                {a.sources.length ? (
                  <ul className="candidate-material-list">
                    {a.sources.slice(0, 4).map((item) => (
                      <li key={item.id}>
                        <FileText size={18} aria-hidden="true" />
                        <button onClick={openMaterialsTab}>
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
                            <button onClick={openMaterialsTab}>
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
                </section>
              )}
              <CandidateActions application={a} />
            </aside>
          )}
          {tab === "sources" && (
            <section id="sources">
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
                {fields.intake.essay.text && <p className="subtle">AI-анализ эссе: {(() => {
                  const signal = a.scoring.runs.find((run) => run.current)?.showcaseEssaySignal;
                  if (signal) return `${signal.value}% стилистического сходства с образцами AI-текста; авторство не определяется`;
                  const check = a.essayChecks[0];
                  if (!check) return "ещё не запускалась";
                  if (["QUEUED", "RUNNING"].includes(check.status)) return "выполняется";
                  if (check.status === "FAILED") return "не завершилась";
                  return "результат не используется для решения о поступлении";
                })()}.</p>}
                <CredentialReview applicationId={a.id} materialVersion={a.materialVersion} reviews={a.credentialReviews} />
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
                    {mainTab === "profile" ? "Вернуться к оценке" : "Вернуться к материалам"}
                  </button>
                  <SourceContent source={source} interpretation={(() => {
                    const run = a.scoring.runs.find((entry) => entry.current && entry.status === "COMPLETED");
                    const result = run?.reviews[0]?.result ?? run?.result;
                    const domain = result?.domains.find((entry) => entry.evidenceIds.some((id) => result.evidence.some((evidence) => evidence.id === id && evidence.sourceId === source.id)));
                    return domain?.interpretation;
                  })()} />
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
