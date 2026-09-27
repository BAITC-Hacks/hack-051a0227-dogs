"use client";
import { StageActions, CalendarForm } from "./selection-actions";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reviewActions } from "@/lib/review-contract";
import { action, dateLabel } from "@/lib/client";
import type { loadCandidate } from "@/lib/data";
import { Feedback, useTask } from "./ui";
import type { ScoringResult } from "@/lib/scoring-contract";
import type { DeskResult } from "@/lib/vision-desk-contract";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
export function ReviewDecision({
  application: a,
  scoringDraft,
  deskDraft,
}: {
  application: Candidate;
  deskDraft?: DeskResult["feedback"] | null;
  scoringDraft?: { result: ScoringResult; runId: string } | null;
}) {
  const router = useRouter(),
    decisionTask = useTask(),
    publishTask = useTask();
  const activeInterview = a.interviews.find(
    (i) => !["COMPLETED", "CANCELLED"].includes(i.status),
  );
  const [decision, setDecision] = useState(
    a.stage === "DECIDED"
      ? "REOPEN"
      : scoringDraft?.result.recommendation.action === "INTERVIEW"
        ? "CONTINUE"
        : (scoringDraft?.result.recommendation.action ?? "CONTINUE"),
  );
  const [reason, setReason] = useState(
      scoringDraft?.result.recommendation.reason ?? "",
    ),
    [scheduled, setScheduled] = useState("");
  const [observation, setObservation] = useState(
      scoringDraft?.result.feedback.observation ?? "",
    ),
    [suggestion, setSuggestion] = useState(
      scoringDraft?.result.feedback.suggestion ?? "",
    ),
    [nextAction, setNextAction] = useState(
      scoringDraft?.result.feedback.nextAction ?? "",
    );
  const [sourceIds, setSourceIds] = useState<string[]>(
    scoringDraft?.result.feedback.sourceIds ?? [],
  );
  const [preview, setPreview] = useState<{
    id: string;
    body: string;
    sources: { id: string; title: string; kind: string }[];
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const latest = a.decisions[0];
  const validDecision = latest?.materialVersion === a.materialVersion;
  function resetPreview() {
    setPreview(null);
    setConfirm(false);
  }
  async function previewSaved(id: string) {
    const result = await action<NonNullable<typeof preview>>(
      "feedback.preview",
      { applicationId: a.id, materialVersion: a.materialVersion, id },
    );
    setPreview(result);
    setConfirm(false);
  }
  return (
    <section className="review-section" id="decision-publication">
      <h2>Решение и обратная связь</h2>
      <StageActions
        application={{
          id: a.id,
          revision: a.revision,
          materialVersion: a.materialVersion,
          stage: a.stage,
          email: a.user.email ?? "",
        }}
      />
      <CalendarForm
        application={{
          id: a.id,
          revision: a.revision,
          materialVersion: a.materialVersion,
          stage: a.stage,
          email: a.user.email ?? "",
        }}
        interview={activeInterview}
      />

      {deskDraft && (
        <details className="notice info" open>
          <summary>Предложение Vision Desk</summary>
          <p>{deskDraft.observation}</p>
          <p>{deskDraft.suggestion}</p>
          <p>{deskDraft.nextAction}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setObservation(deskDraft.observation);
              setSuggestion(deskDraft.suggestion);
              setNextAction(deskDraft.nextAction);
              setSourceIds(deskDraft.sourceIds);
              resetPreview();
            }}
          >
            Использовать этот текст в форме ниже
          </button>
          <p>
            Заменит текст сообщения в форме. Сохранение черновика, решение и
            публикация остаются отдельными действиями.
          </p>
        </details>
      )}
      {scoringDraft && (
        <p className="notice info">
          Перенесена проверенная рекомендация AI-скоринга. Отредактируйте текст
          под выбранное действие перед предпросмотром. Публикация требует
          отдельного подтверждения.
        </p>
      )}
      <p className="section-subtitle">
        Внутреннее основание и сообщение кандидату сохраняются отдельно.
        Кандидат увидит только опубликованный текст.
      </p>
      {activeInterview && (
        <p className="notice info">
          {activeInterview.status === "SCHEDULING"
            ? "Создаётся встреча на"
            : "Интервью на"}{" "}
          {new Intl.DateTimeFormat("ru", {
            timeZone: activeInterview.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(activeInterview.scheduledAt))}{" "}
          ({activeInterview.timezone}).{" "}
          <Link
            className="text-link"
            href={`/admissions/interviews/${activeInterview.id}`}
          >
            Открыть встречу и подготовку
          </Link>
        </p>
      )}
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          decisionTask.run(async () => {
            await action("decision", {
              scoringRunId: scoringDraft?.runId,
              applicationId: a.id,
              materialVersion: a.materialVersion,
              revision: a.revision,
              action: decision,
              reason,
              scheduledAt: scheduled
                ? new Date(scheduled).toISOString()
                : undefined,
            });
            setReason("");
            publishTask.setNotice("");
            resetPreview();
            router.refresh();
          }, "Решение сохранено внутри комиссии. Сообщение кандидату ещё не опубликовано.");
        }}
      >
        <h3>1. Внутреннее решение</h3>
        <label className="field">
          Следующий этап
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {Object.entries(reviewActions)
              .filter(
                ([key]) =>
                  (a.stage === "DECIDED"
                    ? key === "REOPEN"
                    : key !== "REOPEN") && key !== "INTERVIEW",
              )
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        {decision === "INTERVIEW" && (
          <label className="field">
            Время приглашения (часовой пояс устройства)
            <input
              type="datetime-local"
              required
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Основание для комиссии
          <textarea
            required
            minLength={15}
            maxLength={4000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="На каких материалах основан следующий этап?"
          />
        </label>
        <p className="subtle">
          Основание остаётся внутренним. Приглашение и время встречи включите в
          сообщение ниже.
        </p>
        <button className="button secondary" disabled={decisionTask.busy}>
          Сохранить внутреннее решение
        </button>
        <Feedback task={decisionTask} />
      </form>
      <form
        className="panel feedback-editor"
        onSubmit={(e) => {
          e.preventDefault();
          publishTask.run(async () => {
            const draft = await action<{ id: string }>("feedback.save", {
              scoringRunId: scoringDraft?.runId,
              applicationId: a.id,
              materialVersion: a.materialVersion,
              decisionId: latest?.id,
              observation,
              suggestion,
              nextAction,
              sourceIds,
            });
            await previewSaved(draft.id);
            router.refresh();
          }, "Черновик сохранён. Проверьте точный текст перед публикацией.");
        }}
      >
        <h3>2. Сообщение кандидату</h3>
        {!validDecision && (
          <p className="notice info">
            Сначала сохраните решение по актуальным материалам.
          </p>
        )}
        <label className="field">
          Конкретное наблюдение
          <textarea
            required
            minLength={15}
            maxLength={4000}
            value={observation}
            onChange={(e) => {
              setObservation(e.target.value);
              resetPreview();
            }}
          />
        </label>
        <label className="field">
          Что уточнить или развивать
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={suggestion}
            onChange={(e) => {
              setSuggestion(e.target.value);
              resetPreview();
            }}
          />
        </label>
        <label className="field">
          Понятный следующий шаг
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={nextAction}
            onChange={(e) => {
              setNextAction(e.target.value);
              resetPreview();
            }}
            placeholder="Конкретное доступное действие без неподтверждённых обещаний"
          />
        </label>
        <fieldset className="source-checks">
          <legend>Материалы, к которым относится сообщение</legend>
          {a.sources.map((s) => (
            <label className="check-label" key={s.id}>
              <input
                type="checkbox"
                checked={sourceIds.includes(s.id)}
                onChange={(e) => {
                  setSourceIds((ids) =>
                    e.target.checked
                      ? [...ids, s.id]
                      : ids.filter((id) => id !== s.id),
                  );
                  resetPreview();
                }}
              />
              {s.title}
            </label>
          ))}
        </fieldset>
        <button
          className="button primary"
          disabled={publishTask.busy || !validDecision || !sourceIds.length}
        >
          Сохранить и открыть предпросмотр
        </button>
      </form>
      {preview && (
        <section
          className="publication-preview"
          aria-label="Предпросмотр для кандидата"
        >
          <h3>3. Так кандидат увидит сообщение</h3>
          <p className="publication-body">{preview.body}</p>
          <p className="subtle">
            Связанные материалы:{" "}
            {preview.sources
              .map((s) => s.title + " (" + s.kind + ")")
              .join("; ")}
            .
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Проверил содержание и подтверждаю публикацию в приложении
          </label>
          <button
            className="button primary"
            disabled={!confirm || publishTask.busy}
            onClick={() =>
              publishTask.run(async () => {
                await action("feedback.publish", {
                  applicationId: a.id,
                  materialVersion: a.materialVersion,
                  id: preview.id,
                  confirm,
                });
                decisionTask.setNotice("");
                resetPreview();
                router.refresh();
              }, "Обратная связь опубликована в приложении. Кандидату доступен только показанный текст.")
            }
          >
            Опубликовать обратную связь
          </button>
        </section>
      )}
      <Feedback task={publishTask} />
      {a.feedback.length > 0 && (
        <details className="versions">
          <summary>Черновики и публикации · {a.feedback.length}</summary>
          {a.feedback.map((f) => (
            <div className="evidence-row" key={f.id}>
              <strong>
                {f.publishedAt
                  ? "Опубликовано " + dateLabel(f.publishedAt)
                  : "Черновик · " + dateLabel(f.createdAt)}
              </strong>
              <p>{f.observation}</p>
              <p>{f.suggestion}</p>
              <p>{f.nextAction}</p>
              {!f.publishedAt && (
                <button
                  className="text-link"
                  disabled={publishTask.busy}
                  onClick={() => publishTask.run(() => previewSaved(f.id))}
                >
                  Открыть сохранённый предпросмотр
                </button>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
