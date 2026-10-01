"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
import { calendarMessages, type MeetingInput } from "@/lib/calendar-contract";
import "./intake.css";
type Base = {
  id: string;
  revision: number;
  materialVersion: string;
  stage: string;
  email: string;
};
type StageChoice = "ACCEPT" | "DECLINE" | "APPROVE_STAGE" | "REVIEW" | "CHECK" | "LANGUAGE" | "FINAL_REVIEW";
type Interview = {
  id: string;
  revision: number;
  scheduledAt: Date | string;
  timezone: string;
  durationMinutes: number;
  calendarStatus: string;
  meetUrl: string | null;
  attendees: unknown;
  calendarOperations?: {
    id: string;
    status: string;
    errorCode: string | null;
  }[];
};
export function StageActions({ application: a, fixedChoice }: { application: Base; fixedChoice?: "ACCEPT" | "DECLINE" }) {
  const router = useRouter(),
    task = useTask();
  const [choice, setChoice] = useState<StageChoice>(
      fixedChoice ?? "APPROVE_STAGE",
    ),
    [reason, setReason] = useState(""),
    [validation, setValidation] = useState(""),
    [preview, setPreview] = useState<{
      id: string;
      payload: {
        fromStage: string;
        toStage: string;
        reason: string;
        action: string;
      };
    } | null>(null);
  const approveLabel =
    a.stage === "INTERVIEW"
      ? "Одобрить этап интервью"
      : a.stage === "LANGUAGE"
        ? "Одобрить языковой этап"
        : "Одобрить рассмотрение материалов";
  const validReason = () => {
    if (reason.trim().length >= 10) return true;
    setValidation("Укажи основание решения — хотя бы 10 символов.");
    return false;
  };
  return (
    <section className={fixedChoice ? "stack stage-action-form" : "panel stack"} id={fixedChoice ? undefined : "stage-actions"}>
      {!fixedChoice && <><h3>Следующий этап</h3><p>Выбери этап и сохрани внутреннее основание перехода.</p></>}
      <div className="form-grid two stage-action-fields">
        {!fixedChoice && <label className="field">
          Действие
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value as StageChoice);
              setPreview(null);
            }}
          >
            <option value="APPROVE_STAGE">{approveLabel}</option>
            <option value="REVIEW">Рассмотрение материалов</option>
            <option value="CHECK">Дополнительная проверка</option>
            <option value="LANGUAGE">Языковая проверка</option>
            <option value="FINAL_REVIEW">Итоговое рассмотрение</option>
          </select>
        </label>}
        <label className="field">
          Основание
          <textarea
            value={reason}
            minLength={10}
            maxLength={4000}
            onChange={(e) => {
              setReason(e.target.value);
              setValidation("");
              setPreview(null);
            }}
            rows={5}
            placeholder={fixedChoice === "ACCEPT" ? "На каких сведениях основано предложение зачисления?" : fixedChoice === "DECLINE" ? "На каких сведениях основан отказ?" : "Почему переводишь заявку на этот этап?"}
          />
        </label>
      </div>
      {validation && <p className="intake-field-error" role="alert">{validation}</p>}
      {fixedChoice ? <button
        type="button"
        className="button primary"
        disabled={task.busy || a.stage === "DECIDED"}
        onClick={() => { if (!validReason()) return; void task.run(async () => {
          const checked = await action<{ id: string }>("stage.preview", {
            applicationId: a.id, revision: a.revision, materialVersion: a.materialVersion,
            action: fixedChoice, reason,
          });
          await action("stage.confirm", { previewId: checked.id, confirm: true });
          setReason("");
          router.refresh();
        }, fixedChoice === "DECLINE" ? "Отказ сохранён." : "Предложение зачисления сохранено."); }}
      >{fixedChoice === "DECLINE" ? "Отказать в зачислении" : "Предложить зачисление"}</button> : <button
        type="button"
        className="button secondary"
        disabled={task.busy || a.stage === "DECIDED"}
        onClick={() => {
          if (!validReason()) return;
          void task.run(async () => {
            setPreview(
              await action("stage.preview", {
                applicationId: a.id,
                revision: a.revision,
                materialVersion: a.materialVersion,
                action: choice,
                reason,
              }),
            );
          });
        }}
      >Сменить этап</button>}
      {!fixedChoice && preview && (
        <div className="calendar-preview">
          <h4>
            Заявка перейдёт на выбранный этап
          </h4>
          <p>{preview.payload.reason}</p>
          <p>
            Основание сохранится в истории комиссии. Кандидат не получит
            внутреннюю заметку; сообщение публикуется отдельно ниже.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await action("stage.confirm", {
                  previewId: preview.id,
                  confirm: true,
                });
                setPreview(null);
                setReason("");
                router.refresh();
              }, "Действие сохранено. История предыдущих решений сохранена.")
            }
          >
            Подтвердить{" "}
            переход
          </button>
        </div>
      )}
      <Feedback task={task} />
    </section>
  );
}
const localDate = (time: Date | string, zone: string) => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));
  return parts.replace(" ", "T");
};
export function CalendarForm({
  application: a,
  interview,
  initiallyOpen = false,
  compact = false,
}: {
  application: Base;
  interview?: Interview;
  initiallyOpen?: boolean;
  compact?: boolean;
}) {
  const router = useRouter(),
    task = useTask(),
    [people, setPeople] = useState<
      { id: string; name: string; email: string; current: boolean }[]
    >([]);
  const current = interview?.attendees as {
    interviewers?: { id: string }[];
    recipients?: string[];
  } | null;
  const [open, setOpen] = useState(initiallyOpen),
    [cancel, setCancel] = useState(false),
    [validation, setValidation] = useState(""),
    [value, setValue] = useState<MeetingInput>({
      localStart: interview
        ? localDate(interview.scheduledAt, interview.timezone)
        : "",
      timezone: interview?.timezone ?? "Asia/Almaty",
      durationMinutes: interview?.durationMinutes ?? 30,
      interviewerIds: current?.interviewers?.map((i) => i.id) ?? [],
      recipients: current?.recipients ?? (a.email ? [a.email] : []),
      mode: interview?.calendarStatus && interview.calendarStatus !== "MANUAL" ? "GOOGLE" : "MANUAL",
      manualUrl: interview?.meetUrl ?? "",
      publish: true,
      reason: "",
    });
  const [preview, setPreview] = useState<{
    id: string;
    payload: {
      input: MeetingInput;
      start: string;
      end: string;
      emails: string[];
      availability: { id: string; state: string }[];
      cancel: boolean;
    };
  } | null>(null);
  useEffect(() => {
    if (interview) return;
    const timer = window.setTimeout(() => setValue((previous) => previous.localStart ? previous : {
      ...previous,
      localStart: localDate(new Date(Date.now() + 86400000), "Asia/Almaty"),
    }), 0);
    return () => window.clearTimeout(timer);
  }, [interview]);
  useEffect(() => {
    if (open)
      void action<typeof people>("calendar.people")
        .then((members) => {
          setPeople(members);
          if (!interview) setValue((previous) => previous.interviewerIds.length ? previous : {
            ...previous,
            interviewerIds: members.filter((member) => member.current).map((member) => member.id),
          });
        })
        .catch(() => {});
  }, [open, interview]);
  useEffect(() => {
    if (!interview || !["QUEUED", "PENDING"].includes(interview.calendarStatus))
      return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [interview, router]);
  const change = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => {
    setValue((x) => ({ ...x, [k]: v }));
    setPreview(null);
    setValidation("");
  };
  const validMeeting = () => {
    const missing = !value.localStart ? "Выбери дату и время." : !value.interviewerIds.length ? "Выбери интервьюера." : value.reason.trim().length < 10 ? "Добавь короткое основание для комиссии — от 10 символов." : "";
    setValidation(missing);
    return !missing;
  };
  return (
    <section className={compact ? "stack calendar-form-compact" : "panel stack"} id="schedule-interview">
      <div className="row between">
        <h3>{interview ? "Время и приглашение" : "Назначить интервью"}</h3>
        {!compact && <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(!open)}
        >
          {open
            ? "Свернуть"
            : interview
              ? "Изменить встречу"
              : "Назначить интервью"}
        </button>}
      </div>
      {interview && (
        <>
          <p role="status">
            {calendarMessages[interview.calendarStatus] ??
              interview.calendarStatus}
          </p>
          {interview.meetUrl &&
            ["READY", "MANUAL"].includes(interview.calendarStatus) && (
              <a
                className="text-link"
                href={interview.meetUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть встречу
              </a>
            )}
          {interview.calendarOperations
            ?.filter((o) => ["FAILED", "PENDING"].includes(o.status))
            .slice(0, 1)
            .map((o) => (
              <button
                key={o.id}
                type="button"
                className="button secondary"
                onClick={() =>
                  task.run(async () => {
                    await action("calendar.retry", { id: o.id });
                    router.refresh();
                  }, "Операция повторно поставлена в очередь.")
                }
              >
                Повторить проверку встречи
              </button>
            ))}
        </>
      )}
      {open && (
        <div className="calendar-form">
          <div className="form-grid two">
            <label className="field">
              Дата и время
              <input
                type="datetime-local"
                value={value.localStart}
                onChange={(e) => change("localStart", e.target.value)}
              />
            </label>
            <label className="field">
              Часовой пояс
              <select
                value={value.timezone}
                onChange={(e) => change("timezone", e.target.value)}
              >
                {[
                  "Asia/Almaty",
                  "Asia/Bishkek",
                  "Asia/Tashkent",
                  "Asia/Dushanbe",
                  "Asia/Ashgabat",
                  "Europe/Moscow",
                  "Europe/London",
                  "UTC",
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Длительность, минут
              <input
                type="number"
                min={10}
                max={180}
                value={value.durationMinutes}
                onChange={(e) =>
                  change("durationMinutes", Number(e.target.value))
                }
              />
            </label>
            <label className="field">
              Способ встречи
              <select
                value={value.mode}
                onChange={(e) =>
                  change("mode", e.target.value as "GOOGLE" | "MANUAL")
                }
              >
                <option value="MANUAL">Назначить в приложении</option>
                <option value="GOOGLE">Создать Google Meet</option>
              </select>
            </label>
          </div>
          {value.mode === "GOOGLE" ? (
            <Link className="text-link" href="/settings/calendar">
              Подключение Google и календарь
            </Link>
          ) : (
            <label className="field">
              Ссылка на встречу, если есть
              <input
                type="url"
                value={value.manualUrl}
                onChange={(e) => change("manualUrl", e.target.value)}
                placeholder="https://…"
              />
              <small>Время появится у кандидата сразу. Ссылку можно добавить позже.</small>
            </label>
          )}
          <fieldset className="source-checks">
            <legend>Интервьюеры</legend>
            {people.map((p) => (
              <label className="check-label" key={p.id}>
                <input
                  type="checkbox"
                  checked={value.interviewerIds.includes(p.id)}
                  onChange={(e) =>
                    change(
                      "interviewerIds",
                      e.target.checked
                        ? [...value.interviewerIds, p.id]
                        : value.interviewerIds.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name} · {p.email}
              </label>
            ))}
          </fieldset>
          <label className="field">
            Получатели приглашения, по одному адресу в строке
            <textarea
              rows={3}
              value={value.recipients.join("\n")}
              onChange={(e) => change("recipients", e.target.value.split("\n").map((email) => email.trim()).filter(Boolean))}
            />
            {!compact && <small>
              {value.mode === "GOOGLE"
                ? "Интервьюеры также получат приглашение Google. Проверь каждый адрес перед подтверждением."
                : "Время будет опубликовано в заявке. Внешние письма не отправляются."}
            </small>}
          </label>
          <label className="field">
            Основание для комиссии
            <textarea
              value={value.reason}
              onChange={(e) => change("reason", e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Что обсудить с кандидатом на интервью?"
            />
          </label>
          {!compact && <label className="check-label">
            <input
              type="checkbox"
              checked={value.publish}
              onChange={(e) => change("publish", e.target.checked)}
            />
            Опубликовать кандидату приглашение с временем и ссылкой после
            подтверждения встречи
          </label>}
          {interview && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={cancel}
                onChange={(e) => {
                  setCancel(e.target.checked);
                  setPreview(null);
                }}
              />
              Отменить эту встречу
            </label>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={task.busy}
            onClick={() => {
              if (!validMeeting()) return;
              void task.run(async () => {
                setPreview(
                  await action("calendar.preview", {
                    applicationId: a.id,
                    revision: a.revision,
                    materialVersion: a.materialVersion,
                    input: value,
                    interviewId: interview?.id,
                    cancel,
                  }),
                );
              });
            }}
          >
            Проверить время и приглашение
          </button>
          {validation && <p role="alert" className="intake-field-error">{validation}</p>}
          {preview && (
            <div className="calendar-preview">
              <h4>
                {cancel
                  ? "Отмена интервью"
                  : interview
                    ? "Перенос интервью"
                    : "Приглашение на интервью"}
              </h4>
              <p>
                {localDate(preview.payload.start, value.timezone).replace(
                  "T",
                  " ",
                )}{" "}
                · {value.timezone} · {value.durationMinutes} мин.
              </p>
              <p>Получатели: {preview.payload.emails.join(", ")}</p>
              <ul>
                {preview.payload.availability.map((x) => (
                  <li key={x.id}>
                    {x.id}:{" "}
                    {
                      (
                        {
                          FREE: "свободно по календарю",
                          BUSY: "есть пересечение",
                          UNKNOWN: "доступность не подтверждена",
                        } as Record<string, string>
                      )[x.state]
                    }
                  </li>
                ))}
              </ul>
              {!compact && <p>
                {value.publish
                  ? value.mode === "GOOGLE"
                    ? "Кандидат увидит время и подтверждённую Google ссылку."
                    : "Кандидат увидит время и указанную сотрудником ссылку."
                  : "Приглашение в приложении не публикуется."}{" "}
                Основание остаётся внутри комиссии.
              </p>}
              <button
                type="button"
                className="button primary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    const r = await action<{ id: string }>("calendar.confirm", {
                      previewId: preview.id,
                      confirm: true,
                    });
                    setPreview(null);
                    router.push("/admissions/interviews/" + r.id);
                  }, "Параметры встречи сохранены.")
                }
              >
                Подтвердить{" "}
                {cancel ? "отмену" : interview ? "перенос" : "назначение"}
              </button>
            </div>
          )}
        </div>
      )}
      <Feedback task={task} />
    </section>
  );
}
