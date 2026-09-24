"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { unansweredQuestions } from "@/lib/message-state";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export type MessageView = {
  id: string;
  body: string;
  kind: string;
  createdAt: Date;
  replyToId?: string | null;
  author: { name: string; role: string };
};
export function Messages({
  applicationId,
  messages,
  staff = false,
  onSource,
}: {
  applicationId: string;
  messages: MessageView[];
  staff?: boolean;
  onSource?: (messageId: string) => void;
}) {
  const router = useRouter(),
    task = useTask();
  const questions = messages.filter(
    (m) =>
      m.author.role === "STAFF" && ["QUESTION", "MESSAGE"].includes(m.kind),
  );
  const [replyToId, setReplyToId] = useState(
    unansweredQuestions(messages).at(-1)?.id ?? "",
  );
  return (
    <div>
      {messages.length ? (
        messages.map((m) => {
          const question = messages.find((q) => q.id === m.replyToId);
          return (
            <article
              key={m.id}
              className={`message ${m.author.role === "STAFF" ? "staff" : ""}`}
              id={`message-${m.id}`}
            >
              <div className="message-meta">
                <span>
                  {m.kind === "RECEIPT"
                    ? "Статус заявки"
                    : `${m.author.role === "STAFF" ? "Комиссия" : "Кандидат"}: ${m.author.name}`}
                </span>
                <time>{dateLabel(m.createdAt)}</time>
              </div>
              {question && (
                <details className="message-question">
                  <summary>На какой вопрос дан ответ</summary>
                  <p>{question.body}</p>
                  <p className="subtle">
                    {question.author.name} · {dateLabel(question.createdAt)}
                  </p>
                </details>
              )}
              <p>{m.body}</p>
              {staff &&
                m.kind !== "RECEIPT" &&
                m.author.role === "CANDIDATE" &&
                onSource && (
                  <button className="text-link" onClick={() => onSource(m.id)}>
                    Открыть ответ как источник
                  </button>
                )}
              {!staff && questions.includes(m) && (
                <button
                  className="text-link"
                  onClick={() => {
                    setReplyToId(m.id);
                    document.getElementById("message-body")?.focus();
                  }}
                >
                  Ответить на этот вопрос
                </button>
              )}
            </article>
          );
        })
      ) : (
        <p>Здесь сохраняются вопросы комиссии и ответы по заявке.</p>
      )}
      <form
        className="message-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            body = new FormData(form).get("body");
          task.run(
            async () => {
              await action("message", {
                applicationId,
                body,
                replyToId: !staff && replyToId ? replyToId : undefined,
              });
              form.reset();
              router.refresh();
            },
            staff
              ? "Вопрос опубликован в сообщениях университета."
              : "Ответ сохранён. Комиссия увидит его в материалах заявки.",
          );
        }}
      >
        {!staff && questions.length > 0 && (
          <label className="field">
            На какой вопрос отвечаешь
            <select
              value={replyToId}
              onChange={(e) => setReplyToId(e.target.value)}
            >
              <option value="">Дополнительное сообщение</option>
              {questions.map((q) => (
                <option value={q.id} key={q.id}>
                  {dateLabel(q.createdAt)} · {q.body.slice(0, 110)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          {staff ? "Вопрос кандидату" : "Твой ответ или уточнение"}
          <textarea
            id="message-body"
            name="body"
            minLength={3}
            maxLength={5000}
            required
          />
        </label>
        <button className="button secondary" disabled={task.busy}>
          {staff ? "Опубликовать вопрос" : "Отправить ответ"}
        </button>
        <p className="subtle">Сообщение будет доступно в приложении.</p>
      </form>
      <Feedback task={task} />
    </div>
  );
}
