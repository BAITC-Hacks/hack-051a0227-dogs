"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AttemptVersion } from "@prisma/client";
import { action, ActionError } from "@/lib/client";
import { programFor } from "@/lib/catalog";
import { initialState } from "@/lib/projects";
import {
  initialMission,
  missions,
  readMission,
  samePlan,
  type Mission,
  type MissionCommand,
  type MissionPlan,
} from "@/lib/missions";
import { type Work, type Milestone, workHref } from "@/lib/journey";
import { Feedback, useTask } from "./ui";
import { WorkResult } from "./work-result";
import { MissionArtifact, MissionRobot } from "./mission-visual";
import { ContextStart, MilestoneMarks } from "./journey-actions";
import { InteractiveProfile } from "./interactive-profile";

export function MissionEditor({
  slug,
  attempt,
  authenticated,
  milestones: initialMarks,
  selectedRevision,
  fromRevision,
}: {
  slug: string;
  attempt: Work | null;
  authenticated: boolean;
  milestones: Milestone[];
  selectedRevision?: number;
  fromRevision?: number;
}) {
  const d = missions[slug],
    p = programFor(slug)!,
    task = useTask();
  const original = readMission(attempt?.state) ?? initialMission(slug);
  const [mission, setMission] = useState<Mission>(() => ({
    ...original,
    plan:
      readMission(
        attempt?.versions.find((v) => v.revision === fromRevision)?.state,
      )?.plan ?? original.plan,
  }));
  const [saved, setSaved] = useState(original),
    [id, setId] = useState(attempt?.id ?? ""),
    [revision, setRevision] = useState(attempt?.revision ?? 0),
    [versions, setVersions] = useState(attempt?.versions ?? []),
    [marks, setMarks] = useState(initialMarks),
    [resultRevision, setResultRevision] = useState(
      selectedRevision ?? attempt?.revision ?? 0,
    ),
    [conflict, setConflict] = useState(false);
  const [view, setView] = useState(
    selectedRevision !== undefined ? "result" : "work",
  );
  const [sceneQuestions, setSceneQuestions] = useState<Record<string, string>>(
      {},
    ),
    [sceneBusy, setSceneBusy] = useState(false),
    [sceneError, setSceneError] = useState("");
  const sceneAbort = useRef<AbortController | null>(null);
  useEffect(() => () => sceneAbort.current?.abort(), []);
  async function discuss(role: string) {
    setSceneBusy(true);
    setSceneError("");
    const controller = new AbortController();
    sceneAbort.current = controller;
    try {
      const response = await fetch("/api/vision/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          attemptId: id,
          revision,
          role,
          question: sceneQuestions[role],
          requestKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await save({ kind: "dialogue", role, replyId: result.data.replyId });
    } catch (e) {
      setSceneError(
        controller.signal.aborted
          ? "Вопрос остановлен. Текст остался в поле."
          : e instanceof Error
            ? e.message
            : "Ответ не получен.",
      );
    } finally {
      setSceneBusy(false);
    }
  }
  const request = useRef({ signature: "", key: "" }),
    ownerReady = useRef(!!attempt),
    lock = useRef(false),
    resultHeading = useRef<HTMLHeadingElement>(null);
  const dirty = !samePlan(mission.plan, saved.plan) || !id;
  useEffect(() => {
    if (task.error) document.getElementById("mission-operation")?.focus();
  }, [task.error]);
  useEffect(() => {
    if (samePlan(mission.plan, saved.plan)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mission.plan, saved.plan]);
  function update<K extends keyof MissionPlan>(key: K, value: MissionPlan[K]) {
    setMission((m) => ({ ...m, plan: { ...m.plan, [key]: value } }));
    task.setNotice("");
  }
  async function save(command?: MissionCommand) {
    if (lock.current) return;
    lock.current = true;
    await task.run(
      async () => {
        if (!ownerReady.current) {
          await action("project.progress");
          ownerReady.current = true;
        }
        const state = { ...initialState, mission },
          signature = JSON.stringify({ id, revision, state, command });
        if (request.current.signature !== signature)
          request.current = { signature, key: crypto.randomUUID() };
        const res = await action<{
          id: string;
          revision: number;
          state: unknown;
          versions: AttemptVersion[];
          milestones: Milestone[];
        }>("project.save", {
          id: id || undefined,
          slug,
          state,
          revision,
          requestKey: request.current.key,
          missionCommand: command,
          basedOnRevision: fromRevision ?? revision,
        }).catch((error: unknown) => {
          if (error instanceof ActionError && error.status === 409)
            setConflict(true);
          throw error;
        });
        const next = readMission(res.state)!;
        setMission(next);
        setSaved(next);
        setId(res.id);
        setRevision(res.revision);
        setVersions(res.versions);
        setResultRevision(res.revision);
        setMarks(res.milestones);
        setConflict(false);
        // Preserve the exact attempt on refresh without remounting a dirty form.
        window.history.replaceState(null, "", workHref({ id: res.id, slug }));
        if (command?.kind === "test") {
          setView("result");
          requestAnimationFrame(() => resultHeading.current?.focus());
        }
      },
      command?.kind === "test"
        ? "Проверка выполнена, результат сохранён."
        : command?.kind === "reveal"
          ? "Новое условие открыто. Исходный вариант сохранён."
          : command?.kind === "ask" || command?.kind === "assign"
            ? "Ответ команды и текущая работа сохранены."
            : "Работа сохранена. Можно вернуться к этой попытке.",
    );
    lock.current = false;
  }
  const currentVersion = versions.find((v) => v.revision === resultRevision),
    completed = currentVersion?.completed;
  return (
    <div className="page wrap mission-page">
      <nav className="breadcrumbs" aria-label="Навигация по проекту">
        <Link href="/#projects">Все миссии</Link>
        <Link href="/my">Мой путь</Link>
        <Link href="/apply">Подать заявку</Link>
      </nav>
      <header className="mission-heading">
        <p className="eyebrow">{p.title}</p>
        <h1>{d.title}</h1>
        <p>{d.goal}</p>
      </header>
      <div className="mission-toolbar">
        <div role="group" aria-label="Работа и результат">
          <button
            className="button secondary"
            aria-pressed={view === "work"}
            onClick={() => setView("work")}
          >
            Моя работа
          </button>
          <button
            className="button secondary"
            disabled={!versions.length}
            aria-pressed={view === "result"}
            onClick={() => setView("result")}
          >
            Результат и версии
          </button>
        </div>
        <span>
          {!id
            ? "Задание ещё не сохранено"
            : dirty
              ? "Есть несохранённые изменения"
              : `Работа сохранена. Версия ${revision}`}
        </span>
      </div>
      <div id="mission-operation" tabIndex={-1}>
        <Feedback task={task} />
      </div>
      {conflict && (
        <p className="notice error">
          Твой ввод остался здесь.{" "}
          <Link target="_blank" href={workHref({ id, slug })}>
            Открой сохранённое в новой вкладке
          </Link>{" "}
          и сопоставь варианты перед продолжением.
        </p>
      )}
      {view === "work" ? (
        <>
          <section className="mission-brief">
            <details>
              <summary>Твоя задача, материалы и правила проверки</summary>
              <p>
                <strong>Твоя роль: {d.role.toLowerCase()}.</strong> {d.intro}
              </p>
              {d.materials.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
              <p>
                Участники команды отвечают на конкретные вопросы по условиям
                задачи. Текст объяснения сохраняется как твоя работа.
              </p>
            </details>
          </section>
          {mission.phase === "UPDATED" && (
            <aside className="mission-new-fact">
              <strong>Условия изменились</strong>
              <p>{d.newFact}</p>
              <button
                className="text-link"
                onClick={() => {
                  setResultRevision(
                    versions.find(
                      (v) => readMission(v.state)?.phase === "INITIAL",
                    )?.revision ?? 0,
                  );
                  setView("result");
                }}
              >
                Посмотреть исходный вариант
              </button>
            </aside>
          )}
          <div className="mission-workspace">
            <section
              className="mission-work"
              aria-label="Редактор решения"
              id="mission-plan"
            >
              <h2>Собери решение</h2>
              {slug === "creative-engineering" && (
                <MissionRobot mission={mission} editable />
              )}
              <a className="text-link mission-team-jump" href="#mission-team">
                Обсудить решение с командой
              </a>
              <div className="mission-field-grid">
                {d.fields.map((f) => (
                  <label className="field" key={f.id}>
                    {f.label}
                    <select
                      disabled={task.busy}
                      value={mission.plan.choices[f.id]}
                      onChange={(e) =>
                        update("choices", {
                          ...mission.plan.choices,
                          [f.id]: e.target.value,
                        })
                      }
                    >
                      {f.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-help">
                      {
                        f.options.find(
                          (o) => o.id === mission.plan.choices[f.id],
                        )?.detail
                      }
                    </span>
                  </label>
                ))}
              </div>
              {d.sequence && (
                <section className="mission-order">
                  <h3>{d.sequence.label}</h3>
                  <p>
                    {slug === "digital-media"
                      ? "Расставь материалы в порядке публикации. Лишний фрагмент можно убрать."
                      : "Расставь действия студента от поиска до подтверждения передачи."}
                  </p>
                  <ol>
                    {mission.plan.sequence.map((id, i) => (
                      <li key={id}>
                        <span>
                          {d.sequence?.items.find((o) => o.id === id)?.label}
                        </span>
                        <div>
                          <button
                            className="button quiet"
                            aria-label={`Выше: ${d.sequence?.items.find((o) => o.id === id)?.label}`}
                            disabled={i === 0 || task.busy}
                            onClick={() => {
                              const a = [...mission.plan.sequence];
                              [a[i - 1], a[i]] = [a[i], a[i - 1]];
                              update("sequence", a);
                            }}
                          >
                            Выше
                          </button>
                          <button
                            className="button quiet"
                            aria-label={`Ниже: ${d.sequence?.items.find((o) => o.id === id)?.label}`}
                            disabled={
                              i === mission.plan.sequence.length - 1 ||
                              task.busy
                            }
                            onClick={() => {
                              const a = [...mission.plan.sequence];
                              [a[i + 1], a[i]] = [a[i], a[i + 1]];
                              update("sequence", a);
                            }}
                          >
                            Ниже
                          </button>
                          {slug === "digital-media" && (
                            <button
                              className="text-link"
                              disabled={task.busy}
                              onClick={() =>
                                update(
                                  "sequence",
                                  mission.plan.sequence.filter((k) => k !== id),
                                )
                              }
                            >
                              Убрать
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {d.sequence.items
                    .filter((o) => !mission.plan.sequence.includes(o.id))
                    .map((o) => (
                      <button
                        key={o.id}
                        className="button quiet"
                        disabled={task.busy}
                        onClick={() =>
                          update("sequence", [...mission.plan.sequence, o.id])
                        }
                      >
                        Добавить: {o.label}
                      </button>
                    ))}
                </section>
              )}
              {slug === "digital-media" && (
                <label className="field">
                  Заголовок публикации
                  <input
                    maxLength={2000}
                    value={mission.plan.headline}
                    disabled={task.busy}
                    onChange={(e) => update("headline", e.target.value)}
                  />
                </label>
              )}
              {slug === "public-policy" && (
                <fieldset className="mission-allocation">
                  <legend>Распредели занятия</legend>
                  {[
                    "Подростковые занятия",
                    "Взрослые занятия",
                    "Проектные занятия",
                  ].map((label, i) => (
                    <label className="field" key={label}>
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={6}
                        value={mission.plan.allocations[i]}
                        disabled={task.busy}
                        onChange={(e) =>
                          update(
                            "allocations",
                            mission.plan.allocations.map((n, j) =>
                              j === i
                                ? Math.max(
                                    0,
                                    Math.min(6, Number(e.target.value)),
                                  )
                                : n,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              )}
              <h3>Распредели работу</h3>
              <p>
                На каждое поручение нужно 2 единицы времени. У каждого участника
                есть 3.
              </p>
              <div className="mission-assignments">
                {d.tasks.map((t) => (
                  <label className="field" key={t.id}>
                    {t.label}
                    <select
                      value={mission.plan.assignments[t.id] ?? ""}
                      disabled={task.busy}
                      onChange={(e) => {
                        const a = { ...mission.plan.assignments };
                        if (e.target.value) a[t.id] = e.target.value;
                        else delete a[t.id];
                        update("assignments", a);
                      }}
                    >
                      <option value="">Выбрать участника</option>
                      {d.team.map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}, {r.role.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="field">
                Почему ты выбрал это решение? Какой компромисс принимаешь?
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={mission.plan.explanation}
                  disabled={task.busy}
                  onChange={(e) => update("explanation", e.target.value)}
                />
              </label>
              <label className="field">
                По какому наблюдению ты проверишь результат?
                <textarea
                  maxLength={2000}
                  rows={2}
                  value={mission.plan.verification}
                  disabled={task.busy}
                  onChange={(e) => update("verification", e.target.value)}
                />
              </label>
              <div className="mission-run">
                <button
                  className="button primary"
                  disabled={task.busy}
                  onClick={() => save({ kind: "test" })}
                >
                  Проверить решение
                </button>
                <button
                  className="button secondary"
                  disabled={task.busy || !dirty}
                  onClick={() => save()}
                >
                  Сохранить и продолжить позже
                </button>
              </div>
              {mission.phase === "INITIAL" && mission.tests.length > 0 && (
                <button
                  className="button dark"
                  disabled={task.busy}
                  onClick={() => save({ kind: "reveal" })}
                >
                  Открыть новое условие
                </button>
              )}
            </section>
            <aside
              className="mission-team"
              id="mission-team"
              aria-label="Команда миссии"
            >
              <h2>Посоветуйся с командой</h2>
              <p>
                У каждого свои сведения. Можно запросить их и обсудить
                назначенную работу.
              </p>
              {id && (
                <InteractiveProfile
                  key={`${id}:${revision}`}
                  scope={{ attemptId: id, revision }}
                  title="Обсудить сохранённую работу"
                  compact
                />
              )}
              {d.team.map((r) => {
                const replies = mission.conversations.filter(
                  (c) => c.role === r.id && c.phase === mission.phase,
                );
                return (
                  <section key={r.id}>
                    <h3>{r.name}</h3>
                    <p className="subtle">{r.role}</p>
                    <div className="mission-team-actions">
                      <button
                        className="button secondary"
                        disabled={task.busy}
                        onClick={() => save({ kind: "ask", role: r.id })}
                      >
                        {mission.phase === "UPDATED"
                          ? "Что учесть теперь?"
                          : "Что важно учесть?"}
                      </button>
                      <button
                        className="text-link"
                        disabled={
                          task.busy ||
                          !Object.values(mission.plan.assignments).includes(
                            r.id,
                          )
                        }
                        onClick={() => save({ kind: "assign", role: r.id })}
                      >
                        Обсудить поручение
                      </button>
                    </div>
                    {slug === "digital-products" && (
                      <details className="vision-scene">
                        <summary>Диалог: {r.name}</summary>
                        <p>
                          Участник отвечает по своим сведениям и текущему этапу.
                          Разрешение на учебный диалог доступно в Vision рядом с
                          командой.
                        </p>
                        <label className="field">
                          Вопрос участнику
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={sceneQuestions[r.id] ?? ""}
                            onChange={(e) =>
                              setSceneQuestions((q) => ({
                                ...q,
                                [r.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        {dirty && <p>Сохрани текущую работу перед вопросом.</p>}
                        <button
                          type="button"
                          className="button secondary"
                          disabled={
                            dirty ||
                            task.busy ||
                            sceneBusy ||
                            !sceneQuestions[r.id]?.trim()
                          }
                          onClick={() => void discuss(r.id)}
                        >
                          Получить ответ
                        </button>
                      </details>
                    )}
                    {replies.map((c) => (
                      <p className="team-reply" key={c.kind}>
                        {c.question && (
                          <>
                            <strong>Твой вопрос: {c.question}</strong>
                            <br />
                          </>
                        )}
                        {c.text}
                        {c.quote && (
                          <>
                            <br />
                            <small>Сведения участника: «{c.quote}»</small>
                          </>
                        )}
                      </p>
                    ))}
                  </section>
                );
              })}
              {sceneBusy && (
                <p role="status">
                  Участник отвечает.{" "}
                  <button
                    className="text-link"
                    onClick={() => sceneAbort.current?.abort()}
                  >
                    Остановить
                  </button>
                </p>
              )}
              {sceneError && <p role="alert">{sceneError}</p>}
              <details>
                <summary>Предпросмотр работы</summary>
                <MissionArtifact mission={mission} />
              </details>
            </aside>
          </div>
        </>
      ) : (
        <section id="result">
          <h2 ref={resultHeading} tabIndex={-1}>
            {completed
              ? "Решение прошло учебную проверку"
              : "Разбор твоего решения"}
          </h2>
          <WorkResult
            work={{ id, slug, context: "WORKSHOP", versions }}
            revision={resultRevision}
            onRevision={setResultRevision}
            expanded
          />
          <div className="mission-next">
            <h3>Что попробовать дальше</h3>
            <p>{d.programConnection}</p>
            <button
              className="button primary"
              onClick={() => {
                setView("work");
                requestAnimationFrame(() =>
                  document
                    .getElementById("mission-plan")
                    ?.scrollIntoView({ block: "start" }),
                );
              }}
            >
              Вернуться к текущему решению
            </button>
            {mission.phase === "INITIAL" &&
              mission.tests.some((t) => t.phase === "INITIAL") && (
                <>
                  <p>
                    Можно сначала доработать этот вариант или проверить его
                    после нового факта. Исходная работа останется в истории.
                  </p>
                  <button
                    className="button secondary"
                    disabled={task.busy}
                    onClick={async () => {
                      await save({ kind: "reveal" });
                      setView("work");
                    }}
                  >
                    Открыть новое условие
                  </button>
                </>
              )}
            <Link className="button secondary" href={`/programs/${slug}`}>
              Изучить программу
            </Link>
            <Link className="text-link" href={`/projects/${d.nextSlug}`}>
              Другая задача: {missions[d.nextSlug].title.toLowerCase()}
            </Link>
            {slug === "digital-products" && completed && currentVersion && (
              <ContextStart versionId={currentVersion.id} />
            )}
          </div>
          <MilestoneMarks items={marks.filter((m) => m.attemptId === id)} />
          <div className="mission-save-access">
            <Link href={`/my#work-${id}`} className="button secondary">
              Выбрать версию для заявки
            </Link>
            {!authenticated && (
              <p>
                <Link
                  className="text-link"
                  href={`/login?mode=register&next=${encodeURIComponent(workHref({ id, slug }))}`}
                >
                  Сохранить доступ в аккаунте
                </Link>
                . Эта работа перенесётся без повторного прохождения.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
