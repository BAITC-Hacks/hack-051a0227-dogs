"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask } from "./ui";

type Case = {
  id: string; kind: string; reason: string; status: string; sourceIds: string[];
  materialVersion: string; assigneeId: string | null; resolution: string | null;
  createdAt: Date; updatedAt: Date;
};
const kinds: Record<string, string> = {
  ASSESSMENT_DISAGREEMENT: "Оценки сотрудников различаются",
  NEW_CLARIFICATION: "Получено существенное уточнение",
  TWIN_QUESTION: "Вопрос после проверки устойчивости",
  UNAVAILABLE_EVIDENCE: "Основание больше недоступно",
  CORRECTED_FACT: "Факт исправлен",
  CONTROL_SAMPLE: "Контрольная выборка",
};
export function ReReviewPanel({ applicationId, cases, sources, reviewers, onSource }: {
  applicationId: string;
  cases: Case[];
  sources: { id: string; title: string }[];
  reviewers: { id: string; name: string }[];
  onSource: (id: string) => void;
}) {
  const [kind, setKind] = useState("CORRECTED_FACT");
  const [reason, setReason] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const task = useTask();
  const router = useRouter();
  return <section className="review-section" id="review-case">
    <h3>Повторное рассмотрение</h3>
    <p className="subtle">Здесь фиксируется конкретная причина повторной проверки. Контрольная выборка отмечена отдельно.</p>
    {cases.filter((item) => item.status === "OPEN").map((item) => <div className="evidence-row" key={item.id}>
      <strong>{kinds[item.kind] ?? item.kind}</strong>
      <p>{item.reason}</p>
      <p className="subtle">Открыто {dateLabel(item.createdAt)} · Версия материалов {item.materialVersion.slice(0, 12)}</p>
      <div className="source-buttons">{item.sourceIds.map((id) => <button className="source-button" type="button" key={id} onClick={() => onSource(id)}>{sources.find((source) => source.id === id)?.title ?? "Открыть источник"}</button>)}</div>
      <label className="field">Итог повторной проверки
        <textarea value={resolutions[item.id] ?? ""} onChange={(event) => setResolutions((current) => ({ ...current, [item.id]: event.target.value }))} minLength={15} maxLength={3000} />
      </label>
      <button className="button secondary" disabled={task.busy || (resolutions[item.id] ?? "").trim().length < 15} onClick={() => task.run(async () => {
        await action("reviewCase.close", { applicationId, caseId: item.id, updatedAt: new Date(item.updatedAt).toISOString(), resolution: resolutions[item.id] });
        router.refresh();
      }, "Итог повторного просмотра сохранён в истории.")}>Завершить просмотр</button>
    </div>)}
    <details className="review-detail"><summary>Передать случай на повторный просмотр</summary>
      <label className="field">Основание
        <select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </label>
      <label className="field">Что именно проверить
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={15} maxLength={2000} />
      </label>
      <label className="field">Источник
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Без отдельного источника</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select>
      </label>
      <label className="field">Ответственный
        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Назначить позже</option>{reviewers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
      </label>
      <button className="button secondary" disabled={task.busy || reason.trim().length < 15} onClick={() => task.run(async () => {
        await action("reviewCase.open", { applicationId, requestKey: crypto.randomUUID(), kind, reason, sourceIds: sourceId ? [sourceId] : [], assigneeId: assigneeId || undefined });
        setReason("");
        router.refresh();
      }, "Случай добавлен в очередь повторного рассмотрения.")}>Добавить в очередь</button>
    </details>
    {cases.some((item) => item.status === "CLOSED") && <details className="review-detail"><summary>Завершённые случаи · {cases.filter((item) => item.status === "CLOSED").length}</summary>{cases.filter((item) => item.status === "CLOSED").map((item) => <p key={item.id}><strong>{kinds[item.kind] ?? item.kind}:</strong> {item.resolution}</p>)}</details>}
    <Feedback task={task} />
  </section>;
}
