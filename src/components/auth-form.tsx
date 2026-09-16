"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ShieldCheck, BookmarkCheck } from "lucide-react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function AuthForm({
  register = false,
  staff = false,
  next = "/my",
}: {
  register?: boolean;
  staff?: boolean;
  next?: string;
}) {
  const [mode, setMode] = useState(register ? "register" : "login");
  const task = useTask();
  const router = useRouter();
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
            : "Сохрани работу, возвращайся к своим идеям и выбирай следующий шаг."}
        </p>
        <p className="inline subtle">
          {staff ? <ShieldCheck size={19} /> : <BookmarkCheck size={19} />}{" "}
          {staff
            ? "Вход для сотрудников комиссии"
            : "Гостевая работа перенесётся в аккаунт."}
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
              const res = await action<{ role: string }>(mode, {
                email: form.get("email"),
                password: form.get("password"),
                ...(mode === "register" ? { name: form.get("name") } : {}),
              });
              router.push(res.role === "STAFF" ? "/admissions" : next);
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
            Электронная почта
            <input
              name="email"
              type="email"
              autoComplete="email"
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
            <ArrowUpRight size={19} />
          </button>
        </form>
        <Feedback task={task} />
      </div>
    </div>
  );
}
