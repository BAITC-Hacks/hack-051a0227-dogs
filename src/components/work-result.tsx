"use client";
import { useState } from "react";
import type { AttemptVersion } from "@prisma/client";
import { WorkPreview } from "./work-preview";
import { workChanges, versionCompleted, type Work } from "@/lib/journey";
import type { Feedback } from "@/lib/types";
import { dateLabel } from "@/lib/client";
import { equipmentHints } from "@/lib/equipment";
import { InteractiveProfile } from "./interactive-profile";
export function WorkResult({
  work,
  revision,
  onRevision,
  expanded = false,
  compact = false,
}: {
  work: Pick<Work, "slug" | "context" | "versions"> & { id?: string };
  revision: number;
  onRevision: (n: number) => void;
  expanded?: boolean;
  compact?: boolean;
}) {
  const [comparing, setComparing] = useState(false),
    [side, setSide] = useState("saved");
  const v =
    work.versions.find((v) => v.revision === revision) ?? work.versions[0];
  if (!v) return null;
  const before =
    work.versions.find(
      (p) => p.revision === (v.basedOnRevision ?? v.revision - 1),
    ) ??
    work.versions.find((p) => p.revision === 0) ??
    v;
  const shown = comparing && side === "before" ? before : v;
  const feedback = shown.feedback as unknown as Feedback;
  const changes = workChanges(work.slug, before.state, v.state, work.context);
  return (
    <div className="work-result">
      <div className="version-controls">
        <label className="field">
          Сохранённая версия
          <select
            value={v.revision}
            onChange={(e) => {
              onRevision(Number(e.target.value));
              setSide("saved");
            }}
          >
            {work.versions.map((p: AttemptVersion) => (
              <option key={p.id} value={p.revision}>
                {p.revision === 0
                  ? "Исходное задание"
                  : `Версия ${p.revision} · ${dateLabel(p.createdAt)}`}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button quiet"
          aria-pressed={comparing}
          disabled={v.revision === 0}
          onClick={() => {
            setComparing(!comparing);
            setSide("saved");
          }}
        >
          {comparing ? "Закрыть сравнение" : "Сравнить версии"}
        </button>
      </div>
      {comparing && (
        <div
          className="version-switch"
          role="group"
          aria-label="Сравнение версий"
        >
          <button
            className="button secondary"
            aria-pressed={side === "before"}
            onClick={() => setSide("before")}
          >
            Было ·{" "}
            {before.revision === 0
              ? "исходное задание"
              : `версия ${before.revision}`}
          </button>
          <button
            className="button secondary"
            aria-pressed={side === "saved"}
            onClick={() => setSide("saved")}
          >
            Сейчас · версия {v.revision}
          </button>
        </div>
      )}
      <p className="result-state">
        {shown.revision === 0
          ? "Материал задания"
          : versionCompleted(work, shown)
            ? "Условия выполнены · результат сохранён"
            : "Черновик сохранён · есть условия для доработки"}
        {comparing && ` · показана версия ${shown.revision}`}
      </p>
      <WorkPreview
        slug={work.slug}
        context={work.context}
        state={shown.state}
        compact={compact}
      />
      {v.revision > 0 && (
        <div className="work-difference">
          <strong>
            Что изменилось относительно{" "}
            {before.revision === 0
              ? "исходного задания"
              : `версии ${before.revision}`}
          </strong>
          {changes.length ? (
            <ul>
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p>Содержимое не менялось. Сохранение не означает улучшение.</p>
          )}
        </div>
      )}
      <details className="work-analysis" open={expanded}>
        <summary>Разбор по условиям · версия {shown.revision}</summary>
        <p>{feedback.summary}</p>
        <ul>
          {feedback.checks.map((c) => (
            <li key={c.label}>
              <strong>
                {c.passed ? "Выполнено" : "Нужно проверить"}: {c.label}
              </strong>
              <p>{c.detail}</p>
            </li>
          ))}
        </ul>
        <p className="subtle">
          Проверены явные правила упражнения. Свободный текст остаётся авторской
          работой, без автоматической оценки смысла.
        </p>
        {work.context === "EQUIPMENT" && (
          <p>
            Использованные подсказки этой версии:{" "}
            {shown.hintsUsed.length
              ? shown.hintsUsed
                  .map((id) => equipmentHints.find((h) => h.id === id)?.title)
                  .join("; ")
              : "без подсказок"}
            .
          </p>
        )}
      </details>
      {work.id && v.revision > 0 && <InteractiveProfile key={`${work.id}-${v.revision}`} scope={{attemptId:work.id,revision:v.revision}} title="Объяснить изменения и выбрать продолжение" initialTopic="changes"/>}
    </div>
  );
}
