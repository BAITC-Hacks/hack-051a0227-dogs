"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, Check, ArrowLeft,  Save } from "lucide-react";
import type { LanguageCheck } from "@prisma/client";
import type { LanguageState } from "@/lib/types";
import { action } from "@/lib/client";
import { requestMicrophone } from "@/lib/microphone";
import { AudioProcessing, type AudioState } from "./audio-processing";
import { languageTask } from "@/lib/audio-contract";
import { Recorder } from "./recorder";
import { Feedback, useTask, Tag } from "./ui";
export function LanguageWorkspace({
  applicationId,
  check,
  consented,
  userId,
  submitted,
  audio,
}: {
  applicationId: string;
  check: Pick<LanguageCheck,"id"|"state"|"revision"|"status"> | null;
  consented: boolean;
  userId: string;
  submitted: boolean;
  audio: AudioState;
}) {
  const [state, setState] = useState<LanguageState>(
    (check?.state as unknown as LanguageState) ?? {
      comprehension: "",
      oralId: "",
      followupId: "",
      writtenNote: "",
    },
  );
  const [revision, setRevision] = useState(check?.revision ?? 0);
  const micRequest = useRef<AbortController | null>(null);
  useEffect(() => () => micRequest.current?.abort(), []);
  const [mic, setMic] = useState("");
  const [comprehension, setComprehension] = useState("");
  const task = useTask();
  const micTask = useTask();
  const router = useRouter();
  const [finished, setFinished] = useState(
    check?.status === "PENDING_REVIEW" || check?.status === "REVIEWED",
  );
  async function save(nextState = state, finish = false) {
    const result = await action<{
      revision: number;
      comprehensionFeedback: string;
    }>("language.save", { state: nextState, revision, finish });
    setRevision(result.revision);
    setComprehension(result.comprehensionFeedback);
    setFinished(finish);
  }
  if (!consented)
    return (
      <div className="page wrap">
        <h1>Согласие на языковую запись</h1>
        <p style={{ margin: "20px 0" }}>
          Для записи и хранения устных ответов требуется отдельное согласие.
          Языковой ответ будет доступен сотруднику и не используется для
          определения личности.
        </p>
        <button
          className="button primary"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              await action("language.consent");
              router.refresh();
            }, "Согласие сохранено.")
          }
        >
          Разрешаю запись и языковую проверку
        </button>
        <Feedback task={task} />
      </div>
    );
  return (
    <div className="page wrap">
      <div className="breadcrumbs">
        <Link href="/apply">
          <ArrowLeft size={13} /> Заявка
        </Link>
      </div>
      <div className="page-title">
        <div>
          <h1>Дай своему ответу голос</h1>
          <p>
            Отдельная языковая проверка. В своём темпе, с возможностью
            прослушать запись.
          </p>
        </div>
        <Tag tone="blue">Английский язык</Tag>
      </div>
      <div className="language-layout">
        <div>
          <section className="panel">
            <h2>Проба записи по желанию</h2>
            <p className="subtle">
              Можно записать ответы здесь или загрузить готовые аудиофайлы в
              заданиях ниже. Пробная фраза помогает проверить микрофон и не
              передаётся на оценку.
            </p>
            <button
              className="button secondary"
              style={{ marginTop: 18 }}
              disabled={micTask.busy}
              onClick={() =>
                micTask.run(async () => {
                  if (!navigator.mediaDevices)
                    throw new Error(
                      "Доступ к микрофону в этом браузере недоступен.",
                    );
                  let stream;
                  try {
                    micRequest.current?.abort();
                    micRequest.current = new AbortController();
                    stream = await requestMicrophone(micRequest.current.signal);
                  } catch {
                    throw new Error(
                      "Браузер не разрешил доступ к микрофону. Разреши его в настройках или загрузи готовую запись ниже.",
                    );
                  }
                  const tracks = stream.getAudioTracks();
                  stream.getTracks().forEach((t) => t.stop());
                  if (!tracks.length)
                    throw new Error(
                      "Микрофон не найден. Подключи его и повтори.",
                    );
                  setMic(tracks[0].label || "Микрофон доступен");
                  tracks.forEach((t) => t.stop());
                })
              }
            >
              <Mic size={17} />
              Проверить микрофон
            </button>
            <Feedback task={micTask} />
            {mic && (
              <p className="notice success" style={{ marginTop: 14 }}>
                <Check size={17} />
                Устройство доступно: {mic}. Прослушай пробную запись для
                проверки звука.
              </p>
            )}
            <Recorder
              title="Пробная запись"
              prompt="Say a sentence about your day, then listen back."
              kind="practice"
              ownerKey={applicationId}
              userId={userId}
            />
          </section>
          <section className="review-section" style={{ marginTop: 28 }}>
            <h2>Прочитай сообщение команды</h2>
            <div className="language-message" lang="en">
              {languageTask.context}
            </div>
            <fieldset>
              <legend>Why has the starting time changed?</legend>
              <div className="stack">
                {[
                  ["later", "The hall will be available later."],
                  ["cancelled", "The workshop has been cancelled."],
                  ["paid", "Visitors now need to buy tickets."],
                ].map(([v, label]) => (
                  <label className="check-label" lang="en" key={v}>
                    <input
                      type="radio"
                      name="comprehension"
                      value={v}
                      checked={state.comprehension === v}
                      onChange={() => {
                        setState((s) => ({ ...s, comprehension: v }));
                        setComprehension("");
                        setFinished(false);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="button secondary small"
              style={{ marginTop: 20 }}
              disabled={!state.comprehension || task.busy}
              onClick={() =>
                task.run(async () => {
                  await save();
                })
              }
            >
              Проверить ответ
            </button>
            {comprehension && (
              <p className="notice info" style={{ marginTop: 14 }}>
                {comprehension}
              </p>
            )}
          </section>
          <Recorder
            title="Твой устный ответ"
            prompt={languageTask.oral}
            kind="oral"
            ownerKey={applicationId}
            userId={userId}
            savedId={state.oralId}
            onSaved={async (mid) => {
              const next = { ...state, oralId: mid };
              await save(next);
              setState(next);
              setFinished(false);
            }}
          />
          <Recorder
            title="Уточняющий вопрос"
            prompt={languageTask.followup}
            kind="followup"
            ownerKey={applicationId}
            userId={userId}
            savedId={state.followupId}
            onSaved={async (mid) => {
              const next = { ...state, followupId: mid };
              await save(next);
              setState(next);
              setFinished(false);
            }}
          />
          <AudioProcessing
            applicationId={applicationId}
            revision={revision}
            ready={!!state.oralId && !!state.followupId}
            initial={audio}
          />
          <label className="field" style={{ marginTop: 24 }}>
            Условия выполнения или техническая проблема
            <textarea
              value={state.writtenNote}
              maxLength={2000}
              onChange={(e) =>
                setState((s) => ({ ...s, writtenNote: e.target.value }))
              }
              placeholder="Например, запись прервалась из-за соединения"
            />
            <small>
              Это пояснение, а не расшифровка аудио. Техническая ошибка не
              снижает результат.
            </small>
          </label>
          <div className="row" style={{ marginTop: 24 }}>
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  await save();
                }, "Прогресс языкового ответа сохранён.")
              }
            >
              <Save size={16} />
              Сохранить
            </button>
            <button
              className="button primary"
              disabled={
                task.busy ||
                !state.oralId ||
                !state.followupId ||
                !state.comprehension
              }
              onClick={() =>
                task.run(
                  async () => {
                    await save(state, true);
                    router.refresh();
                  },
                  submitted
                    ? "Ответ передан на проверку сотруднику."
                    : "Ответ сохранён. Комиссия увидит его после отправки заявки.",
                )
              }
            >
              Передать на проверку
            </button>
          </div>
          <Feedback task={task} />
          {finished && (
            <div className="artifact-summary">
              <h3>Ответ сохранён для проверки</h3>
              <p className="subtle" style={{ margin: "12px 0 20px" }}>
                {submitted
                  ? "Оригиналы обеих записей доступны сотруднику."
                  : "Комиссия получит доступ к ответам после отправки заявки."}{" "}
                Результат относится только к языковой готовности.
              </p>
              <Link className="button dark" href="/apply">
                Вернуться к заявке
              </Link>
            </div>
          )}
        </div>
        <aside className="panel">
          <h2>Слушаем содержание</h2>
          <p>
            Проверяется понимание сообщения и устный ответ на английском.
            Оригинал записи остаётся источником для сотрудника.
          </p>
          <hr className="divider" />
          <p className="subtle">
            Это внутренняя проверка, не сертификат IELTS или CEFR. Она не
            оценивает лидерство, личность, эмоции или состояние здоровья.
          </p>
          {check?.status === "REVIEWED" && (
            <div style={{ marginTop: 24 }}>
              <h3>Обратная связь сотрудника</h3>
              <p style={{ fontSize: 13, marginTop: 12 }}>Опубликованные рекомендации доступны в статусе заявки.</p>
            </div>
          )}
          <hr className="divider" />
          <p className="subtle">
            Если соединение прервётся, используй «Восстановить после сбоя».
            После успешной загрузки оригинал хранится на сервере.
          </p>
        </aside>
      </div>
    </div>
  );
}
