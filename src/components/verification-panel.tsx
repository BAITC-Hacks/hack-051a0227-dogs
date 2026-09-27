"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask } from "./ui";

type Source = { id: string; version: string; title: string; kind: string; text: string };
type Request = {
  id: string; sourceId: string; sourceVersion: string; quote: string; claim: string;
  kind: string; question: string; status: string; createdAt: Date; publishedAt: Date | null;
};
export function VerificationPanel({ applicationId, sources, requests, suggestion, onSource }: {
  applicationId: string;
  sources: Source[];
  requests: Request[];
  suggestion?: { sourceId: string; question: string };
  onSource: (id: string) => void;
}) {
  const first = sources.find((source) => source.kind === "Эссе") ?? sources[0];
  const [sourceId, setSourceId] = useState(first?.id ?? "");
  const [quote, setQuote] = useState(first?.text.slice(0, 200) ?? "");
  const [claim, setClaim] = useState(first?.text.slice(0, 200) ?? "");
  const [kind, setKind] = useState<"EXPLAIN" | "CONFIRM">("EXPLAIN");
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState<Request | null>(null);
  const task = useTask();
  const router = useRouter();
  const source = sources.find((entry) => entry.id === sourceId);
  return <section id="essay-verification" className="review-section verification-panel">
    <h3>Уточнить содержание</h3>
    <p className="subtle">Вопрос связан с точной цитатой и отправляется только после просмотра сотрудником.</p>
    <div className="verification-grid">
      <label className="field">Материал
        <select value={sourceId} onChange={(event) => {
          const next = sources.find((entry) => entry.id === event.target.value);
          setSourceId(next?.id ?? "");
          setQuote(next?.text.slice(0, 200) ?? "");
          setClaim(next?.text.slice(0, 200) ?? "");
        }}>
          {sources.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
        </select>
      </label>
      <label className="field">Что уточнить
        <select value={kind} onChange={(event) => setKind(event.target.value as "EXPLAIN" | "CONFIRM")}>
          <option value="EXPLAIN">Объяснить мысль или метод</option>
          <option value="CONFIRM">Подтвердить факт или число</option>
        </select>
      </label>
    </div>
    <label className="field">Точная цитата из материала
      <textarea value={quote} onChange={(event) => setQuote(event.target.value)} maxLength={1000} />
    </label>
    <label className="field">Утверждение для обсуждения
      <textarea value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={1000} />
    </label>
    <label className="field">Вопрос кандидату
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder={kind === "EXPLAIN" ? "Как вы пришли к этому выводу и что проверяли?" : "Как вы получили указанное число и какой материал может это пояснить?"} />
    </label>
    {suggestion && sources.some((entry) => entry.id === suggestion.sourceId) && <button type="button" className="text-link" onClick={() => {
      const next = sources.find((entry) => entry.id === suggestion.sourceId)!;
      setSourceId(next.id);
      setQuote(next.text.slice(0, 200));
      setClaim(next.text.slice(0, 200));
      setQuestion(suggestion.question);
    }}>Использовать подготовленный вопрос</button>}
    <div className="row">
      <button type="button" className="button secondary" disabled={!source || task.busy} onClick={() => task.run(async () => {
        const saved = await action<Request>("verification.draft", {
          applicationId, sourceId, sourceVersion: source!.version, quote, claim, kind, question,
          requestKey: crypto.randomUUID(),
        });
        setDraft(saved);
      }, "Черновик сохранён. Проверьте его перед публикацией.")}>Сохранить черновик</button>
      {source && <button type="button" className="text-link" onClick={() => onSource(source.id)}>Открыть источник</button>}
    </div>
    {draft && <div className="notice info verification-preview">
      <strong>Перед публикацией</strong>
      <p>Кандидат увидит вопрос: «{draft.question}»</p>
      <p>Основание: «{draft.quote}»</p>
      <p>Ответ появится в сообщениях. Отправленная версия заявки сохранится.</p>
      <button type="button" className="button primary" disabled={task.busy} onClick={() => task.run(async () => {
        await action("verification.publish", { applicationId, requestId: draft.id, confirm: true });
        setDraft(null);
        router.refresh();
      }, "Вопрос опубликован в сообщениях кандидата.")}>Опубликовать вопрос</button>
    </div>}
    <Feedback task={task} />
    {requests.length > 0 && <details className="verification-history"><summary>История запросов · {requests.length}</summary>
      {requests.map((request) => <div className="evidence-row" key={request.id}>
        <strong>{request.kind === "EXPLAIN" ? "Объяснение" : "Подтверждение"} · {request.status === "DRAFT" ? "Черновик" : request.status === "ANSWERED" ? "Получен ответ" : "Опубликовано"}</strong>
        <p>{request.question}</p>
        <small>{dateLabel(request.createdAt)}</small>
        {request.status === "DRAFT" && <button type="button" className="button secondary small" disabled={task.busy} onClick={() => task.run(async () => {
          await action("verification.publish", { applicationId, requestId: request.id, confirm: true });
          router.refresh();
        }, "Вопрос опубликован.")}>Опубликовать</button>}
      </div>)}
    </details>}
  </section>;
}
