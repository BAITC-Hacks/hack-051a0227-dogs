"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { VisionMark } from "./user-avatar";

type Answer = {
  text: string;
  claims?: { text: string; refs: { key: string; quote: string }[] }[];
  actions?: { kind: string; label: string; href?: string }[];
};

const suggestions = [
  "Почему я не могу отправить заявку?",
  "Как добавить языковой сертификат?",
  "Нужно ли мне указывать ЕНТ?",
  "Где добавить эссе?",
];

export function IntakeVision({
  onNavigate,
}: {
  onNavigate: (section: number, field?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => abort.current?.abort(), []);

  function open() {
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }

  async function ask(value = question) {
    const text = value.trim();
    if (!text || busy) return;
    setQuestion(text);
    setAsked(text);
    setAnswer(null);
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: {},
          question: text,
          operation: "text",
          requestKey: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Ответ не получен.");
      }
      if (!response.body) throw new Error("Ответ не получен.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (line.startsWith("data: ")) {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              value: unknown;
            };
            if (event.type === "error") throw new Error(String(event.value));
            if (event.type === "answer") setAnswer(event.value as Answer);
            if (event.type === "done") completed = true;
          }
          end = buffer.indexOf("\n\n");
        }
      }
      if (!completed)
        throw new Error("Ответ прервался. Вопрос остался в поле.");
      setQuestion("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message =
        cause instanceof Error ? cause.message : "Ответ не получен.";
      setError(message);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <>
      <button type="button" className="intake-vision-launch" onClick={open}>
        <VisionMark size={30} />
        <span>Спросить Vision</span>
      </button>
      <dialog
        ref={dialog}
        className="intake-vision-dialog"
        onClose={() => {
          abort.current?.abort();
          setBusy(false);
        }}
      >
        <div className="intake-vision-head">
          <div>
            <VisionMark size={34} />
            <h2>Vision · помощь по заявке</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть Vision"
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
        <p>Спроси о требованиях, полях или о том, что осталось до отправки.</p>
        <div className="intake-vision-prompts">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy}
              onClick={() => void ask(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {asked && (
          <div className="intake-vision-reply" aria-live="polite">
            <strong>{asked}</strong>
            {busy && <p role="status">Ищу ответ…</p>}
            {answer && (
              <>
                <p>
                  {answer.claims?.map((claim) => claim.text).join(" ") ||
                    answer.text}
                </p>
                {answer.actions
                  ?.filter(
                    (item) =>
                      item.kind === "LINK" && item.href?.startsWith("/"),
                  )
                  .map((item, index) => {
                    const destination = new URL(
                      item.href!,
                      "https://invision.invalid",
                    );
                    const sectionValue =
                      destination.searchParams.get("section");
                    const section =
                      destination.pathname === "/apply" && sectionValue !== null
                        ? Number(sectionValue)
                        : NaN;
                    return Number.isInteger(section) &&
                      section >= 0 &&
                      section <= 5 ? (
                      <button
                        type="button"
                        className="text-link"
                        key={index}
                        onClick={() => {
                          dialog.current?.close();
                          onNavigate(
                            section,
                            destination.searchParams.get("field") ?? undefined,
                          );
                        }}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <a key={index} href={item.href}>
                        {item.label}
                      </a>
                    );
                  })}
              </>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
          </div>
        )}
        <form
          className="intake-vision-form"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <label htmlFor="intake-vision-question">Твой вопрос</label>
          <textarea
            ref={input}
            id="intake-vision-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Например: что осталось исправить перед отправкой?"
          />
          <button className="button dark" disabled={busy || !question.trim()}>
            <Send size={17} /> Получить ответ
          </button>
        </form>
      </dialog>
    </>
  );
}
