"use client";
import type { AvatarIdentity } from "@/lib/avatar";
import { UserAvatar } from "./user-avatar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { questionKinds, unansweredQuestions } from "@/lib/message-state";
import { action, dateLabel, upload } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export type MessageView = {
  id: string;
  body: string;
  kind: string;
  createdAt: Date;
  replyToId?: string | null;
  author: { name: string; role: string } & AvatarIdentity;
};
export function Messages({
  applicationId,
  messages,
  staff = false,
  onSource,
  verificationRequests = [],
}: {
  applicationId: string;
  messages: MessageView[];
  staff?: boolean;
  onSource?: (messageId: string) => void;
  verificationRequests?: {
    id: string;
    questionMessageId: string | null;
    kind: string;
    claim: string;
    status: string;
    attachments: { id: string; name: string }[];
  }[];
}) {
  const router = useRouter(),
    task = useTask();
  const questions = messages.filter(
    (m) => m.author.role === "STAFF" && questionKinds.includes(m.kind),
  );
  const [replyToId, setReplyToId] = useState(
    unansweredQuestions(messages).at(-1)?.id ?? "",
  );
  const [attachment, setAttachment] = useState<File | null>(null);
  const selectedRequest = verificationRequests.find((request) => request.questionMessageId === replyToId);
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
                <span className="message-person">
                  {m.kind !== "RECEIPT" && (
                    <UserAvatar user={m.author} size={32} />
                  )}
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
              {verificationRequests.filter((request) => request.questionMessageId === m.id).map((request) => (
                <div className="message-question" key={request.id}>
                  <strong>{request.kind === "EXPLAIN" ? "Объяснить мысль из материала" : "Подтвердить утверждение"}</strong>
                  <p>Фрагмент: «{request.claim}»</p>
                  {request.attachments.map((file) => <a className="text-link" href={`/api/files/${file.id}`} key={file.id}>{file.name}</a>)}
                </div>
              ))}
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
      {!staff && selectedRequest && (
        <div className="message-attachment">
          <p>Можно приложить материал, указать ссылку в ответе или объяснить, что подтверждение не сохранилось.</p>
          <label className="field">Файл к вопросу
            <input type="file" accept="application/pdf,image/png,image/jpeg,video/mp4" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="button secondary" disabled={!attachment || task.busy} onClick={() => task.run(async () => {
            if (!attachment) return;
            const kind = attachment.type.startsWith("video/") ? "video" : "document";
            await upload(attachment, kind, { purpose: "GENERAL", release: "true", verificationRequestId: selectedRequest.id });
            setAttachment(null);
            router.refresh();
          }, "Материал приложен к вопросу. Комиссия увидит его отдельно от отправленной заявки.")}>Приложить файл</button>
        </div>
      )}
    </div>
  );
}
