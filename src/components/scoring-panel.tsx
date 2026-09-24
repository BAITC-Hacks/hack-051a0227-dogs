"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import {
  scoringActions,
  type ScoringResult,
  type ScoringView,
} from "@/lib/scoring-contract";
import { sections, woundedBoundary } from "@/lib/review-contract";
import { Feedback, Tag, useTask } from "./ui";

export function ScoringPanel({
  applicationId,
  data,
  onSource,
  onUse,
  interviewId,
  language,
  onReadiness,
}: {
  applicationId: string;
  data: ScoringView;
  onSource: (id: string) => void;
  onUse: (result: ScoringResult, runId: string) => void;
  interviewId?: string;
  language: string;
  onReadiness: () => void;
}) {
  const task = useTask(),
    router = useRouter();
  const [view, setView] = useState(data),
    [selected, setSelected] = useState("");
  const [previousData, setPreviousData] = useState(data);
  const [pollError, setPollError] = useState(false);
  if (previousData !== data) {
    setPreviousData(data);
    setView(data);
  }
  const run = view.runs.find((r) => r.id === selected) ?? view.runs[0];
  const processing = view.runs.some((r) =>
    ["QUEUED", "RUNNING"].includes(r.status),
  );
  useEffect(() => {
    if (!processing) return;
    let stopped = false;
    const timer = setInterval(() => {
      action<ScoringView>("scoring.status", { applicationId })
        .then((v) => {
          if (!stopped) {
            setPollError(false);
            setView(v);
            if (!v.runs.some((r) => ["QUEUED", "RUNNING"].includes(r.status)))
              router.refresh();
          }
        })
        .catch(() => {
          if (!stopped) setPollError(true);
        });
    }, 900);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [applicationId, processing, router]);
  return (
    <section className="scoring-panel" aria-label="AI-скоринг">
      {pollError && (
        <p role="alert" className="notice error">
          Не удалось обновить состояние обработки. Проверяем соединение;
          результат пока не подтверждён.
        </p>
      )}
      <div className="scoring-heading">
        <div>
          <h2>AI-скоринг</h2>
          <p>
            Предварительная оценка материалов. Решение остаётся за сотрудником.
          </p>
        </div>
        {run?.current && run.status === "COMPLETED" ? (
          <a className="button primary" href="#scoring-human-review">
            Проверить рекомендацию
          </a>
        ) : (
          <button
            className="button primary"
            disabled={task.busy || processing}
            onClick={() =>
              task.run(async () => {
                const r = await action<{ id: string }>("scoring.launch", {
                  applicationId,
                });
                setSelected(r.id);
                setView(
                  await action<ScoringView>("scoring.status", {
                    applicationId,
                  }),
                );
                router.refresh();
              })
            }
          >
            {processing
              ? "Анализ выполняется"
              : run?.current && run.status === "COMPLETED"
                ? "Проверить актуальность"
                : "Запустить анализ"}
          </button>
        )}
      </div>
      <Feedback task={task} />
      <p className="scoring-language">
        <Link
          className="text-link"
          href={`/admissions/candidates/${applicationId}/stability`}
        >
          Проверить устойчивость
        </Link>
        {" · Контролируемая пара без изменения официального профиля"}
      </p>
      <p className="scoring-language">
        Английский: {language}.{" "}
        <button className="text-link" onClick={onReadiness}>
          Отдельная языковая проверка
        </button>
      </p>
      {!run && (
        <p className="notice info">
          Запустите анализ, чтобы получить профиль по девяти областям, основания
          и вопросы к материалам этой заявки.
        </p>
      )}
      {run && (
        <>
          <div className="scoring-toolbar">
            <Tag tone={run.current ? "blue" : "warning"}>
              {run.status === "UNAVAILABLE"
                ? "Требует проверки"
                : !run.current
                  ? "Материалы изменились"
                  : run.status === "COMPLETED"
                    ? "Результат сохранён"
                    : run.status === "FAILED"
                      ? "Обработка прервалась"
                      : run.status === "UNAVAILABLE"
                        ? "Требует проверки"
                        : "Обработка материалов"}
            </Tag>
            <details className="scoring-history">
              <summary>История анализов</summary>
              <label className="field">
                Выбрать сохранённый анализ
                <select
                  value={run.id}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {view.runs.map((r, i) => (
                    <option value={r.id} key={r.id}>
                      {dateLabel(r.createdAt)} · {view.runs.length - i}
                      {r.current
                        ? " · текущие материалы"
                        : " · прежние материалы"}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          </div>
          {run.status === "FAILED" && (
            <p role="alert" className="notice error">
              Результат не получен. Повторите запуск; если ошибка сохраняется,
              проверьте настройки обработки. Предыдущие результаты сохранены.
            </p>
          )}
          {run.status === "UNAVAILABLE" && (
            <p role="alert" className="notice warning">
              Основания анализа не прошли проверку источников, версий или
              разрешений. Результат недоступен для использования; откройте
              исходные материалы.
            </p>
          )}
          {!run.current && run.status !== "UNAVAILABLE" && (
            <p className="notice warning">
              Этот анализ относится к прежним материалам или критериям. Его
              можно изучить в истории; для новой интерпретации запустите анализ
              заново.
            </p>
          )}
          {run.result && (
            <ScoringResultPanel
              key={run.id + ":" + (run.reviews[0]?.id ?? "")}
              result={run.result}
              run={run}
              criteria={run.criteria}
              applicationId={applicationId}
              onSource={onSource}
              onUse={onUse}
              interviewId={interviewId}
            />
          )}
        </>
      )}
    </section>
  );
}
function ScoringResultPanel({
  result,
  run,
  criteria,
  applicationId,
  onSource,
  onUse,
  interviewId,
}: {
  result: ScoringResult;
  run: ScoringView["runs"][number];
  criteria: ScoringView["criteria"];
  applicationId: string;
  onSource: (id: string) => void;
  onUse: (result: ScoringResult, runId: string) => void;
  interviewId?: string;
}) {
  const human = run.reviews[0];
  const [draft, setDraft] = useState(human?.result ?? result),
    [rejected, setRejected] = useState<string[]>(
      human?.rejectedEvidenceIds ?? [],
    ),
    [reason, setReason] = useState(""),
    [editing, setEditing] = useState(false);
  const task = useTask(),
    router = useRouter();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  function reject(id: string) {
    setRejected((v) => [...new Set([...v, id])]);
    setDraft((r) => ({
      ...r,
      evidence: r.evidence.filter((e) => e.id !== id),
      contradictions: r.contradictions.filter(
        (c) => !c.evidenceIds.includes(id),
      ),
      domains: r.domains.map((d) => {
        const evidenceIds = d.evidenceIds.filter((e) => e !== id);
        return {
          ...d,
          evidenceIds,
          rating: evidenceIds.length === d.evidenceIds.length ? d.rating : null,
          sufficiency: evidenceIds.length ? d.sufficiency : "Недостаточно",
          consistency: d.evidenceIds.includes(id)
            ? "Не проверено"
            : d.consistency,
        };
      }),
    }));
  }
  const shown = editing ? draft : (human?.result ?? result);
  return (
    <>
      <div className="scoring-summary">
        <Tag>
          {result.state === "REQUIRES_REVIEW"
            ? "Требует проверки"
            : "Предварительная оценка"}
        </Tag>
        <p className="interpretation-author">
          {human
            ? `Интерпретация сотрудника: ${human.author} · ${dateLabel(human.createdAt)}`
            : "Предложение AI по материалам заявки"}
        </p>
        <p>{shown.summary}</p>
        <strong>
          Рекомендация: {scoringActions[shown.recommendation.action]}
        </strong>
        <p>{shown.recommendation.reason}</p>
        <div className="source-buttons">
          {shown.recommendation.sourceIds.map((id) => (
            <button
              key={id}
              className="source-button"
              onClick={() => onSource(id)}
            >
              Открыть основание
            </button>
          ))}
        </div>
      </div>
      <details className="scoring-scale">
        <summary>
          Шкала и границы оценки · критерии {criteria.rubricVersion}
        </summary>
        <p>{criteria.guidance}</p>
        {criteria.levels.map((l) => (
          <p key={l.label}>
            <strong>{l.label}:</strong> {l.meaning}
          </p>
        ))}
        {criteria.numeric?.points.map((p) => (
          <p key={p.value}>
            {p.value} · {p.label}: {p.meaning}
          </p>
        ))}
        <p>
          «Не установлена» означает отсутствие оценки, а не низкое проявление.
          Язык и forced-choice рассматриваются отдельно. {woundedBoundary}
        </p>
      </details>
      <div className="scoring-domain-list" id="scoring-domain-list">
        {shown.domains.map((d, index) => (
          <details className="scoring-domain" key={d.domain}>
            <summary>
              <span>
                <strong>{d.domain}</strong>
                <span className="scoring-axes">
                  <span>Основания: {d.sufficiency.toLowerCase()}</span>
                  <span>{d.consistency}</span>
                </span>
              </span>
              <span className="scoring-level">
                {d.rating
                  ? `${d.rating.value !== null ? d.rating.value + " · " : ""}${d.rating.label}`
                  : "Не установлена"}
                <small>
                  {human
                    ? run.current
                      ? "Проверено сотрудником"
                      : "Проверено по прежним материалам"
                    : "Ожидает человеческой проверки"}
                </small>
              </span>
            </summary>
            <p>
              <strong>
                {human ? "Комментарий сотрудника: " : "AI-обоснование: "}
              </strong>
              {d.interpretation}
            </p>
            {editing && (
              <>
                <label className="field">
                  Оценка: {d.domain}
                  <select
                    value={d.rating?.label ?? ""}
                    onChange={(e) =>
                      setDraft((r) => ({
                        ...r,
                        domains: r.domains.map((v, i) =>
                          i === index
                            ? {
                                ...v,
                                rating: e.target.value
                                  ? { label: e.target.value, value: null }
                                  : null,
                              }
                            : v,
                        ),
                      }))
                    }
                  >
                    <option value="">Не установлена</option>
                    {criteria.levels.map((l) => (
                      <option key={l.label}>{l.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Интерпретация: {d.domain}
                  <textarea
                    value={d.interpretation}
                    onChange={(e) =>
                      setDraft((r) => ({
                        ...r,
                        domains: r.domains.map((v, i) =>
                          i === index
                            ? { ...v, interpretation: e.target.value }
                            : v,
                        ),
                      }))
                    }
                  />
                </label>
              </>
            )}
            {d.evidenceIds.length > 0 && <h4>Основания оценки</h4>}
            {d.evidenceIds.map((id) => {
              const e = shown.evidence.find((e) => e.id === id)!;
              return (
                <div className="scoring-evidence" key={id}>
                  <blockquote>«{e.quote}»</blockquote>
                  <p>{e.explanation}</p>
                  <button
                    className="text-link"
                    onClick={() => onSource(e.sourceId)}
                  >
                    Открыть источник рядом
                  </button>
                  {editing && (
                    <button className="button quiet" onClick={() => reject(id)}>
                      Отклонить основание
                    </button>
                  )}
                </div>
              );
            })}
            {d.gaps.map((g) => (
              <p key={g} className="notice info">
                Уточнить: {g}
              </p>
            ))}
          </details>
        ))}
      </div>
      {shown.contradictions.map((c) => (
        <div className="notice warning" key={c.text}>
          <strong>Противоречие</strong>
          <p>{c.text}</p>
          {c.evidenceIds.map((id) => (
            <button
              className="source-button"
              key={id}
              onClick={() =>
                onSource(shown.evidence.find((e) => e.id === id)!.sourceId)
              }
            >
              Сверить фрагмент
            </button>
          ))}
        </div>
      ))}
      <section className="review-section">
        <h3>Вопросы для интервью</h3>
        <p>Дополнительные вопросы сохраняют пять обязательных секций ATOLA.</p>
        {shown.questions.map((q) => (
          <div className="scoring-question" key={q.id}>
            <strong>{sections.find((s) => s.key === q.section)?.title}</strong>
            <p>{q.text}</p>
            <p>Пробел: {q.gap}</p>
            <button className="text-link" onClick={() => onSource(q.sourceId)}>
              Материал к вопросу
            </button>
          </div>
        ))}
        {interviewId ? (
          <Link
            className="button secondary"
            href={"/admissions/interviews/" + interviewId}
          >
            Выбрать вопросы в плане интервью
          </Link>
        ) : (
          <p>
            После сохранения приглашения вопросы можно выбрать и изменить в
            плане интервью.
          </p>
        )}
      </section>
      <section className="review-section" id="scoring-human-review">
        <h3>Человеческая проверка</h3>
        <p>
          Сохранение интерпретации не меняет этап заявки и не публикует
          сообщение.
        </p>
        {human && (
          <p className="notice info">
            {human.author} · {dateLabel(human.createdAt)}. {human.reason}
          </p>
        )}
        <button
          className="button secondary"
          disabled={!run.current}
          onClick={() => {
            setEditing(!editing);
            if (!editing)
              document
                .getElementById("scoring-domain-list")
                ?.scrollIntoView({ block: "start" });
          }}
        >
          {editing
            ? "Свернуть редактор"
            : "Изменить оценку или отклонить основание"}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            task.run(async () => {
              await action("scoring.review", {
                applicationId,
                runId: run.id,
                requestKey,
                baseReviewId: human?.id ?? null,
                result: draft,
                rejectedEvidenceIds: rejected,
                reason,
              });
              setRequestKey(crypto.randomUUID());
              router.refresh();
            }, "Человеческая интерпретация сохранена. Исходное предложение осталось в истории.");
          }}
        >
          <label className="field">
            Предлагаемое следующее действие
            <select
              disabled={!run.current}
              value={draft.recommendation.action}
              onChange={(e) =>
                setDraft((r) => ({
                  ...r,
                  recommendation: {
                    ...r.recommendation,
                    action: e.target
                      .value as ScoringResult["recommendation"]["action"],
                  },
                }))
              }
            >
              {Object.entries(scoringActions).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Пояснение сотрудника
            <textarea
              required
              minLength={15}
              maxLength={4000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!run.current}
              placeholder="Какие основания вы проверили и что подтверждаете или меняете?"
            />
          </label>
          <button
            className="button primary"
            disabled={!run.current || task.busy}
          >
            Сохранить человеческую проверку
          </button>
          <Feedback task={task} />
        </form>
      </section>
      <details className="review-section">
        <summary>Черновик обратной связи</summary>
        <p>
          <strong>Наблюдение:</strong> {shown.feedback.observation}
        </p>
        <p>
          <strong>Что уточнить:</strong> {shown.feedback.suggestion}
        </p>
        <p>
          <strong>Следующий шаг:</strong> {shown.feedback.nextAction}
        </p>
      </details>
      <button
        className="button secondary"
        disabled={!run.current || !human}
        onClick={() => onUse(human!.result, run.id)}
      >
        Перейти к решению и редактированию сообщения
      </button>
      {!human && (
        <p className="subtle">
          Для использования рекомендации сначала сохраните человеческую
          проверку.
        </p>
      )}
      <details className="review-section">
        <summary>Исходное предложение и история проверки</summary>
        <p>{result.summary}</p>
        {result.domains.map((d) => (
          <p key={d.domain}>
            {d.domain}: {d.rating?.label ?? "Не установлена"}.{" "}
            {d.interpretation}
          </p>
        ))}
        {run.reviews.map((r) => (
          <div className="evidence-row" key={r.id}>
            <strong>
              {r.author} · {dateLabel(r.createdAt)}
            </strong>
            <p>{r.reason}</p>
            <p>
              {scoringActions[r.result.recommendation.action]} · Отклонено
              оснований: {r.rejectedEvidenceIds.length}
            </p>
          </div>
        ))}
      </details>
    </>
  );
}
