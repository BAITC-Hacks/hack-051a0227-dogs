"use client";
import { useState, useRef, useEffect } from "react";
import { Mic, Square, Upload, Save, RotateCcw } from "lucide-react";
import { upload } from "@/lib/client";
import { AudioCapture } from "@/lib/audio-capture";
import {
  cacheRecording,
  restoreRecording,
  clearRecording,
  recordingKey,
  allowUserRecordings,
  blockUserRecordings,
} from "@/lib/recording-cache";
import { Feedback, useTask } from "./ui";

export function Recorder({
  title,
  prompt,
  kind,
  ownerKey,
  userId,
  savedId = "",
  onSaved,
}: {
  title: string;
  prompt: string;
  kind: "practice" | "oral" | "followup";
  ownerKey: string;
  userId: string;
  savedId?: string;
  onSaved?: (id: string) => Promise<void>;
}) {
  const task = useTask();
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [local, setLocal] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [seconds, setSeconds] = useState(0);
  const capture = useRef<AudioCapture | null>(null);
  const mounted = useRef(true);
  const loggedOut = useRef(false);
  const uploadedId = useRef("");
  const cacheKey = recordingKey(userId, ownerKey, kind);
  const cacheWrites = useRef(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    allowUserRecordings(userId);
    const logout = (id: string) => {
      if (id !== userId) return;
      loggedOut.current = true;
      blockUserRecordings(userId);
      capture.current?.dispose(true);
      setLocal(null);
      setUrl("");
      setRecording(false);
      setRequesting(false);
    };
    const localLogout = (e: Event) => logout((e as CustomEvent<string>).detail);
    window.addEventListener("leader-recording-logout", localLogout);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("leader-recording-session")
        : null;
    if (channel) channel.onmessage = (e) => logout(e.data);
    return () => {
      mounted.current = false;
      capture.current?.dispose(loggedOut.current);
      channel?.close();
      window.removeEventListener("leader-recording-logout", localLogout);
    };
  }, [userId]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function attach(blob: Blob) {
    uploadedId.current = "";
    setLocal(blob);
    setUrl(URL.createObjectURL(blob));
  }
  function buffer(blob: Blob) {
    if (kind === "practice" || loggedOut.current) return;
    cacheWrites.current = cacheWrites.current
      .then(() => cacheRecording(cacheKey, blob))
      .catch(() => {
        if (mounted.current)
          task.setNotice(
            "Восстановление в этом браузере недоступно. Отправь запись, не закрывая страницу.",
          );
      });
  }
  async function start() {
    setRequesting(true);
    await task.run(async () => {
      capture.current?.dispose();
      const session = new AudioCapture({
        buffer,
        complete: (blob) => {
          if (mounted.current && !loggedOut.current) {
            attach(blob);
            setRecording(false);
          }
        },
        error: (error) => {
          if (mounted.current) {
            setRecording(false);
            task.setNotice(error.message);
          }
        },
      });
      capture.current = session;
      await session.start();
      if (
        mounted.current &&
        capture.current === session &&
        !loggedOut.current
      ) {
        setLocal(null);
        setUrl("");
        setSeconds(0);
        setRecording(true);
      }
    });
    if (mounted.current) setRequesting(false);
  }
  return (
    <section className="recorder" aria-label={title}>
      <div className="evidence-top">
        <h3>{title}</h3>
        {savedId && !local && !recording && (
          <span className="tag success">Ответ сохранён</span>
        )}
      </div>
      <p lang="en">{prompt}</p>
      <div className="row">
        {requesting ? (
          <button
            type="button"
            className="record-button"
            onClick={() => {
              capture.current?.dispose();
              capture.current = null;
              setRequesting(false);
            }}
          >
            Отменить запрос микрофона
          </button>
        ) : recording ? (
          <>
            <button
              type="button"
              className="record-button recording"
              onClick={() => capture.current?.stop()}
            >
              <Square size={15} />
              Остановить запись
            </button>
            <span className="recording-indicator" role="status">
              Запись · {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")}
            </span>
          </>
        ) : (
          <button
            type="button"
            className="record-button"
            disabled={task.busy}
            onClick={start}
          >
            <Mic size={17} />
            {local || savedId ? "Записать ещё раз" : "Начать запись"}
          </button>
        )}
        {kind !== "practice" && !recording && !requesting && (
          <button
            type="button"
            className="button quiet small"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                const blob = await restoreRecording(cacheKey);
                if (!blob?.size)
                  throw new Error(
                    "Несохранённых записей этого аккаунта в браузере нет.",
                  );
                attach(blob);
              }, "Запись восстановлена. Прослушай её перед отправкой.")
            }
          >
            <RotateCcw size={14} />
            Восстановить после сбоя
          </button>
        )}
      </div>
      <p className="subtle" style={{ marginTop: 9 }}>
        До 3 минут.{" "}
        {kind === "practice"
          ? "Пробная запись остаётся только на этом устройстве."
          : "До подтверждения отправки запись остаётся на этом устройстве."}
      </p>
      {(url || savedId) && !recording && (
        <audio
          aria-label={"Прослушать: " + title}
          controls
          src={url || "/api/files/" + savedId}
          preload="metadata"
          onError={() => {
            if (local)
              task.setNotice(
                "Не удалось воспроизвести файл. Проверь формат или выбери другую запись.",
              );
          }}
        />
      )}
      {local && !recording && kind !== "practice" && (
        <div className="audio-confirm">
          <p className="subtle">
            Прослушай ответ. Отправка сохранит эту запись для языковой проверки.
          </p>
          <button
            type="button"
            className="button primary small"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                if (!local.size)
                  throw new Error("Запись пуста. Запиши ответ ещё раз.");
                const extension = local.type.includes("mp4")
                  ? "m4a"
                  : local.type.includes("ogg")
                    ? "ogg"
                    : local.type.includes("wav")
                      ? "wav"
                      : "webm";
                if (!uploadedId.current)
                  uploadedId.current = (
                    await upload(
                      new File([local], `${kind}.${extension}`, {
                        type: local.type,
                      }),
                      kind,
                    )
                  ).id;
                if (!onSaved)
                  throw new Error(
                    "Не удалось связать запись с ответом. Обнови страницу и восстанови запись.",
                  );
                await onSaved(uploadedId.current);
                await cacheWrites.current;
                await clearRecording(cacheKey);
                setLocal(null);
                setUrl("");
                uploadedId.current = "";
              }, "Ответ сохранён. Его можно прослушать после обновления страницы.")
            }
          >
            <Save size={15} />
            {task.busy ? "Отправляем запись…" : "Подтвердить отправку записи"}
          </button>
        </div>
      )}
      {kind !== "practice" && (
        <label className="upload-zone" style={{ marginTop: 18 }}>
          <span className="inline">
            <Upload size={15} />
            Или выбери файл · WebM, Ogg, WAV, M4A · до 25 МБ
          </span>
          <input
            type="file"
            accept="audio/webm,audio/ogg,audio/wav,audio/mp4"
            disabled={task.busy || recording || requesting}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                task.run(async () => {
                  if (!file.size || file.size > 25 * 1024 * 1024)
                    throw new Error("Выбери непустой аудиофайл до 25 МБ.");
                  attach(file);
                  buffer(file);
                }, "Файл выбран. Прослушай его и подтверди отправку.");
            }}
          />
        </label>
      )}
      <Feedback task={task} />
    </section>
  );
}
