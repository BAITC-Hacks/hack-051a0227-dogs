"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";

type PasskeyRow = {
  credentialId: string;
  name: string;
  createdAt: string;
  usedAt: string | null;
  backedUp: boolean;
};
type SessionRow = {
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
export function AccountSecurity({
  passkeys,
  sessions,
}: {
  passkeys: PasskeyRow[];
  sessions: SessionRow[];
}) {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const task = useTask();
  const router = useRouter();
  const supported =
    typeof window === "undefined" || !!window.PublicKeyCredential;
  return (
    <div className="account-security">
      <section id="sign-in-methods" className="account-section">
        <h2>Способы входа</h2>
        <p>
          Пароль остаётся доступным. Ключ входа хранится на твоём устройстве или
          в его защищённой синхронизации.
        </p>
        <div className="account-add-key">
          <label className="field">
            Название ключа
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой ноутбук"
              maxLength={80}
            />
          </label>
          <label className="field">
            Подтверди пароль
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button
            className="button primary"
            type="button"
            disabled={
              !supported || !password || name.trim().length < 2 || task.busy
            }
            onClick={() =>
              task.run(async () => {
                setNotice("");
                const options =
                  await action<PublicKeyCredentialCreationOptionsJSON>(
                    "passkey.register.begin",
                    { password },
                  );
                try {
                  const response = await startRegistration({
                    optionsJSON: options,
                  });
                  await action("passkey.register.finish", { name, response });
                  setNotice("Ключ добавлен.");
                  setPassword("");
                  router.refresh();
                } catch (e) {
                  if (
                    e instanceof Error &&
                    ["NotAllowedError", "AbortError"].includes(e.name)
                  ) {
                    setNotice("Добавление ключа отменено.");
                    return;
                  }
                  throw e;
                }
              })
            }
          >
            Добавить ключ входа
          </button>
        </div>
        {!supported && (
          <p>
            Этот браузер не поддерживает вход с устройства. Вход по паролю
            доступен.
          </p>
        )}
        {passkeys.length ? (
          <ul className="passkey-list">
            {passkeys.map((k) => (
              <li key={k.credentialId}>
                <div>
                  <strong>{k.name}</strong>
                  <p>
                    Добавлен {new Date(k.createdAt).toLocaleDateString("ru")}
                    {k.usedAt
                      ? ` · использован ${new Date(k.usedAt).toLocaleDateString("ru")}`
                      : ""}
                    {k.backedUp ? " · синхронизируется" : ""}
                  </p>
                </div>
                <button
                  className="button quiet"
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await action("passkey.remove", {
                        credentialId: k.credentialId,
                      });
                      setNotice(
                        "Ключ удалён. Активные сеансы остались открыты.",
                      );
                      router.refresh();
                    })
                  }
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Ключей входа пока нет.</p>
        )}
      </section>
      <section id="active-sessions" className="account-section">
        <h2>Активные сеансы</h2>
        <p>
          Удаление ключа входа не завершает сеанс. Заверши нужный сеанс
          отдельно.
        </p>
        <ul className="passkey-list">
          {sessions.map((s) => (
            <li key={s.tokenHash}>
              <div>
                <strong>{s.current ? "Этот браузер" : "Другой сеанс"}</strong>
                <p>
                  Начат {new Date(s.createdAt).toLocaleString("ru")} · действует
                  до {new Date(s.expiresAt).toLocaleDateString("ru")}
                </p>
              </div>
              <button
                className="button quiet"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("session.revoke", { tokenHash: s.tokenHash });
                    if (s.current) {
                      router.push("/");
                      router.refresh();
                    } else router.refresh();
                  })
                }
              >
                Завершить
              </button>
            </li>
          ))}
        </ul>
      </section>
      {notice && <p role="status">{notice}</p>}
      <Feedback task={task} />
    </div>
  );
}
