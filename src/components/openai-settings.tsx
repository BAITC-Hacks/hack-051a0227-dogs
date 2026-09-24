"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionView } from "@/lib/openai-settings.server";
import {
  money,
  taskNames,
  textModels,
  transcriptionModels,
  speechModels,
  openaiMessages,
  type OpenAITask,
} from "@/lib/openai-policy";

async function send(body: unknown) {
  let response: Response;
  try {
    response = await fetch("/api/settings/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Связь прервалась. Обновите состояние перед повтором; введённые настройки остались в форме.",
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error ?? "Не удалось выполнить действие. Повторите позже.",
    );
  }
  return response;
}
export function OwnerSetup() {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="review-section owner-setup">
      <h2>Подтвердите доступ к компьютеру</h2>
      <p>
        Для владельца нужен отдельный личный аккаунт. Общий вход комиссии не
        даёт права управлять подключением.
      </p>
      <p>
        Код появится в системном окне на этом Mac. Он не отправляется по почте.
        Не вводите код, если вы не начинали настройку. Запишите код и нажмите
        «Закрыть» в системном окне, затем введите его здесь.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send({ action: "setup.begin", email });
            setSent(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Email нового владельца
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSent(false);
            }}
            required
            maxLength={150}
          />
        </label>
        <button className="button primary" disabled={busy || sent}>
          {busy && !sent
            ? "Ожидаем закрытия системного окна…"
            : "Показать код на компьютере"}
        </button>
      </form>
      {sent && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              fields = new FormData(form);
            setBusy(true);
            setError("");
            try {
              await send({
                action: "setup.complete",
                owner: {
                  email,
                  name: fields.get("name"),
                  password: fields.get("password"),
                  code: String(fields.get("code")).trim().toUpperCase(),
                },
              });
              form.reset();
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="notice">
            Откройте системное окно «inVision U: владелец подключения». Код
            действует 3 минуты, доступно 5 попыток.
          </p>
          <label className="field">
            Ваше имя
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            Новый пароль владельца
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <span>Не менее 12 символов. Используйте личный пароль.</span>
          </label>
          <label className="field">
            Код из системного окна
            <input
              name="code"
              autoComplete="one-time-code"
              minLength={12}
              maxLength={12}
              required
              spellCheck={false}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Создать аккаунт владельца
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => setSent(false)}
          >
            Запросить другой код
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function editable(v: ConnectionView) {
  return {
    textModel: v.textModel,
    complexModel: v.complexModel,
    transcriptionModel: v.transcriptionModel,
    speechModel: v.speechModel,
    audioEnabled: v.audioEnabled,
    deskEnabled: v.deskEnabled,
    starting: String(v.startingMicros / 1e6),
    limit: String(v.limitMicros / 1e6),
    reserve: String(v.reserveMicros / 1e6),
    daily: String(v.dailyMicros / 1e6),
    parallelLimit: v.parallelLimit,
  };
}
export function OpenAISettings({ initial }: { initial: ConnectionView }) {
  const router = useRouter();
  const [view, setView] = useState(initial),
    [settings, setSettings] = useState(editable(initial));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editingKey, setEditingKey] = useState(!initial.connected),
    [disconnect, setDisconnect] = useState(false),
    [probe, setProbe] = useState<OpenAITask | null>(null);
  const [result, setResult] = useState(""),
    [audio, setAudio] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(editable(view));
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  async function refresh() {
    const r = await fetch("/api/settings/openai", { cache: "no-store" });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) router.replace("/settings");
      throw new Error("Не удалось обновить состояние. Повторите обновление.");
    }
    const v: ConnectionView = await r.json();
    setView(v);
    return v;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const lists = {
    text: textModels,
    complex: textModels,
    transcription: transcriptionModels,
    speech: speechModels,
  };
  const fields = {
    text: "textModel",
    complex: "complexModel",
    transcription: "transcriptionModel",
    speech: "speechModel",
  } as const;
  return (
    <div className="openai-sections" aria-busy={busy}>
      <div aria-live="polite">
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <section className="review-section">
        <div className="connection-heading">
          <h2>Подключение</h2>
          <span className="tag">
            {view.connected
              ? `Ключ сохранён · ••••${view.suffix}`
              : "Ключ не сохранён"}
          </span>
        </div>
        <p>
          Ключ доступен только серверу на этом компьютере. После сохранения поле
          очищается; получить ключ обратно через приложение нельзя.
        </p>
        {editingKey ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                try {
                  await send({
                    action: "key.save",
                    key: keyInput.current?.value,
                    revision: view.revision,
                  });
                  await refresh();
                  setEditingKey(false);
                  setNotice(
                    "Ключ сохранён. Теперь можно проверить подключение.",
                  );
                } finally {
                  if (keyInput.current) keyInput.current.value = "";
                }
              });
            }}
          >
            <label className="field">
              Ключ OpenAI
              <input
                ref={keyInput}
                type="password"
                name="openai-secret"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                minLength={20}
                maxLength={512}
                required
                placeholder="sk-…"
              />
            </label>
            <div className="button-row">
              <button className="button primary" disabled={busy}>
                Сохранить
              </button>
              {view.connected && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingKey(false)}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await send({ action: "check", revision: view.revision });
                  await refresh();
                  setNotice(
                    "Ключ принят. Доступные модели обновлены. Для проверки операций используйте отдельные кнопки ниже.",
                  );
                })
              }
            >
              Проверить подключение
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setEditingKey(true)}
            >
              Заменить ключ
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDisconnect(true)}
            >
              Отключить
            </button>
          </div>
        )}
        {view.checkedAt && (
          <p className="subtle">
            Проверка {new Date(view.checkedAt).toLocaleString("ru-RU")}:{" "}
            {view.checkCode === "OK"
              ? "ключ принят, список моделей получен"
              : (openaiMessages[view.checkCode ?? ""] ??
                "проверка не завершена")}
            .
          </p>
        )}
        {disconnect && (
          <div className="connection-confirm">
            <p>
              Удалить сохранённый ключ и выключить обработку? Уже отправленный
              запрос может завершиться. Работы, заявки и история расходов
              сохранятся.
            </p>
            <div className="button-row">
              <button
                className="button dark"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await send({
                      action: "disconnect",
                      revision: view.revision,
                    });
                    const v = await refresh();
                    setSettings(editable(v));
                    setDisconnect(false);
                    setEditingKey(true);
                    setResult("");
                    setAudio("");
                    setNotice(
                      "Подключение отключено. Сохранённый ключ удалён.",
                    );
                  })
                }
              >
                Подтвердить отключение
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setDisconnect(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await send({
              action: "settings.save",
              revision: view.revision,
              settings: {
                textModel: settings.textModel,
                complexModel: settings.complexModel,
                transcriptionModel: settings.transcriptionModel,
                speechModel: settings.speechModel,
                audioEnabled: settings.audioEnabled,
                deskEnabled: settings.deskEnabled,
                startingMicros: Math.round(Number(settings.starting) * 1e6),
                limitMicros: Math.round(Number(settings.limit) * 1e6),
                reserveMicros: Math.round(Number(settings.reserve) * 1e6),
                dailyMicros: Math.round(Number(settings.daily) * 1e6),
                parallelLimit: settings.parallelLimit,
              },
            });
            const v = await refresh();
            setSettings(editable(v));
            setNotice(
              "Модели и лимиты сохранены. Новые запросы используют эти настройки.",
            );
          });
        }}
      >
        <section className="review-section">
          <h2>Модели и разрешённые задачи</h2>
          <div className="connection-models">
            {(Object.keys(taskNames) as OpenAITask[]).map((task) => (
              <label key={task} className="field">
                {taskNames[task]}
                <select
                  value={settings[fields[task]]}
                  onChange={(e) =>
                    setSettings({ ...settings, [fields[task]]: e.target.value })
                  }
                >
                  {lists[task].map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                {view.catalog && (
                  <span>
                    {view.catalog.includes(settings[fields[task]])
                      ? "Есть в списке аккаунта. Операция проверяется отдельно."
                      : `Нет в полученном списке. Доступная замена: ${lists[task].filter((m) => view.catalog?.includes(m)).join(", ") || "не найдена среди поддерживаемых моделей"}.`}
                  </span>
                )}
              </label>
            ))}
          </div>
          <label className="connection-toggle">
            <input
              type="checkbox"
              checked={settings.audioEnabled}
              onChange={(e) =>
                setSettings({ ...settings, audioEnabled: e.target.checked })
              }
            />
            Разрешить расшифровку и сводку языковых ответов
          </label>
          <p>
            Кандидат отдельно разрешает обработку и сам запускает её для
            выбранных ответов. Перед каждым запросом проверяются согласие и
            актуальность материалов. Подключение не отправляет всю базу и не
            переключает AI-скоринг, Fairness Twin или личный профиль.
          </p>
        </section>
        <section className="review-section">
          <label className="connection-toggle"><input type="checkbox" checked={settings.deskEnabled} onChange={e=>setSettings({...settings,deskEnabled:e.target.checked})}/>Разрешить внешнюю фактическую подготовку Vision Desk</label>
          <p>Только выбранные кандидатом источники по отдельному согласию. Автоподготовку сотрудник включает отдельно; действуют общие лимиты расходов.</p>
          <h2>Бюджет приложения</h2>
          <div className="connection-totals">
            <div>
              <span>Расходы приложения, включая резерв запросов</span>
              <strong>{money(view.spentMicros)}</strong>
            </div>
            <div>
              <span>Доступно по лимиту</span>
              <strong>
                {money(
                  Math.max(
                    0,
                    Math.min(
                      view.limitMicros,
                      view.startingMicros - view.reserveMicros,
                    ) - view.spentMicros,
                  ),
                )}
              </strong>
            </div>
            <div>
              <span>Сегодня · день по UTC</span>
              <strong>
                {money(view.todayMicros)} / {money(view.dailyMicros)}
              </strong>
            </div>
          </div>
          <p>
            Исходная сумма внесена вручную. Это не баланс аккаунта OpenAI:
            другие приложения и расходы аккаунта здесь не учитываются. В
            обработке зарезервировано {money(view.heldMicros)}.
          </p>
          <div className="connection-models">
            {(
              [
                ["starting", "Исходная сумма, $"],
                ["limit", "Рабочий лимит, $"],
                ["reserve", "Резерв аккаунта, $"],
                ["daily", "Дневной лимит, $"],
              ] as const
            ).map(([field, label]) => (
              <label className="field" key={field}>
                {label}
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  value={settings[field]}
                  required
                  onChange={(e) =>
                    setSettings({ ...settings, [field]: e.target.value })
                  }
                />
              </label>
            ))}
            <label className="field">
              Одновременных запросов
              <select
                value={settings.parallelLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    parallelLimit: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p>
            Перед каждым вызовом резервируется консервативная оценка стоимости.
            По данным OpenAI расход рассчитывается по тарифам; при
            неопределённом ответе сохраняется оценка. Автоматической замены на
            более дорогую модель нет.
          </p>
          <button className="button primary" disabled={busy || !dirty}>
            Сохранить модели и лимиты
          </button>
          {dirty && <p className="subtle">Есть несохранённые изменения.</p>}
        </section>
      </form>
      <section className="review-section">
        <h2>Проверка операций</h2>
        <p>
          Каждая кнопка запускает одну короткую платную пробу после
          подтверждения. Используются только контрольная фраза или готовая
          запись без данных кандидатов.
        </p>
        <div className="button-row">
          {(Object.keys(taskNames) as OpenAITask[]).map((task) => (
            <button
              key={task}
              className="button secondary"
              disabled={busy || !view.connected || dirty}
              onClick={() => {
                setProbe(task);
                setResult("");
                setAudio("");
              }}
            >
              {taskNames[task]}
            </button>
          ))}
        </div>
        {dirty && (
          <p>Сначала сохраните настройки, чтобы проверить выбранные модели.</p>
        )}
        {probe && (
          <div className="connection-confirm">
            <h3>
              {taskNames[probe]} · {view[fields[probe]]}
            </h3>
            <p>
              Запрос будет отправлен в OpenAI. Резерв не более $0.10, в пределах
              ваших лимитов. Проверка не подтверждает качество оценки
              кандидатов.
            </p>
            <div className="button-row">
              <button
                className="button primary"
                disabled={busy || dirty}
                onClick={() =>
                  void run(async () => {
                    const response = await send({
                      action: "probe",
                      task: probe,
                      confirmPaid: true,
                      requestKey: crypto.randomUUID(),
                      revision: view.revision,
                    });
                    if (probe === "speech")
                      setAudio(URL.createObjectURL(await response.blob()));
                    else setResult((await response.json()).text);
                    await refresh();
                    setNotice(
                      "Операция завершена. Результат OpenAI показан ниже.",
                    );
                    setProbe(null);
                  })
                }
              >
                Запустить платную проверку
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setProbe(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
        {result && (
          <blockquote className="connection-result">{result}</blockquote>
        )}
        {audio && (
          <div className="connection-result">
            <p>Проверочная речь создана AI.</p>
            <audio controls src={audio} />
          </div>
        )}
      </section>
      <section className="review-section">
        <div className="connection-heading">
          <h2>Последние запросы</h2>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
                setNotice("Расходы обновлены.");
              })
            }
          >
            Обновить расходы
          </button>
        </div>
        {view.calls.length ? (
          <ul className="connection-calls">
            {view.calls.map((call) => (
              <li key={call.id}>
                <div>
                  <strong>
                    {taskNames[call.task as OpenAITask] ?? "Запрос"}
                  </strong>
                  <span>
                    {call.model} ·{" "}
                    {new Date(call.createdAt).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div>
                  {call.status === "RESERVED"
                    ? "Выполняется"
                    : call.status === "SUCCEEDED"
                      ? "Ответ получен"
                      : call.status === "UNKNOWN"
                        ? "Результат не подтверждён"
                        : "Не выполнен"}
                  <span>
                    {money(call.chargedMicros)} ·{" "}
                    {call.costBasis === "USAGE"
                      ? "по данным OpenAI"
                      : call.costBasis === "NOT_SENT_OR_REJECTED"
                        ? "не отправлен или отклонён"
                        : "оценка"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>Платных запросов ещё не было.</p>
        )}
      </section>
    </div>
  );
}
