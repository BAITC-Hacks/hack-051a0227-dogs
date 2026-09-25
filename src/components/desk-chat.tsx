"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, X, LoaderCircle } from "lucide-react";
import { action, ActionError, dateLabel } from "@/lib/client";
import type { DeskChatTurn } from "@/lib/desk-chat-contract";
import type { DeskDraft } from "@/lib/vision-desk-contract";
import { VisionMark } from "./user-avatar";
import { Feedback, useTask } from "./ui";
type Preview = {
  id: string;
  digest: string;
  content: DeskDraft;
  recipient: string;
  expiresAt: string;
};
export function DeskConversation({
  applicationIds = [],
  sourceId,
  initialQuestion = "",
  onSource,
}: {
  applicationIds?: string[];
  sourceId?: string;
  initialQuestion?: string;
  onSource?: (id: string) => void;
}) {
  const [question, setQuestion] = useState(initialQuestion),
    [turns, setTurns] = useState<DeskChatTurn[]>([]),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [quote, setQuote] = useState<{
      title: string;
      quote: string;
      version: string;
      origin: string;
    } | null>(null),
    [draft, setDraft] = useState<{
      turnId: string;
      text: string;
      kind: "QUESTION" | "ATOLA";
    } | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [historyError, setHistoryError] = useState(""),
    [sending, setSending] = useState(false);
  const task = useTask();
  const bottom = useRef<HTMLDivElement>(null);
  const sourceQuote = useRef<HTMLElement>(null);
  const selection = JSON.stringify(applicationIds);
  useEffect(() => {
    let active = true;
    const load = () => {
      setTurns([]);
      setQuote(null);
      setDraft(null);
      setPreview(null);
      setConfirmed(false);
      void action<{ history: DeskChatTurn[] }>("desk.chatLoad", {
        applicationIds: JSON.parse(selection),
      })
        .then((v) => {
          if (active) {
            setHistoryError("");
            setTurns(v.history);
            const failed = v.history.find(
              (t) => t.status === "FAILED" && !t.unavailable,
            );
            if (failed && !initialQuestion)
              setQuestion((current) => current || failed.question);
          }
        })
        .catch((e: unknown) => {
          if (active)
            setHistoryError(
              e instanceof Error ? e.message : "Не удалось загрузить историю.",
            );
        });
    };
    const resume = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selection, initialQuestion]);
  const pending = turns.some((t) => t.status === "RUNNING" && !t.unavailable);
  useEffect(() => {
    if (!pending) return;
    let active = true,
      count = 0;
    const timer = setInterval(() => {
      if (++count > 30) {
        clearInterval(timer);
        return;
      }
      void action<{ history: DeskChatTurn[] }>("desk.chatLoad", {
        applicationIds: JSON.parse(selection),
      })
        .then((v) => {
          if (active) setTurns(v.history);
        })
        .catch(() => clearInterval(timer));
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pending, selection]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);
  useEffect(() => {
    if (quote) sourceQuote.current?.focus();
  }, [quote]);
  function edit(value: string) {
    setQuestion(value);
    setRequestKey(crypto.randomUUID());
  }
  async function send() {
    setHistoryError("");
    setSending(true);
    let answer: DeskChatTurn;
    try {
      answer = await action<DeskChatTurn>("desk.chatAsk", {
        applicationIds,
        sourceId,
        question,
        requestKey,
        previousId: turns.find((t) => t.answer && !t.unavailable)?.id,
      });
    } catch (e) {
      // A definitive server rejection may be retried; uncertain transport
      // failures retain the idempotency key to recover the original request.
      if (e instanceof ActionError && e.status >= 400)
        setRequestKey(crypto.randomUUID());
      throw e;
    } finally {
      setSending(false);
    }
    setTurns((t) => [answer, ...t.filter((x) => x.id !== answer.id)]);
    setRequestKey(crypto.randomUUID());
    if (answer.status === "COMPLETED") setQuestion("");
  }
  return (
    <div className="desk-conversation">
      <div className="desk-scroll">
        {historyError && (
          <p className="notice" role="status">
            {historyError}
          </p>
        )}
        {!turns.some((t) => t.answer) && (
          <div className="desk-starters">
            <p>Задайте предметный вопрос или начните с одного из этих:</p>
            {(applicationIds.length
              ? [
                  "Какие вопросы стоит уточнить по этим материалам?",
                  "Подготовь вопросы ATOLA по личному вкладу и результату.",
                ]
              : [
                  "Как организовать рассмотрение новых заявок?",
                  "Что даёт сравнение кандидатов и как его использовать?",
                ]
            ).map((q) => (
              <button
                key={q}
                className="button secondary"
                onClick={() => edit(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <Feedback task={{ ...task, busy: false }} />
        {quote && (
          <aside className="desk-source-quote" ref={sourceQuote} tabIndex={-1}>
            <div className="row between">
              <strong>{quote.title}</strong>
              <button
                aria-label="Закрыть цитату"
                className="icon-button"
                onClick={() => setQuote(null)}
              >
                <X size={16} />
              </button>
            </div>
            <blockquote>{quote.quote}</blockquote>
            <p>{quote.origin}</p>
            <details>
              <summary>Версия источника</summary>
              <p className="meta">{quote.version}</p>
            </details>
          </aside>
        )}
        <div className="desk-turns" aria-live="polite">
          {[...turns].reverse().map((t) => (
            <article key={t.id} className="desk-turn">
              <p className="desk-asked">{t.question}</p>
              {t.unavailable ? (
                <p>
                  Материалы изменились или стали недоступны. Задайте вопрос по
                  текущей версии.
                </p>
              ) : t.answer ? (
                <>
                  <div className="row">
                    <VisionMark size={28} />
                    <strong>Vision Desk</strong>
                    <span className="meta">{dateLabel(t.createdAt)}</span>
                  </div>
                  {t.answer.paragraphs.map((p, i) => (
                    <div key={i}>
                      <p>{p.text}</p>
                      {p.evidenceKeys.map((k) => {
                        const s = t.answer!.sources.find((s) => s.key === k)!;
                        return (
                          <button
                            key={k}
                            className="source-button"
                            onClick={() =>
                              task.run(async () =>
                                setQuote(
                                  await action("desk.chatSource", {
                                    answerId: t.id,
                                    sourceKey: k,
                                    applicationIds,
                                  }),
                                ),
                              )
                            }
                          >
                            {s.title} · цитата
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {t.answer.sources.length > 0 && (
                    <div className="desk-related">
                      {[
                        ...new Set(
                          t.answer.sources.map((s) => s.applicationId),
                        ),
                      ].map((id) => (
                        <Link
                          key={id}
                          className="text-link"
                          href={`/admissions/candidates/${id}`}
                        >
                          Открыть карточку кандидата
                        </Link>
                      ))}
                      {onSource &&
                        t.answer.sources.map((s) => (
                          <button
                            key={s.key}
                            className="text-link"
                            onClick={() => onSource(s.sourceId)}
                          >
                            Открыть {s.title.toLowerCase()} рядом
                          </button>
                        ))}
                    </div>
                  )}
                  {t.answer.question && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setDraft({
                          turnId: t.id,
                          kind: "QUESTION",
                          text: t.answer!.question!.text,
                        });
                        setPreview(null);
                        setConfirmed(false);
                      }}
                    >
                      Проверить черновик уточнения
                    </button>
                  )}
                  {!!t.answer.interview.length && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setDraft({ turnId: t.id, kind: "ATOLA", text: "" });
                        setPreview(null);
                        setConfirmed(false);
                      }}
                    >
                      Проверить вопросы ATOLA
                    </button>
                  )}
                </>
              ) : (
                <p>
                  {t.status === "RUNNING"
                    ? "Запрос выполняется. Обновите историю после завершения."
                    : "Ответ не получен. Можно повторить вопрос."}
                </p>
              )}
            </article>
          ))}
          <div ref={bottom} />
        </div>
        {draft && (
          <section className="desk-draft">
            <h3>
              {draft.kind === "QUESTION"
                ? "Уточнение кандидату"
                : "Вопросы для интервью"}
            </h3>
            {draft.kind === "QUESTION" ? (
              <label>
                Текст уточнения
                <textarea
                  rows={4}
                  value={draft.text}
                  onChange={(e) => {
                    setDraft({ ...draft, text: e.target.value });
                    setPreview(null);
                    setConfirmed(false);
                  }}
                />
              </label>
            ) : (
              turns
                .find((t) => t.id === draft.turnId)
                ?.answer?.interview.map((q, i) => <p key={i}>{q.text}</p>)
            )}
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  setPreview(
                    await action("desk.chatPreview", {
                      answerId: draft.turnId,
                      kind: draft.kind,
                      text: draft.text,
                      applicationIds,
                    }),
                  );
                  setConfirmed(false);
                })
              }
            >
              Предпросмотр действия
            </button>
            {preview && (
              <aside className="desk-preview">
                <h4>{preview.recipient}</h4>
                {preview.content.kind === "QUESTION" ? (
                  <p>{preview.content.body}</p>
                ) : (
                  preview.content.questions.map((q) => (
                    <p key={q.id}>{q.text}</p>
                  ))
                )}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {draft.kind === "QUESTION"
                    ? "Отправить этот вопрос этому кандидату"
                    : "Добавить эти вопросы в существующий план"}
                </label>
                <button
                  className="button dark"
                  disabled={!confirmed || task.busy}
                  onClick={() =>
                    task.run(
                      async () => {
                        await action("desk.confirm", {
                          id: preview.id,
                          digest: preview.digest,
                          content: preview.content,
                          confirm: true,
                        });
                        setPreview(null);
                        setDraft(null);
                      },
                      draft.kind === "QUESTION"
                        ? "Вопрос опубликован в приложении."
                        : "Вопросы добавлены в ATOLA.",
                    )
                  }
                >
                  Подтвердить действие
                </button>
              </aside>
            )}
          </section>
        )}
      </div>
      <form
        className="desk-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(send);
        }}
      >
        <label htmlFor={`desk-question-${sourceId ?? "queue"}`}>
          Вопрос Vision Desk
        </label>
        <textarea
          disabled={task.busy}
          id={`desk-question-${sourceId ?? "queue"}`}
          rows={3}
          value={question}
          maxLength={2000}
          onChange={(e) => edit(e.target.value)}
          placeholder="Например: что нужно уточнить перед интервью?"
        />
        <button
          className="button dark"
          disabled={task.busy || !question.trim()}
        >
          <>
            {sending ? (
              <LoaderCircle className="desk-spinner" size={18} />
            ) : (
              <Send size={17} />
            )}
          </>
          {sending ? "Готовим ответ…" : "Отправить вопрос"}
        </button>
      </form>
    </div>
  );
}
export function DeskChatLauncher({
  applicationIds = [],
  names = [],
  compact = false,
}: {
  applicationIds?: string[];
  names?: string[];
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened) dialog.current?.showModal();
    else dialog.current?.close();
  }, [opened]);
  return (
    <>
      <button
        className={
          compact
            ? "icon-button desk-launch-compact"
            : "button dark desk-launch"
        }
        aria-label={
          compact ? "Спросить Vision Desk о кандидате" : "Открыть Vision Desk"
        }
        title="Спросить Vision Desk"
        onClick={() => setOpened(true)}
      >
        <VisionMark size={compact ? 30 : 26} />
        {!compact && (
          <>
            Vision Desk
            {applicationIds.length ? ` · ${applicationIds.length}` : ""}
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="desk-dialog"
        onClose={() => setOpened(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpened(false);
        }}
      >
        <div className="desk-dialog-head">
          <VisionMark />
          <div>
            <h2>Vision Desk</h2>
            <p>
              {names.length
                ? names.join(", ")
                : "Вопросы по заявкам и работе комиссии"}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Закрыть Vision Desk"
            onClick={() => setOpened(false)}
          >
            <X size={20} />
          </button>
        </div>
        {opened && (
          <DeskConversation
            key={applicationIds.join(":")}
            applicationIds={applicationIds}
          />
        )}
      </dialog>
    </>
  );
}
