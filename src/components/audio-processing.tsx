"use client";
import { useEffect, useState } from "react";
import type { audioStatus } from "@/lib/audio-service.server";
import { action } from "@/lib/client";
import {
  activeAudioStatuses,
  audioErrorLabels,
  audioConsentText,
  audioConsentVersion,
  audioStatusLabels,
} from "@/lib/audio-contract";
import { Feedback, useTask } from "./ui";
export type AudioState = Awaited<ReturnType<typeof audioStatus>>;
export function AudioProcessing({
  applicationId,
  revision,
  ready,
  initial,
}: {
  applicationId: string;
  revision: number;
  ready: boolean;
  initial: AudioState;
}) {
  const [data, setData] = useState(initial);
  const [checked, setChecked] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const task = useTask();
  const status = data.job?.status;
  useEffect(() => {
    let stopped = false;
    const refresh = () =>
      action<AudioState>("audio.status", { applicationId })
        .then((value) => {
          if (!stopped) {
            setData(value);
            setRefreshError("");
          }
        })
        .catch(() => {
          if (!stopped)
            setRefreshError(
              "Не удалось обновить состояние. Проверь соединение и обнови страницу.",
            );
        });
    void refresh();
    const timer = activeAudioStatuses.includes(status ?? "")
      ? setInterval(refresh, 4000)
      : undefined;
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [applicationId, revision, status]);
  async function refresh() {
    setData(await action<AudioState>("audio.status", { applicationId }));
  }
  if (!data.available && !data.consent && !data.job) return null;
  const consented =
    data.consent?.granted && data.consent.version === audioConsentVersion;
  const active = activeAudioStatuses.includes(status ?? "");
  return (
    <section className="audio-processing">
      <h2>Расшифровка для проверки</h2>
      <p className="subtle">
        По желанию можно подготовить текст и сводку ответов. Заключение по языку
        сохраняет сотрудник после прослушивания.
      </p>
      {data.job && (
        <p className="notice info" role="status">
          {audioStatusLabels[data.job.status]}
        </p>
      )}
      {data.job?.errorCode && audioErrorLabels[data.job.errorCode] && (
        <p className="subtle">{audioErrorLabels[data.job.errorCode]}</p>
      )}
      {refreshError && (
        <p className="notice error" role="alert">
          {refreshError}
        </p>
      )}
      {consented ? (
        <>
          {data.available &&
            ready &&
            !active &&
            status !== "COMPLETED" &&
            (data.job?.attempts ?? 0) < 3 && (
              <button
                className="button secondary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("audio.start", { applicationId, revision });
                    await refresh();
                  })
                }
              >
                {data.job
                  ? "Повторить обработку ответов"
                  : "Подготовить расшифровку и сводку"}
              </button>
            )}
          {!ready && (
            <p className="subtle">Сначала подтверди отправку обеих записей.</p>
          )}
          <details className="audio-consent-details">
            <summary>Согласие на обработку в OpenAI</summary>
            <p>{audioConsentText}</p>
            <button
              className="button quiet small"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  await action("audio.consent", {
                    applicationId,
                    granted: false,
                    revision: data.consent!.revision,
                  });
                  await refresh();
                  setChecked(false);
                }, "Согласие отозвано. Новые запросы по этому назначению остановлены.")
              }
            >
              Отозвать согласие
            </button>
          </details>
        </>
      ) : (
        data.available && (
          <>
            <label className="check-label audio-consent">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />{" "}
              <span>{audioConsentText}</span>
            </label>
            <a
              className="text-link"
              href="https://developers.openai.com/api/docs/guides/your-data"
              target="_blank"
              rel="noreferrer"
            >
              Обработка данных в OpenAI
            </a>
            <div style={{ marginTop: 16 }}>
              <button
                className="button secondary"
                disabled={!checked || task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("audio.consent", {
                      applicationId,
                      granted: true,
                      revision: data.consent?.revision ?? 0,
                    });
                    await refresh();
                  }, "Согласие сохранено. Запуск обработки — отдельное действие.")
                }
              >
                Сохранить согласие
              </button>
            </div>
          </>
        )
      )}
      <Feedback task={task} />
    </section>
  );
}
