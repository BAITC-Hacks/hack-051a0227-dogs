"use client";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export type MessageView = {
  id: string;
  body: string;
  kind: string;
  createdAt: Date;
  author: { name: string; role: string };
};
export function Messages({
  applicationId,
  messages,
}: {
  applicationId: string;
  messages: MessageView[];
}) {
  const router = useRouter();
  const task = useTask();
  return (
    <div>
      {messages.length ? (
        messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.author.role === "STAFF" ? "staff" : ""}`}
          >
            <div className="message-meta">
              <span>
                {m.kind === "RECEIPT" ? "Статус заявки" : m.author.name}
              </span>
              <time>{dateLabel(m.createdAt)}</time>
            </div>
            <p>{m.body}</p>
          </div>
        ))
      ) : (
        <p className="subtle">Здесь сохраняются вопросы и ответы по заявке.</p>
      )}
      <form
        className="message-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const body = new FormData(form).get("body");
          task.run(async () => {
            await action("message", { applicationId, body });
            form.reset();
            router.refresh();
          }, "Сообщение сохранено в переписке.");
        }}
      >
        <label className="field">
          Ответ или вопрос
          <textarea
            name="body"
            minLength={3}
            maxLength={5000}
            required
            placeholder="Напишите сообщение по заявке"
          />
        </label>
        <button className="button secondary" disabled={task.busy}>
          Отправить в переписку <Send size={16} />
        </button>
        <p className="subtle" style={{ marginTop: 8 }}>
          Сообщение будет доступно в приложении.
        </p>
      </form>
      <Feedback task={task} />
    </div>
  );
}
