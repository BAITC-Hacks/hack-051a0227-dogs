"use client";
import "./axis-profile.css";
import { useState } from "react";
import { action } from "@/lib/client";
import { axisPoints } from "@/lib/axis-profile";
import type { ScoringResult, ScoringView } from "@/lib/scoring-contract";
import { Feedback, useTask } from "./ui";

type Run = ScoringView["runs"][number];
const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 104;
function xy(index: number, value: number, maximum: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 9;
  const radius = (value / maximum) * RADIUS;
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius] as const;
}
function segments(points: ReturnType<typeof axisPoints>) {
  const result: string[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (point.value === null || next.value === null || point.maximum !== next.maximum) return;
    const [x1, y1] = xy(index, point.value, point.maximum);
    const [x2, y2] = xy((index + 1) % points.length, next.value, next.maximum);
    result.push(`${x1},${y1} ${x2},${y2}`);
  });
  return result;
}
export function AxisProfile({
  run,
  applicationId,
  onSource,
  onUpdated,
}: {
  run: Run;
  applicationId: string;
  onSource: (id: string) => void;
  onUpdated: (view: ScoringView) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [quote, setQuote] = useState("");
  const [secondSourceId, setSecondSourceId] = useState("");
  const [secondQuote, setSecondQuote] = useState("");
  const [explanation, setExplanation] = useState("");
  const [reason, setReason] = useState("");
  const task = useTask();
  const points = axisPoints(run);
  const result = run.reviews[0]?.result ?? run.result;
  const item = points[selected];
  const domain = result?.domains[selected];
  const selectedSource = run.sources.find((source) => source.id === sourceId);
  const secondSource = run.sources.find((source) => source.id === secondSourceId);
  const sourceEvidence = item.evidenceIds
    .map((id) => result?.evidence.find((evidence) => evidence.id === id))
    .filter((evidence): evidence is NonNullable<typeof evidence> => !!evidence) ?? [];
  const canEdit = run.current && run.status === "COMPLETED" && !!result;
  const episodeCount = new Set([
    ...sourceEvidence.map((entry) => run.sources.find((source) => source.id === entry.sourceId)?.episodeId),
    selectedSource?.episodeId,
    secondSource?.episodeId,
  ].filter(Boolean)).size;
  const startEdit = () => {
    setEditing(true);
    setScore(item.value === null ? "" : String(item.value));
    setExplanation(domain?.interpretation ?? "");
    const evidence = sourceEvidence.find((entry) => run.sources.some((source) => source.id === entry.sourceId && source.assessable));
    const source = run.sources.find((entry) => entry.id === evidence?.sourceId) ?? run.sources.find((entry) => entry.assessable && entry.text);
    setSourceId(source?.id ?? "");
    setQuote(evidence?.quote ?? source?.text.slice(0, 240) ?? "");
    setSecondSourceId("");
    setSecondQuote("");
  };
  async function save() {
    if (!result || !domain) return;
    const selectedEvidence = sourceEvidence.find((entry) => entry.sourceId === sourceId && entry.quote === quote);
    const evidenceId = selectedEvidence?.id ?? `human-${crypto.randomUUID()}`;
    const evidence = selectedEvidence ?? {
      id: evidenceId,
      sourceId,
      sourceVersion: selectedSource?.version ?? "",
      quote,
      explanation: reason,
    };
    const existingSecond = score === "2" ? sourceEvidence.find((entry) => entry.sourceId === secondSourceId && entry.quote === secondQuote) : undefined;
    const secondEvidence = score === "2" && secondSource ? existingSecond ?? {
      id: `human-${crypto.randomUUID()}`,
      sourceId: secondSource.id,
      sourceVersion: secondSource.version,
      quote: secondQuote,
      explanation: reason,
    } : null;
    const value = score ? Number(score) : null;
    const rating = value === null ? null : {
      label: value === 1 ? "Есть проявление" : "Устойчивое проявление",
      value: null,
    };
    const updated: ScoringResult = {
      ...result,
      evidence: value === null ? result.evidence : [
        ...result.evidence,
        ...[evidence, secondEvidence].filter((entry): entry is NonNullable<typeof entry> => !!entry && !result.evidence.some((saved) => saved.id === entry.id)),
      ],
      domains: result.domains.map((entry, index) => index === selected
        ? {
            ...entry,
            rating,
            interpretation: explanation,
            sufficiency: rating ? "Частично" : entry.sufficiency,
            evidenceIds: rating ? [...new Set([...entry.evidenceIds, evidenceId, ...(secondEvidence ? [secondEvidence.id] : [])])] : [],
          }
        : entry),
    };
    await action("scoring.review", {
      applicationId,
      runId: run.id,
      requestKey: crypto.randomUUID(),
      baseReviewId: run.reviews[0]?.id ?? null,
      result: updated,
      rejectedEvidenceIds: run.reviews[0]?.rejectedEvidenceIds ?? [],
      reason,
    });
    onUpdated(await action<ScoringView>("scoring.status", { applicationId }));
    setEditing(false);
    setReason("");
  }
  return (
    <section className="axis-panel" aria-labelledby="axis-title">
      <div className="axis-heading">
        <div>
          <span className="axis-kicker">AXIS · девять областей</span>
          <h3 id="axis-title">Баллы и основания</h3>
        </div>
      </div>
      <div className="axis-layout">
        <div className="axis-chart-wrap">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Диаграмма AXIS; значения и основания доступны в списке справа">
            {[1, 2].map((ring) => (
              <polygon key={ring} points={points.map((_, index) => xy(index, ring, 2).join(",")).join(" ")} className="axis-grid" />
            ))}
            {points.map((_, index) => {
              const [x, y] = xy(index, 2, 2);
              const [lx, ly] = xy(index, 2.38, 2);
              return <g key={index}><line x1={CENTER} y1={CENTER} x2={x} y2={y} className="axis-spoke" /><text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="axis-number">{index + 1}</text></g>;
            })}
            {segments(points).map((line, index) => <polyline key={`current-${index}`} points={line} className="axis-line axis-line-current" />)}
            {points.map((point, index) => point.value !== null ? <circle key={`current-dot-${index}`} cx={xy(index, point.value, point.maximum)[0]} cy={xy(index, point.value, point.maximum)[1]} r={index === selected ? 7 : 5} className="axis-dot-current" /> : null)}
          </svg>
        </div>
        <div className="axis-list" aria-label="Области AXIS">
          {points.map((point, index) => (
            <button type="button" key={point.criterionId} className={`axis-row ${selected === index ? "selected" : ""}`} aria-pressed={selected === index} onClick={() => { setSelected(index); setEditing(false); }}>
              <span className="axis-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{point.criterionId}</span>
              <strong>{point.value === null ? "Не оценено" : `${point.value} / ${point.maximum}`}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="axis-detail">
        <div className="axis-detail-head">
          <div><span className="axis-kicker">Критерий {selected + 1}</span><h4>{item.criterionId}</h4></div>
          <strong>{item.value === null ? "Не оценено" : `${item.value} из ${item.maximum}`}</strong>
        </div>
        {canEdit && !editing && <button type="button" className="button secondary" onClick={startEdit}>{item.value === null ? "Выставить балл" : "Изменить балл"}</button>}
        {editing && <form className="axis-edit" onSubmit={(event) => { event.preventDefault(); task.run(save, "Оценка сохранена."); }}>
          <label className="field">Оценка
            <select value={score} onChange={(event) => setScore(event.target.value)}>
              <option value="">Не оценено</option>
              <option value="1">1 из 2 · Есть проявление</option>
              <option value="2">2 из 2 · Устойчивое проявление</option>
            </select>
          </label>
          <label className="field">Источник
            <select value={sourceId} onChange={(event) => { const source = run.sources.find((entry) => entry.id === event.target.value); setSourceId(source?.id ?? ""); setQuote(source?.text.slice(0, 240) ?? ""); }}>
              <option value="">Выберите источник</option>
              {run.sources.filter((source) => source.assessable && source.text).map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
            </select>
          </label>
          <label className="field">Точная цитата из источника
            <textarea value={quote} onChange={(event) => setQuote(event.target.value)} minLength={1} maxLength={4000} required={!!score} />
          </label>
          {score === "2" && episodeCount < 2 && <>
            <label className="field">Второй самостоятельный эпизод
              <select value={secondSourceId} onChange={(event) => { const source = run.sources.find((entry) => entry.id === event.target.value); setSecondSourceId(source?.id ?? ""); setSecondQuote(source?.text.slice(0, 240) ?? ""); }}>
                <option value="">Выберите другой источник</option>
                {run.sources.filter((source) => source.assessable && source.text && source.episodeId && source.episodeId !== selectedSource?.episodeId).map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
              </select>
            </label>
            {secondSourceId && <label className="field">Цитата из второго эпизода
              <textarea value={secondQuote} onChange={(event) => setSecondQuote(event.target.value)} minLength={1} maxLength={4000} required />
            </label>}
          </>}
          <label className="field">Объяснение оценки
            <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} minLength={1} maxLength={4000} required />
          </label>
          <label className="field">Причина изменения
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={15} maxLength={4000} required />
          </label>
          {score === "2" && episodeCount < 2 && <p className="notice info">Для устойчивого проявления нужны два разных эпизода с проверяемыми источниками.</p>}
          <div className="axis-edit-actions"><button className="button primary" disabled={task.busy || (!!score && !selectedSource) || (score === "2" && episodeCount < 2)}>Сохранить оценку</button><button type="button" className="button quiet" onClick={() => setEditing(false)}>Отмена</button></div>
          <Feedback task={task} />
        </form>}
      </div>
      <div className="axis-ground-list" aria-label="Основания по девяти критериям">
        {points.map((point, index) => {
          const evidence = point.evidenceIds.map((id) => result?.evidence.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => !!entry);
          return <article className="axis-ground" key={point.criterionId}>
            <div className="axis-ground-head"><span className="axis-index">{String(index + 1).padStart(2, "0")}</span><h4>{point.criterionId}</h4><strong>{point.value === null ? "Нет оценки" : `${point.value} / ${point.maximum}`}</strong></div>
            <p>{point.explanation}</p>
            {evidence.map((entry) => <button type="button" key={entry.id} className="source-button" onClick={() => onSource(entry.sourceId)}>Источник: «{entry.quote.slice(0, 120)}{entry.quote.length > 120 ? "…" : ""}»</button>)}
          </article>;
        })}
      </div>
    </section>
  );
}
