"use client";
import { useState } from "react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";

type Found = {
  id: string;
  name: string;
  email: string | null;
  phoneE164: string | null;
  phoneVerifiedAt: string | null;
  application: { submittedAt: string | null } | null;
  accessGrants: {
    id: string;
    reason: string;
    createdAt: string;
    revokedAt: string | null;
    issuedBy: { name: string };
  }[];
};
export function AccessManager() {
  const [identifier, setIdentifier] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneReason, setPhoneReason] = useState("");
  const [message, setMessage] = useState("");
  const task = useTask();
  async function lookup() {
    const result = await action<Found>("access.find", { identifier });
    setFound(result);
  }
  return (
    <div className="access-manager">
      <form
        className="access-search"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(lookup);
        }}
      >
        <label className="field">
          Email или ID кандидата
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>
        <button className="button secondary" disabled={task.busy}>
          Найти
        </button>
      </form>
      {found && (
        <section className="access-result">
          <h2>{found.name}</h2>
          <p>
            {found.email} · ID {found.id}
          </p>
          <p>
            {found.application?.submittedAt
              ? "Заявка отправлена. Доступ уже открыт по заявке."
              : "Отправленной заявки нет."}
          </p>
          <label className="field">
            Основание предоставления доступа
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={500}
            />
          </label>
          <button
            className="button primary"
            disabled={task.busy || reason.trim().length < 10}
            onClick={() =>
              task.run(async () => {
                await action("access.grant", {
                  userId: found.id,
                  confirmName: found.name,
                  reason,
                });
                setMessage("Доступ предоставлен. Запись сохранена в истории.");
                await lookup();
              })
            }
          >
            Предоставить полный кабинет
          </button>
          <h3>История доступа</h3>
          {found.accessGrants.length ? (
            found.accessGrants.map((g) => (
              <div key={g.id} className="access-history">
                <p>
                  {g.reason} · {g.issuedBy.name} ·{" "}
                  {new Date(g.createdAt).toLocaleString("ru")}
                </p>
                <p>{g.revokedAt ? "Отозвано" : "Действует"}</p>
                {!g.revokedAt && (
                  <button
                    className="button quiet"
                    disabled={task.busy}
                    onClick={() =>
                      task.run(async () => {
                        await action("access.revoke", { grantId: g.id });
                        setMessage("Разрешение отозвано.");
                        await lookup();
                      })
                    }
                  >
                    Отозвать разрешение
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>Разрешений пока нет.</p>
          )}
          <h3>Подтверждённый телефон</h3>
          <p>
            {found.phoneVerifiedAt
              ? found.phoneE164
              : "Номер не подтверждён. По нему нельзя войти."}
          </p>
          <p>
            Указывайте номер только после независимой проверки владения и
            запишите способ проверки. Сообщение с кодом приложение не
            отправляет.
          </p>
          <label className="field">
            Телефон в международном формате
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+77001234567"
            />
          </label>
          <label className="field">
            Как проверено владение номером
            <textarea
              value={phoneReason}
              onChange={(e) => setPhoneReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={
                task.busy ||
                phoneReason.trim().length < 12 ||
                !/^\+[1-9]\d{9,14}$/.test(phone.replace(/[\s()-]/g, ""))
              }
              onClick={() =>
                task.run(async () => {
                  await action("access.phone.verify", {
                    userId: found.id,
                    confirmName: found.name,
                    phone,
                    reason: phoneReason,
                  });
                  setMessage("Подтверждённый номер привязан.");
                  await lookup();
                })
              }
            >
              Привязать проверенный номер
            </button>
            {found.phoneVerifiedAt && (
              <button
                className="button quiet"
                disabled={task.busy || phoneReason.trim().length < 12}
                onClick={() =>
                  task.run(async () => {
                    await action("access.phone.revoke", {
                      userId: found.id,
                      confirmName: found.name,
                      reason: phoneReason,
                    });
                    setMessage("Привязка номера отозвана.");
                    await lookup();
                  })
                }
              >
                Отозвать номер
              </button>
            )}
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <Feedback task={task} />
    </div>
  );
}
