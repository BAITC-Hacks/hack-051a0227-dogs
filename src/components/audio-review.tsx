"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import {
  audioSummarySchema,
  activeAudioStatuses,
  audioErrorLabels,
  audioStatusLabels,
  languageTask,
  type AudioSummary,
} from "@/lib/audio-contract";
import type { AudioState } from "./audio-processing";
import { Feedback, useTask } from "./ui";
type Job = NonNullable<AudioState["job"]>;
function Transcript({
  transcript,
}: {
  transcript: Job["transcripts"][number];
}) {
  const task = useTask();
  const router = useRouter();
  const latest = transcript.corrections[0];
  return (
    <div className="transcript" id={"transcript-" + transcript.id}>
      <p className="subtle">
        {latest
          ? `Уточнённый текст · версия ${latest.version}`
          : "Автоматическая расшифровка · исходная версия"}
      </p>
      <p
        className="transcript-text"
        id={!latest ? "original-" + transcript.id : undefined}
      >
        {latest?.text ?? transcript.text}
      </p>
      <details>
        <summary>Уточнить расшифровку по записи</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            task.run(async () => {
              await action("audio.correct", {
                transcriptId: transcript.id,
                version: latest?.version ?? 0,
                text: values.get("text"),
                reason: values.get("reason"),
              });
              router.refresh();
            }, "Исправление сохранено отдельно от исходной расшифровки.");
          }}
        >
          <label className="field">
            Текст после сверки с записью
            <textarea
              name="text"
              required
              maxLength={16000}
              defaultValue={latest?.text ?? transcript.text}
            />
          </label>
          <label className="field">
            Что исправлено и почему
            <textarea name="reason" required minLength={5} maxLength={2000} />
          </label>
          <button className="button secondary small" disabled={task.busy}>
            Сохранить исправление
          </button>
        </form>
      </details>
      {latest && (
        <details>
          <summary>Исходный текст и история исправлений</summary>
          <p className="transcript-text" id={"original-" + transcript.id}>
            {transcript.text}
          </p>
          {[...transcript.corrections].reverse().map((c) => (
            <div className="audio-history-item" key={c.id}>
              <strong>
                Версия {c.version} · {dateLabel(c.createdAt)}
              </strong>
              <p className="transcript-text">{c.text}</p>
              <p className="subtle">{c.reason}</p>
            </div>
          ))}
        </details>
      )}
      <Feedback task={task} />
    </div>
  );
}
function Sources({ ids, summary }: { ids: string[]; summary: AudioSummary }) {
  if (!ids.length) return null;
  return (
    <details className="audio-evidence">
      <summary>Открыть основания</summary>
      {ids.map((id) => {
        const source = summary.evidence.find((e) => e.id === id)!;
        return (
          <blockquote key={id}>
            <p>«{source.quote}»</p>
            <a
              href={"#original-" + source.transcriptId}
              onClick={() => {
                const original = document.getElementById(
                  "original-" + source.transcriptId,
                );
                const disclosure = original?.closest("details");
                if (disclosure) disclosure.open = true;
              }}
              className="text-link"
            >
              {source.kind === "oral" ? "Основной ответ" : "Уточнение"} ·
              исходная расшифровка
            </a>
          </blockquote>
        );
      })}
    </details>
  );
}
export function AudioReviewPanel({
  applicationId,
  revision,
  oralId,
  followupId,
  data,
  onRequestClarification,
}: {
  applicationId: string;
  revision: number;
  oralId: string;
  followupId: string;
  data: AudioState;
  onRequestClarification: () => void;
}) {
  const task = useTask();
  const router = useRouter();
  const job = data.job;
  const [refreshError, setRefreshError] = useState("");
  const status = job?.status;
  const transcriptCount = job?.transcripts.length ?? 0;
  useEffect(() => {
    if (!activeAudioStatuses.includes(status ?? "")) return;
    let stopped = false;
    const timer = setInterval(() => {
      void action<AudioState>("audio.status", { applicationId })
        .then((next) => {
          if (stopped) return;
          setRefreshError("");
          if (
            next.job?.status !== status ||
            (next.job?.transcripts.length ?? 0) !== transcriptCount
          )
            router.refresh();
        })
        .catch(() => {
          if (!stopped)
            setRefreshError(
              "Не удалось обновить состояние. Проверьте соединение и обновите страницу.",
            );
        });
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [applicationId, status, transcriptCount, router]);
  const summary = job?.summary ? audioSummarySchema.parse(job.summary) : null;
  const [rejected, setRejected] = useState<string[]>(
    job?.reviews[0]?.rejectedIds ?? [],
  );
  const corrected = job?.transcripts.some((t) => t.corrections.length);
  function reject(id: string) {
    return (
      <label className="audio-reject">
        <input
          type="checkbox"
          checked={rejected.includes(id)}
          onChange={(e) =>
            setRejected((values) =>
              e.target.checked
                ? [...values, id]
                : values.filter((v) => v !== id),
            )
          }
        />
        Отклонить замечание
      </label>
    );
  }
  return (
    <div className="audio-review">
      <details className="audio-task">
        <summary>Задание и условия ответа</summary>
        <p lang="en">{languageTask.context}</p>
        <p lang="en">{languageTask.oral}</p>
        <p lang="en">{languageTask.followup}</p>
      </details>
      {job && (
        <p className="subtle" role="status">
          {audioStatusLabels[job.status]}
        </p>
      )}
      {job?.errorCode && audioErrorLabels[job.errorCode] && (
        <p className="notice info">{audioErrorLabels[job.errorCode]}</p>
      )}
      {refreshError && (
        <p className="notice error" role="alert">
          {refreshError}
        </p>
      )}
      <div className="audio-review-grid">
        <div className="audio-originals">
          {(
            [
              ["oral", oralId, "Основной ответ"],
              ["followup", followupId, "Уточнение"],
            ] as const
          ).map(([kind, id, title]) => {
            const transcript = job?.transcripts.find((t) => t.kind === kind);
            return (
              <section key={kind}>
                <h4>{title} · оригинал</h4>
                <audio
                  controls
                  preload="metadata"
                  aria-label={"Прослушать: " + title}
                  src={"/api/files/" + id}
                />
                {transcript && (
                  <Transcript
                    key={
                      transcript.id +
                      ":" +
                      (transcript.corrections[0]?.version ?? 0)
                    }
                    transcript={transcript}
                  />
                )}
              </section>
            );
          })}
        </div>
        {summary && (
          <section className="audio-summary">
            <h4>Сводка для сверки</h4>
            <p className="subtle">
              Содержание выделено моделью. Сверьте существенные выводы с
              оригиналом.
            </p>
            {corrected && (
              <p className="notice info">
                Текст уточнён сотрудником. Эта сводка относится к исходной
                расшифровке и не пересчитывалась.
              </p>
            )}
            {summary.answerSummary.map((p) => (
              <div
                key={p.id}
                className={
                  "audio-point " + (rejected.includes(p.id) ? "rejected" : "")
                }
              >
                <p>{p.text}</p>
                <Sources ids={p.evidenceIds} summary={summary} />
                {reject(p.id)}
              </div>
            ))}
            <details>
              <summary>Проверка условий задания</summary>
              {summary.taskChecks.map((c) => (
                <div className="audio-point" key={c.requirementId}>
                  <strong>
                    {
                      languageTask.requirements.find(
                        (r) => r.id === c.requirementId,
                      )?.text
                    }
                  </strong>
                  <p>{c.explanation}</p>
                  {c.coverage === "not_addressed" && (
                    <p className="subtle">
                      Вопрос проверен по{" "}
                      {languageTask.requirements.find(
                        (r) => r.id === c.requirementId,
                      )?.kind === "oral"
                        ? "основному ответу"
                        : "уточнению"}{" "}
                      целиком.
                    </p>
                  )}
                  <Sources ids={c.evidenceIds} summary={summary} />
                  {reject(c.requirementId)}
                </div>
              ))}
            </details>
            {summary.pointsForHumanReview.length > 0 && (
              <details>
                <summary>Что проверить сотруднику</summary>
                {summary.pointsForHumanReview.map((p) => (
                  <div className="audio-point" key={p.id}>
                    <p>{p.question}</p>
                    <Sources ids={p.evidenceIds} summary={summary} />
                    {reject(p.id)}
                  </div>
                ))}
              </details>
            )}
            <details>
              <summary>Ограничения сводки</summary>
              <ul>
                {summary.limitations.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
              <p className="subtle">
                Произношение, беглость и интонацию можно проверять только по
                оригинальной записи.
              </p>
            </details>
          </section>
        )}
      </div>
      <details className="assessment-form" open>
        <summary>Зафиксировать языковую проверку</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            task.run(async () => {
              await action("language.review", {
                applicationId,
                revision,
                result: fields.get("result"),
                ...(job
                  ? {
                      audio: {
                        jobId: job.id,
                        rejectedIds: rejected,
                        note: fields.get("note") ?? "",
                        transcriptVersions: Object.fromEntries(
                          job.transcripts.map((t) => [
                            t.id,
                            t.corrections[0]?.version ?? 0,
                          ]),
                        ),
                      },
                    }
                  : {}),
              });
              router.refresh();
            }, "Языковой вывод сохранён сотрудником отдельно от оценок опыта и лидерства.");
          }}
        >
          {job && (
            <label className="field">
              Пояснение к сводке
              {rejected.length > 0
                ? " и отклонённым замечаниям"
                : " (необязательно)"}
              <textarea
                name="note"
                required={rejected.length > 0}
                minLength={rejected.length ? 5 : undefined}
                maxLength={3000}
                defaultValue={job.reviews[0]?.note ?? ""}
              />
            </label>
          )}
          <label className="field">
            Вывод сотрудника по оригиналам
            <textarea
              name="result"
              required
              minLength={15}
              maxLength={3000}
              placeholder="Понимание сообщения, ясность ответа и что требует уточнения"
            />
          </label>
          <div className="row">
            <button className="button secondary small" disabled={task.busy}>
              Сохранить языковой вывод
            </button>
            <button
              type="button"
              className="button quiet small"
              onClick={onRequestClarification}
            >
              Запросить уточнение
            </button>
          </div>
        </form>
      </details>
      <Feedback task={task} />
      {job && (
        <details className="audio-history">
          <summary>История обработки и проверки</summary>
          <p className="subtle">
            {job.provider} · {job.transcriptionModel} · {job.textModel}
            <br />
            {dateLabel(job.createdAt)} · {job.instructionVersion}
          </p>
          {job.reviews.map((r) => (
            <div className="audio-history-item" key={r.id}>
              <strong>Заключение сотрудника · {dateLabel(r.createdAt)}</strong>
              <p>{r.conclusion}</p>
              {r.note && <p>{r.note}</p>}
              <p className="subtle">
                Отклонено замечаний: {r.rejectedIds.length}
              </p>
            </div>
          ))}
        </details>
      )}
      {data.history.length > 0 && (
        <details className="audio-history">
          <summary>
            Обработки предыдущих записей · {data.history.length}
          </summary>
          {data.history.map((h) => (
            <p key={h.id}>
              {dateLabel(h.createdAt)} · предыдущая версия ·{" "}
              {audioStatusLabels[h.status]}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
