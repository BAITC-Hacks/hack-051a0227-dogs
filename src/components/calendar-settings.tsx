"use client";
import { useState } from "react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function CalendarSettings({
  connected,
  name,
  error,
}: {
  connected: boolean;
  name: string;
  error: boolean;
}) {
  const task = useTask(),
    [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState("");
  return (
    <section className="panel stack">
      <h2>Google Calendar и Meet</h2>
      <p>
        {connected
          ? name
            ? "Выбран календарь: " + name
            : "Google подключён. Выбери собственный календарь для интервью."
          : "Подключи Google, чтобы создавать отдельную Meet-ссылку для каждого интервью."}
      </p>
      {error && (
        <p role="alert">
          Подключение не завершено. Проверь настройки и предоставленные
          разрешения, затем повтори.
        </p>
      )}
      <p>
        Доступ позволяет читать список календарей и доступное время, создавать и
        изменять встречи в собственных календарях. Приглашения отправляются
        только после предпросмотра и подтверждения интервью.
      </p>
      <div className="row">
        <button
          className="button secondary"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              const r = await action<{ url: string }>("google.connect");
              window.location.assign(r.url);
            })
          }
        >
          {connected ? "Подключить заново" : "Подключить Google"}
        </button>
        {connected && (
          <button
            className="button secondary"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                setCalendars(await action("google.calendars"));
              })
            }
          >
            Выбрать календарь
          </button>
        )}
      </div>
      {calendars.length > 0 && (
        <>
          <label className="field">
            Собственный календарь с Google Meet
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Выбери календарь</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={!selected || task.busy}
            onClick={() =>
              task.run(async () => {
                await action("google.select", { calendarId: selected });
                window.location.reload();
              })
            }
          >
            Сохранить календарь
          </button>
        </>
      )}
      <Feedback task={task} />
    </section>
  );
}
