"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { money, openaiMessages } from "@/lib/openai-policy";
import { sections } from "@/lib/review-contract";
import {
  type DeskDraft,
  type DeskResult,
  type DeskSettings,
} from "@/lib/vision-desk-contract";
import type { DeskView, deskQueue } from "@/lib/vision-desk.server";
import { Feedback, useTask } from "./ui";
type Queue = Awaited<ReturnType<typeof deskQueue>>;
export function VisionDeskQueue({
  initial,
  candidates,
}: {
  initial: Queue;
  candidates: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"batch" | "events" | null>(null);
  const [config, setConfig] = useState(initial.config),
    [confirm, setConfirm] = useState(false),
    [chosen, setChosen] = useState<string[]>([]),
    [preview, setPreview] = useState<{
      signature: string;
      estimatedMicros: number;
      operations: number;
    } | null>(null);
  const task = useTask(),
    router = useRouter();
  function setting(k: keyof DeskSettings, value: unknown) {
    setConfig((c) => ({ ...c, [k]: value }));
    setConfirm(false);
    setPreview(null);
  }
  return (
    <section className="desk-queue" aria-label="Vision Desk">
      <div className="desk-queue-header">
        <div>
          <p className="eyebrow">Vision Desk</p>
          <h2>
            {initial.runs.length
              ? "Подготовлено для вас"
              : "Подготовить материалы"}
          </h2>
          <p>
            Сводка источников и вопросы к интервью. Выберите заявки и проверьте
            запуск.
          </p>
        </div>
        <div className="desk-queue-actions">
          <button
            className="button secondary"
            aria-expanded={mode === "batch"}
            aria-controls="desk-queue-controls"
            onClick={() => setMode(mode === "batch" ? null : "batch")}
          >
            Подготовить заявки
          </button>
          <button
            className="button text"
            aria-expanded={mode === "events"}
            aria-controls="desk-queue-controls"
            onClick={() => setMode(mode === "events" ? null : "events")}
          >
            Подготовка по событиям
          </button>
        </div>
      </div>
      {initial.runs.length > 0 && (
        <ul className="desk-prepared">
          {initial.runs.slice(0, 4).map((r) => (
            <li key={r.id}>
              <Link
                href={`/admissions/candidates/${r.applicationId}#vision-desk`}
              >
                {r.name}
              </Link>
              <span>
                {r.status === "COMPLETED"
                  ? "Подготовка сохранена"
                  : r.status === "FAILED"
                    ? "Нужно проверить подготовку"
                    : "В очереди подготовки"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        id="desk-queue-controls"
        hidden={!mode}
        className="desk-queue-controls"
      >
        <h3>
          {mode === "batch"
            ? "Какие заявки подготовить?"
            : "Когда готовить материалы?"}
        </h3>
        <p>
          {mode === "batch"
            ? "Выберите до пяти кандидатов в списке ниже. Перед запуском вы увидите число операций и расходы."
            : "Включите нужные события. Подготовка будет запускаться только для новых событий после сохранения настроек."}
        </p>
        <p className="desk-operation-note">
          Vision Desk читает доступную заявку, источники, заключения, задачи и
          встречи, затем сохраняет свои черновики. Отправку сообщений и
          изменение планов подтверждает сотрудник.
        </p>
        <label>
          Способ подготовки
          <select
            value={config.provider}
            onChange={(e) => setting("provider", e.target.value)}
          >
            <option value="local">Фактическая подготовка</option>
            <option value="openai" disabled={!initial.externalAllowed}>
              Подготовка с OpenAI
            </option>
          </select>
        </label>
        <p>
          {config.provider === "local"
            ? "Сводка по сохранённым источникам. Расход на подготовку: 0."
            : `Одна текстовая операция на событие. Общий рабочий лимит ${money(initial.limitMicros)}, дневной ${money(initial.dailyMicros)}. Нужны отдельное согласие кандидата и разрешённые источники.`}
        </p>
        {mode === "events" && (
          <>
            {(
              [
                ["submitted", "Новые отправленные заявки"],
                ["clarification", "Новый ответ на уточнение"],
                ["interview", "Назначенное интервью"],
              ] as const
            ).map(([k, label]) => (
              <label className="check-row" key={k}>
                <input
                  type="checkbox"
                  checked={config[k]}
                  onChange={(e) => setting(k, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <label className="check-row">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              Подтверждаю перечисленные операции и использование выбранного
              бюджета для новых событий
            </label>
            <button
              className="button secondary"
              disabled={!confirm || task.busy}
              onClick={() =>
                task.run(async () => {
                  const c = await action<DeskSettings>("desk.settings", {
                    settings: {
                      provider: config.provider,
                      submitted: config.submitted,
                      clarification: config.clarification,
                      interview: config.interview,
                    },
                    revision: config.revision,
                    confirm,
                  });
                  setConfig(c);
                  setConfirm(false);
                  router.refresh();
                }, "Настройки новых событий сохранены.")
              }
            >
              Сохранить автоподготовку
            </button>
          </>
        )}
        {mode === "batch" && (
          <>
            <p className="desk-selection-count" aria-live="polite">
              Выбрано: {chosen.length} из 5
            </p>
            <div className="desk-batch-list">
              {candidates.map((c) => (
                <label className="check-row" key={c.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    disabled={!chosen.includes(c.id) && chosen.length >= 5}
                    onChange={(e) => {
                      setChosen((x) =>
                        e.target.checked
                          ? [...x, c.id]
                          : x.filter((id) => id !== c.id),
                      );
                      setPreview(null);
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <button
              className="button secondary"
              disabled={!chosen.length || task.busy}
              onClick={() =>
                task.run(async () =>
                  setPreview(
                    await action("desk.batchPreview", {
                      applicationIds: chosen,
                      provider: config.provider,
                    }),
                  ),
                )
              }
            >
              Предпросмотр запуска
            </button>
            {preview && (
              <aside className="notice info">
                <p>
                  Заявок: {chosen.length}. Операций: {preview.operations}.
                  Верхняя оценка резервирования:{" "}
                  {money(preview.estimatedMicros)}. Повтор уже подготовленной
                  версии не создаёт новый запрос.
                </p>
                <button
                  className="button dark"
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await action("desk.batch", {
                        applicationIds: chosen,
                        provider: config.provider,
                        signature: preview.signature,
                        confirm: true,
                      });
                      setPreview(null);
                      router.refresh();
                    }, "Подготовка поставлена в очередь.")
                  }
                >
                  Подтвердить подготовку выбранных
                </button>
              </aside>
            )}
          </>
        )}
        <Feedback task={task} />
      </div>
    </section>
  );
}
export function VisionDesk({
  applicationId,
  onSource,
  onFeedback,
}: {
  applicationId: string;
  onSource: (id: string) => void;
  onFeedback: (feedback: DeskResult["feedback"]) => void;
}) {
  const [view, setView] = useState<DeskView>({ runs: [] }),
    [opened, setOpened] = useState(false),
    [provider, setProvider] = useState<"local" | "openai">("local"),
    [draft, setDraft] = useState<DeskDraft | null>(null),
    [preview, setPreview] = useState<{
      id: string;
      digest: string;
      recipient: string;
      content: DeskDraft;
      expiresAt: string;
    } | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [section, setSection] = useState("summary");
  const task = useTask(),
    router = useRouter();
  const current = view.runs.find((r) => r.current && r.status === "COMPLETED"),
    result = current?.result;
  async function load() {
    setView(await action("desk.view", { applicationId }));
  }
  const latestRunId = view.runs[0]?.id;
  useEffect(() => {
    if (!opened) return;
    let active = true,
      count = 0;
    const timer = setInterval(() => {
      if (count++ >= 15) {
        clearInterval(timer);
        return;
      }
      void action<DeskView>("desk.view", { applicationId })
        .then((v) => {
          if (active) setView(v);
          if (v.runs.every((r) => !["QUEUED", "RUNNING"].includes(r.status)))
            clearInterval(timer);
        })
        .catch(() => clearInterval(timer));
    }, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [opened, applicationId, latestRunId]);
  function chooseDraft(d: DeskDraft) {
    setDraft(d);
    setPreview(null);
    setConfirmed(false);
  }
  return (
    <details
      className="vision-desk"
      id="vision-desk"
      open={opened}
      onToggle={(e) => {
        setOpened(e.currentTarget.open);
        if (e.currentTarget.open && !opened) void task.run(load);
      }}
    >
      <summary>
        <strong>Vision Desk</strong>
        <span>Основания, рабочие вопросы и подготовка</span>
      </summary>
      <div className="desk-toolbar">
        <label>
          Подготовка
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
          >
            <option value="local">Фактическая</option>
            <option value="openai">С OpenAI по разрешению</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              await action("desk.prepare", { applicationId, provider });
              await load();
            })
          }
        >
          Подготовить актуальную сводку
        </button>
        <button
          className="text-link"
          disabled={task.busy}
          onClick={() => task.run(load)}
        >
          Обновить состояние
        </button>
      </div>
      <p>
        Помощник работает с материалами рассмотрения. Личные проекты, дерево
        развития и разговоры кандидата сюда не передаются.
      </p>
      {view.runs[0] &&
        !view.runs[0].current &&
        view.runs[0].status === "COMPLETED" && (
          <p className="notice warning">
            Материалы изменились. Предыдущая подготовка сохранена в истории и
            требует обновления.
          </p>
        )}
      {view.runs
        .filter((r) => ["QUEUED", "RUNNING", "FAILED"].includes(r.status))
        .slice(0, 1)
        .map((r) => (
          <p key={r.id} role="status">
            {r.status === "FAILED"
              ? (openaiMessages[r.errorCode ?? ""] ??
                "Подготовка не завершена: проверьте источники, разрешение и актуальность.")
              : "Подготовка выполняется в серверной очереди."}
            {r.status === "FAILED" && r.attempts < 2 && (
              <button
                className="text-link"
                onClick={() =>
                  task.run(async () => {
                    await action("desk.retry", { runId: r.id });
                    await load();
                  })
                }
              >
                Повторить подготовку
              </button>
            )}
          </p>
        ))}
      {result && current && (
        <>
          <nav className="desk-shortcuts" aria-label="Действия Vision Desk">
            <button
              className="button secondary"
              onClick={() => {
                setSection("questions");
                chooseDraft({ kind: "ATOLA", questions: result.questions });
              }}
            >
              Подготовить интервью
            </button>
            <button
              className="button secondary"
              onClick={() => setSection("changes")}
            >
              Что изменилось?
            </button>
            <button
              className="button secondary"
              disabled={!result.clarification}
              onClick={() => {
                setSection("question");
                chooseDraft({
                  kind: "QUESTION",
                  body: result.clarification,
                  sourceIds: result.grounds.map((g) => g.sourceId),
                });
              }}
            >
              Составить вопрос
            </button>
            <button
              className="button secondary"
              onClick={() => setSection("grounds")}
            >
              Объяснить основание
            </button>
          </nav>
          {(section === "summary" || section === "grounds") && (
            <>
              <p>{result.summary}</p>
              {result.grounds.map((g) => (
                <blockquote key={g.key}>
                  <p>{g.quote}</p>
                  <footer>
                    {g.origin}.{" "}
                    <button
                      className="text-link"
                      onClick={() => onSource(g.sourceId)}
                    >
                      {g.title} · источник этой версии
                    </button>
                  </footer>
                </blockquote>
              ))}
              {result.human.map((h) => (
                <details key={h.key}>
                  <summary>{h.title}</summary>
                  <p>{h.origin}</p>
                  <p>{h.text}</p>
                  {h.sourceIds.map((id) => (
                    <button
                      key={id}
                      className="text-link"
                      onClick={() => onSource(id)}
                    >
                      Открыть основание заключения
                    </button>
                  ))}
                </details>
              ))}
              {result.tasks.length > 0 && (
                <ul>
                  {result.tasks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {section === "changes" && (
            <ul>
              {(result.changes.length
                ? result.changes
                : ["Более ранней подготовки по этой заявке нет."]
              ).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {draft && ["question", "questions"].includes(section) && (
            <section className="desk-draft">
              <h3>
                {draft.kind === "QUESTION"
                  ? "Черновик уточнения"
                  : "Вопросы для существующего плана ATOLA"}
              </h3>
              {draft.kind === "QUESTION" ? (
                <label>
                  Сообщение кандидату
                  <textarea
                    rows={4}
                    value={draft.body}
                    onChange={(e) =>
                      chooseDraft({ ...draft, body: e.target.value })
                    }
                  />
                </label>
              ) : (
                draft.questions.map((q, i) => (
                  <label key={q.id}>
                    {sections.find((s) => s.key === q.section)?.title}
                    <textarea
                      rows={2}
                      value={q.text}
                      onChange={(e) =>
                        chooseDraft({
                          ...draft,
                          questions: draft.questions.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))
              )}
              <p>
                Основание:{" "}
                {result.grounds.map((g) => (
                  <button
                    key={g.key}
                    className="text-link"
                    onClick={() => onSource(g.sourceId)}
                  >
                    {g.title}
                  </button>
                ))}
              </p>
              <button
                className="button secondary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    setPreview(
                      await action("desk.preview", {
                        runId: current.id,
                        content: draft,
                      }),
                    );
                    setConfirmed(false);
                  })
                }
              >
                Предпросмотр действия
              </button>
              {preview && (
                <aside className="desk-preview">
                  <h3>
                    {draft.kind === "QUESTION"
                      ? `Получатель: ${preview.recipient}`
                      : `План интервью: ${preview.recipient}`}
                  </h3>
                  {preview.content.kind === "QUESTION" ? (
                    <p>{preview.content.body}</p>
                  ) : (
                    <ol>
                      {preview.content.questions.map((q) => (
                        <li key={q.id}>{q.text}</li>
                      ))}
                    </ol>
                  )}
                  <p>
                    Подтверждение действует до {dateLabel(preview.expiresAt)}.
                    Изменение текста или материалов потребует нового
                    предпросмотра.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {draft.kind === "QUESTION"
                      ? "Подтверждаю отправку этого вопроса этому кандидату"
                      : "Подтверждаю добавление этих вопросов без изменения существующих заметок"}
                  </label>
                  <button
                    className="button dark"
                    disabled={!confirmed || task.busy}
                    onClick={() =>
                      task.run(async () => {
                        const r = await action<{ href?: string }>(
                          "desk.confirm",
                          {
                            id: preview.id,
                            digest: preview.digest,
                            content: draft,
                            confirm: true,
                          },
                        );
                        setPreview(null);
                        setDraft(null);
                        setSection("summary");
                        await load();
                        router.refresh();
                        if (r.href) window.location.assign(r.href);
                      }, "Подтверждённое действие выполнено.")
                    }
                  >
                    {draft.kind === "QUESTION"
                      ? "Отправить вопрос в приложении"
                      : "Добавить вопросы в ATOLA"}
                  </button>
                </aside>
              )}
            </section>
          )}
          <details>
            <summary>Черновик обратной связи</summary>
            <p>{result.feedback.observation}</p>
            <p>{result.feedback.suggestion}</p>
            <p>{result.feedback.nextAction}</p>
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () =>
                  onFeedback(
                    await action("desk.feedback", { runId: current.id }),
                  ),
                )
              }
            >
              Перенести в редактор обратной связи
            </button>
            <p>
              Редактирование, предпросмотр и публикация выполняются в
              существующем разделе решения.
            </p>
          </details>
          <details>
            <summary>Выполненные операции</summary>
            <ol>
              {result.operations.map((o) => (
                <li key={o.tool}>{o.result}</li>
              ))}
            </ol>
          </details>
        </>
      )}
      <Feedback task={task} />
      <details>
        <summary>История подготовки · {view.runs.length}</summary>
        {view.runs.map((r) => (
          <article key={r.id}>
            <p>
              {dateLabel(r.createdAt)} ·{" "}
              {r.current ? "Текущие материалы" : "Другая версия материалов"}
            </p>
            {r.result ? (
              <p>{r.result.summary}</p>
            ) : (
              <p>Содержимое недоступно или подготовка не завершена.</p>
            )}
          </article>
        ))}
      </details>
    </details>
  );
}
