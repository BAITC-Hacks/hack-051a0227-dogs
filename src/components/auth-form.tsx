"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, BookmarkCheck } from "lucide-react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
export function AuthForm({
  register = false,
  staff = false,
  next = "",
}: {
  register?: boolean;
  staff?: boolean;
  next?: string;
}) {
  const [mode, setMode] = useState(register ? "register" : "login");
  const task = useTask();
  const router = useRouter();
  const [deviceMessage, setDeviceMessage] = useState("");
  return (
    <div className="wrap auth-layout">
      <div className="auth-story">
        <h1>
          {staff ? (
            <>
              Внимание
              <br />к каждому
              <br />
              кандидату.
            </>
          ) : (
            <>
              Твой путь
              <br />
              остаётся
              <br />с тобой.
            </>
          )}
        </h1>
        <p>
          {staff
            ? "Источники, содержательные вопросы и решения, за которыми стоит человек."
            : "Заполни заявку, сохрани материалы и следи за следующими этапами поступления."}
        </p>
        <p className="inline subtle">
          {staff ? <ShieldCheck size={19} /> : <BookmarkCheck size={19} />}{" "}
          {staff
            ? "Вход для сотрудников комиссии"
            : "Прежние гостевые работы останутся с тобой после входа."}
        </p>
      </div>
      <div className="auth-form">
        {!staff && (
          <div className="tabs" role="tablist" aria-label="Аккаунт">
            <button
              className="tab"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => setMode("register")}
            >
              Создать аккаунт
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => setMode("login")}
            >
              Уже есть аккаунт
            </button>
          </div>
        )}
        <h2>
          {staff
            ? "Вход в комиссию"
            : mode === "register"
              ? "Продолжим знакомство"
              : "С возвращением"}
        </h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            task.run(async () => {
              const res = await action<{ role: string; destination: string }>(
                mode,
                {
                  ...(mode === "register"
                    ? { email: form.get("identifier") }
                    : { identifier: form.get("identifier") }),
                  password: form.get("password"),
                  returnTo: next,
                  ...(mode === "register" ? { name: form.get("name") } : {}),
                },
              );
              router.push(res.destination);
              router.refresh();
            });
          }}
        >
          {mode === "register" && (
            <label className="field">
              Имя и фамилия
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={160}
              />
            </label>
          )}
          <label className="field">
            {mode === "register"
              ? "Электронная почта"
              : "Email, телефон или ID кандидата"}
            <input
              name="identifier"
              type={mode === "register" ? "email" : "text"}
              autoComplete={mode === "register" ? "email" : "username webauthn"}
              required
              maxLength={160}
            />
          </label>
          <label className="field">
            Пароль
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              minLength={10}
              maxLength={128}
            />
            {mode === "register" && <small>Не меньше 10 символов.</small>}
          </label>
          <button className="button primary" disabled={task.busy}>
            {mode === "register" ? "Создать аккаунт" : "Войти"}
          </button>
        </form>
        {mode === "login" && (
          <div className="auth-alternatives">
            <button
              className="button secondary"
              type="button"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  setDeviceMessage("");
                  if (!window.PublicKeyCredential) {
                    setDeviceMessage(
                      "Этот браузер не поддерживает вход с устройства. Используй пароль.",
                    );
                    return;
                  }
                  const options =
                    await action<PublicKeyCredentialRequestOptionsJSON>(
                      "passkey.login.begin",
                    );
                  try {
                    const response = await startAuthentication({
                      optionsJSON: options,
                    });
                    const result = await action<{ destination: string }>(
                      "passkey.login.finish",
                      { response, returnTo: next },
                    );
                    router.push(result.destination);
                    router.refresh();
                  } catch (e) {
                    if (
                      e instanceof Error &&
                      ["NotAllowedError", "AbortError"].includes(e.name)
                    ) {
                      setDeviceMessage(
                        "Вход с устройства отменён. Можно войти по паролю.",
                      );
                      return;
                    }
                    throw e;
                  }
                })
              }
            >
              Войти с устройства
            </button>
            <p>
              Телефон может предложить системный вход с passkey. QR показывает
              браузер, если устройство поддерживает этот способ.
            </p>
            <a
              href="mailto:info@invisionu.education?subject=Доступ%20к%20аккаунту%20AI%20Leader%20ID"
              className="text-link"
            >
              Нужна помощь со входом?
            </a>
          </div>
        )}
        {deviceMessage && <p role="status">{deviceMessage}</p>}
        <Feedback task={task} />
      </div>
    </div>
  );
}
