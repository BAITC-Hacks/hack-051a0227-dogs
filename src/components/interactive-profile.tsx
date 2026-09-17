"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import type { ScoringResult } from "@/lib/scoring-contract";
import { domains } from "@/lib/catalog";
import {
  profileTopics,
  drive,
  type ProfileScope,
  type ProfileTopic,
  type ProfileView,
  type ProfileTurnView,
  type ProfileSource,
  type DevelopmentRecommendation,
  type DevelopmentView,
} from "@/lib/profile-contract";
import { Feedback, useTask } from "./ui";
export function InteractiveProfile({
  scope = {},
  title = "AI-профиль · объяснить и продолжить",
  initialTopic,
  onFeedback,
}: {
  scope?: ProfileScope;
  title?: string;
  initialTopic?: ProfileTopic;
  onFeedback?: (runId: string, result: ScoringResult) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [open, setOpen] = useState(false),
    [view, setView] = useState<ProfileView | null>(null);
  const [question, setQuestion] = useState(""),
    [source, setSource] = useState<ProfileSource | null>(null);
  const [selected, setSelected] = useState(""),
    [domain, setDomain] = useState<ProfileScope["domain"]>(
      scope.applicationId ? domains[5] : undefined,
    );
  const [workOptions, setWorkOptions] = useState<ProfileView["works"]>([]);
  const task = useTask(),
    sourceTask = useTask(),
    router = useRouter();
  const sourceReturn = useRef<HTMLButtonElement | null>(null),
    sourcePanel = useRef<HTMLDivElement | null>(null),
    answerPanel = useRef<HTMLDivElement | null>(null);
  const request = useRef({ signature: "", key: "" });
  const activeScope: ProfileScope = {
    ...scope,
    ...(selected ? { attemptId: selected } : {}),
    ...(domain ? { domain } : {}),
  };
  const scopeText = JSON.stringify(activeScope);
  async function load() {
    const v = await action<ProfileView>("profile.load", { scope: activeScope });
    setView(v);
    if (!selected) setWorkOptions(v.works);
    return v;
  }
  // No localStorage or cached source previews. Revalidate after returning to the page.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = () => {
      setSource(null);
      setView(null);
      if (document.visibilityState === "hidden") return;
      action<ProfileView>("profile.load", { scope: JSON.parse(scopeText) })
        .then((v) => {
          if (!cancelled) setView(v);
        })
        .catch(() => {
          if (!cancelled) setView(null);
        });
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open, scopeText]);
  async function ask(topic?: ProfileTopic, loaded = view) {
    const text = topic ? profileTopics[topic] : question.trim();
    if (!text) return;
    const previous = loaded?.history.find((h) => !h.unavailable);
    const signature = JSON.stringify({
      scope: activeScope,
      text,
      topic,
      previousId: previous?.id,
    });
    if (request.current.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    const result = await action<ProfileTurnView>("profile.ask", {
      scope: activeScope,
      question: text,
      topic,
      previousId: previous?.id,
      requestKey: request.current.key,
    });
    setQuestion("");
    setSource(null);
    const updated = await load();
    setView({
      ...updated,
      history: [result, ...updated.history.filter((h) => h.id !== result.id)],
    });
    answerPanel.current?.focus();
  }
  async function perform(h: ProfileTurnView, key: string) {
    const result = await action<{
      href?: string;
      runId?: string;
      result?: ScoringResult;
      alreadyAdded?: boolean;
    }>("profile.perform", {
      scope: activeScope,
      answerId: h.id,
      actionKey: key,
    });
    if (result.runId && result.result && onFeedback)
      onFeedback(result.runId, result.result);
    else if (result.href) router.push(result.href);
  }
  return (
    <section
      className={`interactive-profile ${open ? "is-open" : ""}`}
      aria-label={title}
    >
      <button
        className="profile-trigger"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            setSource(null);
            setView(null);
          } else {
            setOpen(true);
            void task.run(async () => {
              const v = await load();
              if (initialTopic) await ask(initialTopic, v);
            });
          }
        }}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="profile-body">
          <p className="profile-boundary">
            {scope.applicationId
              ? "Ответы по доступным материалам заявки. Предложение системы, человеческая проверка и публикация разделены."
              : "По твоим сохранённым работам и опубликованным сообщениям. Здесь нет оценки личности."}
          </p>
          {!scope.attemptId &&
            view?.audience === "CANDIDATE" &&
            workOptions.length > 1 && (
              <label className="field">
                Работа в фокусе
                <select
                  value={selected}
                  disabled={task.busy}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setView(null);
                    setSource(null);
                    void task.run(async () =>
                      setView(
                        await action<ProfileView>("profile.load", {
                          scope: {
                            ...scope,
                            ...(e.target.value
                              ? { attemptId: e.target.value }
                              : {}),
                          },
                        }),
                      ),
                    );
                  }}
                >
                  <option value="">Последняя работа и мой путь</option>
                  {workOptions.map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.title} · версия {w.revision}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {scope.applicationId && (
            <label className="field">
              Область в фокусе
              <select
                value={domain}
                disabled={task.busy}
                onChange={(e) => {
                  const d = e.target.value as ProfileScope["domain"];
                  setDomain(d);
                  setSource(null);
                  setView(null);
                  void task.run(async () =>
                    setView(
                      await action<ProfileView>("profile.load", {
                        scope: { ...scope, domain: d },
                      }),
                    ),
                  );
                }}
              >
                {domains.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          )}
          <div
            className="profile-prompts"
            aria-label="Вопросы по текущему контексту"
          >
            {view?.topics
              .filter((t) =>
                scope.feedbackId
                  ? ["feedback", "grounds", "application", "next"].includes(t)
                  : scope.attemptId
                    ? [
                        "result",
                        "changes",
                        "next",
                        "direction",
                        "transferred",
                      ].includes(t)
                    : true,
              )
              .map((t) => (
                <button
                  className="button secondary"
                  disabled={task.busy}
                  key={t}
                  onClick={() => task.run(() => ask(t))}
                >
                  {profileTopics[t]}
                </button>
              ))}
          </div>
          <Feedback task={task} />
          {!view && !task.busy && (
            <button
              className="button secondary"
              onClick={() =>
                task.run(async () => {
                  await load();
                })
              }
            >
              Обновить доступные сведения
            </button>
          )}
          <div className="profile-conversation" ref={answerPanel} tabIndex={-1}>
            {view?.history.slice(0, showHistory ? 12 : 1).map((h) => (
              <article className="profile-answer" key={h.id}>
                <p className="profile-answer-date">
                  {dateLabel(h.createdAt)}
                  {h.stale && !h.unavailable
                    ? " · Ответ по прежнему состоянию. Задай вопрос заново для актуальной версии."
                    : ""}
                </p>
                <h3>{h.question}</h3>
                {!h.answer ? (
                  <p>
                    Основание удалено или доступ изменился. Содержимое ответа
                    скрыто.
                  </p>
                ) : (
                  <>
                    <p>{h.answer.text}</p>
                    {h.answer.claims.map((claim, i) => (
                      <div className="profile-claim" key={i}>
                        {claim.text.length > 1800 ? (
                          <details>
                            <summary>
                              {claim.text.split("\n")[0].slice(0, 220)} —
                              подробнее
                            </summary>
                            <p className="profile-text">{claim.text}</p>
                          </details>
                        ) : (
                          <p className="profile-text">{claim.text}</p>
                        )}
                        <div className="profile-source-links">
                          {claim.refs.map((ref, n) => (
                            <button
                              key={ref.key}
                              className="text-link"
                              disabled={sourceTask.busy}
                              onClick={(e) => {
                                sourceReturn.current = e.currentTarget;
                                sourceTask.run(async () => {
                                  setSource(null);
                                  const s = await action<ProfileSource>(
                                    "profile.source",
                                    {
                                      scope: activeScope,
                                      answerId: h.id,
                                      sourceKey: ref.key,
                                    },
                                  );
                                  setSource(s);
                                  requestAnimationFrame(() => {
                                    sourcePanel.current?.focus();
                                    sourcePanel.current?.scrollIntoView({
                                      block: "start",
                                    });
                                  });
                                });
                              }}
                            >
                              Основание
                              {claim.refs.length > 1 ? ` ${n + 1}` : ""} ↗
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="profile-prompts">
                      {h.answer.actions.map((a) => (
                        <button
                          key={a.key}
                          className="button secondary"
                          disabled={task.busy}
                          onClick={() => task.run(() => perform(h, a.key))}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
          {view && view.history.length > 1 && (
            <button
              className="text-link"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory
                ? "Скрыть предыдущие ответы"
                : `Предыдущие ответы (${view.history.length - 1})`}
            </button>
          )}
          {source && (
            <div
              className="profile-source"
              ref={sourcePanel}
              tabIndex={-1}
              role="region"
              aria-label="Источник ответа"
            >
              <div className="profile-source-heading">
                <h3>{source.title}</h3>
                <button
                  className="button quiet"
                  onClick={() => {
                    setSource(null);
                    sourceReturn.current?.focus();
                  }}
                >
                  Вернуться к ответу
                </button>
              </div>
              <p>
                {source.origin} · {source.kind}
                {source.current ? "" : " · сохранённая прежняя версия"}
              </p>
              <p className="profile-text">{source.text}</p>
              {source.href && (
                <a
                  className="text-link"
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть материал
                </a>
              )}
            </div>
          )}
          <Feedback task={sourceTask} />
          <form
            className="profile-question"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(() => ask());
            }}
          >
            <label className="field">
              Продолжить вопрос по этим материалам
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Например: «Что изменилось?» или «Покажи источник»"
              />
            </label>
            <button
              className="button dark"
              disabled={!question.trim() || task.busy || !view}
            >
              Получить ответ
            </button>
          </form>
          {view?.audience === "CANDIDATE" && (
            <DevelopmentArea view={view} scope={activeScope} reload={load} />
          )}
        </div>
      )}
    </section>
  );
}
function DevelopmentArea({
  view,
  scope,
  reload,
}: {
  view: ProfileView;
  scope: ProfileScope;
  reload: () => Promise<ProfileView>;
}) {
  const task = useTask();
  const suggestions = view.recommendations
    .filter((r) => !view.steps.some((s) => s.recommendation?.key === r.key))
    .slice(0, 3);
  return (
    <section className="development-area" aria-label="Личные шаги развития">
      <h3>Личный следующий шаг</h3>
      <p>
        Выбирай то, что полезно сейчас. Эти действия не влияют на приёмные
        оценки.
      </p>
      {suggestions.map((r) => (
        <article className="development-recommendation" key={r.key}>
          <RecommendationText r={r} />
          <button
            className="button secondary"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await action("profile.stepStart", { scope, key: r.key });
                await reload();
              }, "Шаг сохранён в личном плане")
            }
          >
            Сохранить личный шаг
          </button>
        </article>
      ))}
      <Feedback task={task} />
      {view.steps.map((s) => (
        <DevelopmentStepCard
          key={`${s.id}-${s.revision}`}
          step={s}
          scope={scope}
          reload={reload}
        />
      ))}
      <details className="drive-framework">
        <summary>О направлениях D.R.I.V.E.</summary>
        {Object.entries(drive).map(([letter, d]) => (
          <p key={letter}>
            <strong>
              {letter} · {d.name}
            </strong>{" "}
            — {d.title}
          </p>
        ))}
        <p>
          Связь упражнений с рамкой — конфигурация приложения, а не официальная
          формула университета. Баллы по буквам не рассчитываются.
        </p>
        <a
          className="text-link"
          href="https://www.invisionu.education/ru/foundation"
          target="_blank"
          rel="noreferrer"
        >
          Рамка inVision U
        </a>
      </details>
    </section>
  );
}
function RecommendationText({ r }: { r: DevelopmentRecommendation }) {
  return (
    <>
      <p className="profile-answer-date">
        {r.origin}
        {r.revision !== undefined ? ` · версия ${r.revision}` : ""}
      </p>
      <h4>{r.title}</h4>
      <p className="profile-text">{r.basis}</p>
      <p>{r.purpose}</p>
      {r.drive && (
        <p className="drive-mark">
          {r.drive} · {drive[r.drive].title}
        </p>
      )}
      <p>
        <strong>Завершение:</strong> {r.completion}
      </p>
    </>
  );
}
function DevelopmentStepCard({
  step: s,
  scope,
  reload,
}: {
  step: DevelopmentView;
  scope: ProfileScope;
  reload: () => Promise<ProfileView>;
}) {
  const [note, setNote] = useState(s.note),
    [complete, setComplete] = useState(s.status === "SELF_REPORTED");
  const task = useTask(),
    router = useRouter();
  if (!s.recommendation)
    return (
      <p className="notice">
        Личный шаг сохранён, но его основание больше недоступно.
      </p>
    );
  const r = s.recommendation;
  return (
    <article className="development-step" id={`development-${s.id}`}>
      <RecommendationText r={r} />
      <p className="result-state">
        {s.status === "RESULT_SAVED"
          ? "Задание выполнено · результат сохранён"
          : s.status === "SELF_REPORTED"
            ? "Ты отметил выполнение личного шага"
            : "Сохранено в личном плане"}
        {s.stale ? " · Основание относится к прежней версии работы" : ""}
      </p>
      {r.kind !== "EXPLAIN" && (
        <button
          className="button dark"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              const result = await action<{ href: string }>(
                "profile.stepContinue",
                { scope, id: s.id },
              );
              router.push(result.href);
            })
          }
        >
          {s.status === "RESULT_SAVED"
            ? "Открыть задачу"
            : "Продолжить связанную задачу"}
        </button>
      )}
      <label className="field">
        {r.kind === "EXPLAIN"
          ? "Моё объяснение выбора"
          : "Моя заметка к следующему шагу"}
        <textarea
          value={note}
          rows={3}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {r.kind === "EXPLAIN" && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
          />
          Я выполнил этот личный шаг
        </label>
      )}
      <button
        className="button secondary"
        disabled={task.busy || (complete && note.trim().length < 20)}
        onClick={() =>
          task.run(async () => {
            await action("profile.stepSave", {
              scope,
              id: s.id,
              revision: s.revision,
              note,
              complete,
            });
            await reload();
          }, "Личный шаг сохранён")
        }
      >
        Сохранить запись
      </button>
      {r.origin === "Опубликованная обратная связь" && (
        <Link className="text-link" href="/my#application-messages">
          Отдельно ответить комиссии
        </Link>
      )}
      <p className="subtle">
        Выполнение действия не означает измерение навыка.
      </p>
      <Feedback task={task} />
    </article>
  );
}
