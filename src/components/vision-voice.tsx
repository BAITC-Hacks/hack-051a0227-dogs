"use client";
import { useEffect, useRef, useState } from "react";
import { AudioCapture } from "@/lib/audio-capture";
import { visionVoices } from "@/lib/vision-contract";
import type { ProfileScope } from "@/lib/profile-contract";
async function audioAction(
  body: Record<string, unknown> | FormData,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/vision/audio", {
    method: "POST",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
    signal,
  });
  const result = await r.json();
  if (!r.ok || !result.ok)
    throw new Error(result.error ?? "Не удалось обработать звук.");
  return result.data;
}
export function VisionDictation({
  scope,
  enabled,
  onText,
}: {
  scope: ProfileScope;
  enabled: boolean;
  onText: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [job, setJob] = useState(""),
    [audio, setAudio] = useState<Blob | null>(null);
  const [restored, setRestored] = useState<{
    id?: string;
    text?: string;
    status?: string;
  } | null>(null);
  const capture = useRef<AudioCapture | null>(null),
    abort = useRef<AbortController | null>(null),
    alive = useRef(true);
  const uploaded = useRef<{ blob: Blob; id: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      capture.current?.dispose(true);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!enabled) {
      capture.current?.dispose(true);
      capture.current = null;
      abort.current?.abort();
    }
  }, [enabled]);
  const scopeText = JSON.stringify(scope);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void audioAction({ command: "latest", scope: JSON.parse(scopeText) })
      .then((data) => {
        if (!cancelled) setRestored(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, scopeText]);
  async function transcribe(blob?: Blob, existingId?: string) {
    existingId ??=
      blob && uploaded.current?.blob === blob ? uploaded.current.id : undefined;
    setBusy(true);
    setError("");
    setNotice("Запись сохранится отдельно от текста вопроса.");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const form = new FormData();
      form.set("scope", JSON.stringify(scope));
      form.set("requestKey", crypto.randomUUID());
      if (blob) form.set("file", blob, "question");
      const data = existingId
        ? { id: existingId }
        : await audioAction(form, controller.signal);
      if (existingId) {
        const current = await audioAction(
          { command: "status", id: existingId },
          controller.signal,
        );
        if (current.status === "FAILED")
          await audioAction(
            { command: "retry", id: existingId },
            controller.signal,
          );
      }
      setJob(data.id);
      if (blob) uploaded.current = { blob, id: data.id };
      for (let i = 0; i < 35; i++) {
        const s = await audioAction(
          { command: "status", id: data.id },
          controller.signal,
        );
        if (s.status === "COMPLETED") {
          if (alive.current && !controller.signal.aborted) {
            onText(s.text);
            setNotice(
              "Расшифровка в поле вопроса. Проверь и исправь её перед отправкой.",
            );
          }
          return;
        }
        if (["FAILED", "CANCELLED"].includes(s.status))
          throw new Error(s.error ?? "Расшифровка остановлена.");
        await new Promise<void>((resolve, reject) => {
          const stop = () => {
            clearTimeout(t);
            reject(new Error("Остановлено"));
          };
          const t = setTimeout(() => {
            controller.signal.removeEventListener("abort", stop);
            resolve();
          }, 2000);
          controller.signal.addEventListener("abort", stop, { once: true });
        });
      }
      throw new Error("Расшифровка ещё не завершена. Повтори проверку.");
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Расшифровка не получена.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function start() {
    setError("");
    setNotice("");
    capture.current?.dispose(true);
    const session = new AudioCapture(
      {
        buffer: setAudio,
        complete: (blob) => {
          setRecording(false);
          setAudio(blob);
        },
        error: (e) => {
          setRecording(false);
          setError(e.message);
        },
        stopped: () => {
          if (alive.current) setRecording(false);
        },
      },
      undefined,
      60000,
    );
    capture.current = session;
    try {
      await session.start();
      if (alive.current && capture.current === session) setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Микрофон недоступен.");
    }
  }
  return (
    <details className="vision-voice">
      <summary>Голосовой вопрос</summary>
      <p>
        Запиши до одной минуты или загрузи файл. Vision расшифрует его;
        отправляешь вопрос ты после проверки текста.
      </p>
      {enabled && restored?.id && !audio && !recording && (
        <div>
          <p>Есть сохранённая запись вопроса.</p>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() =>
              restored.text
                ? onText(restored.text)
                : void transcribe(undefined, restored.id)
            }
          >
            {restored.text
              ? "Добавить сохранённую расшифровку в вопрос"
              : "Продолжить расшифровку"}
          </button>
        </div>
      )}
      <div className="profile-prompts">
        <button
          type="button"
          className="button secondary"
          disabled={!enabled || busy}
          onClick={() => (recording ? capture.current?.stop() : void start())}
        >
          {recording ? "Остановить запись" : "Записать вопрос"}
        </button>
        <label className="button secondary">
          Загрузить аудио
          <input
            type="file"
            accept="audio/*"
            disabled={!enabled || busy || recording}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setAudio(f);
                setError("");
              }
            }}
          />
        </label>
      </div>
      {recording && (
        <p role="status">Идёт запись. Останови её, когда закончишь вопрос.</p>
      )}
      {audio && !recording && (
        <button
          type="button"
          className="button secondary"
          disabled={!enabled || busy}
          onClick={() => void transcribe(audio)}
        >
          {error ? "Повторить расшифровку" : "Расшифровать запись"}
        </button>
      )}
      {busy && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            abort.current?.abort();
            uploaded.current = null;
            if (job)
              void audioAction({ command: "cancel", id: job }).catch(() => {});
          }}
        >
          Остановить обработку
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function VisionSpeech({
  scope,
  answerId,
  enabled,
}: {
  scope: ProfileScope;
  answerId?: string;
  enabled: boolean;
}) {
  const [voice, setVoice] = useState<(typeof visionVoices)[number]>("coral"),
    [language, setLanguage] = useState("ru"),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null),
    player = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!enabled) {
      abort.current?.abort();
      player.current?.pause();
    }
  }, [enabled]);
  async function speak(sample = false) {
    setError("");
    setBusy(true);
    setUrl("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const r = await audioAction(
        { scope, voice, ...(sample ? { sample: language } : { answerId }) },
        controller.signal,
      );
      setUrl(`/api/vision/audio/${r.id}`);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Озвучивание остановлено."
          : e instanceof Error
            ? e.message
            : "Звук не получен.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="vision-voice">
      <summary>{answerId ? "Послушать ответ" : "Выбрать голос Vision"}</summary>
      <p>
        Голос AI. Воспроизведение начинается только по твоему действию. В
        длинном ответе озвучивается начало.
      </p>
      <div className="vision-voice-options">
        <label className="field">
          Голос
          <select
            value={voice}
            onChange={(e) => {
              player.current?.pause();
              setUrl("");
              setVoice(e.target.value as typeof voice);
            }}
          >
            {visionVoices.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Язык пробы
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <div className="profile-prompts">
        <button
          type="button"
          className="button secondary"
          disabled={!enabled || busy}
          onClick={() => void speak(true)}
        >
          Послушать пробу голоса
        </button>
        {answerId && (
          <button
            type="button"
            className="button secondary"
            disabled={!enabled || busy}
            onClick={() => void speak()}
          >
            Подготовить звук ответа
          </button>
        )}
        {busy && (
          <button
            type="button"
            className="text-link"
            onClick={() => abort.current?.abort()}
          >
            Остановить
          </button>
        )}
      </div>
      {url && enabled && (
        <audio
          ref={player}
          controls
          preload="none"
          src={url}
          aria-label="Озвученный ответ Vision"
          onError={() => {
            setUrl("");
            setError("Запись недоступна. Обнови ответ и повтори озвучивание.");
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
