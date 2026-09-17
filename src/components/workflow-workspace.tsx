"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { scoringActions } from "@/lib/scoring-contract";
import {
  workflowModes,
  workflowTask,
  workflowTime,
  durationLabel,
  type WorkflowView,
  type WorkflowWork,
} from "@/lib/workflow-contract";
import type { workflowList } from "@/lib/workflow-service.server";
import { SourceContent } from "./review-source";
import { Feedback, useTask } from "./ui";
export function WorkflowWorkspace({
  initial,
  list,
}: {
  initial: WorkflowView | null;
  list: Awaited<ReturnType<typeof workflowList>> | null;
}) {
  const task = useTask(),
    router = useRouter();
  const [session, setSession] = useState(initial),
    [work, setWork] = useState(initial?.work);
  const [caseKey, setCaseKey] = useState<string>(list?.cases[0].key ?? "rich"),
    [mode, setMode] = useState<keyof typeof workflowModes>("MATERIALS");
  const [participant, setParticipant] = useState(""),
    [technical, setTechnical] = useState(false),
    [familiar, setFamiliar] = useState(false),
    [familiarityNote, setFamiliarityNote] = useState("");
  const [damaged, setDamaged] = useState(false),
    [requestKey] = useState(() => crypto.randomUUID());
  const [sourceId, setSourceId] = useState(initial?.input.sources[0]?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const sourcePanel = useRef<HTMLDivElement>(null),
    sourceTrigger = useRef<HTMLButtonElement | null>(null);
  const openSource = (id: string, trigger: HTMLButtonElement) => {
    setSourceId(id);
    sourceTrigger.current = trigger;
    requestAnimationFrame(() => sourcePanel.current?.focus());
  };
  const save = (type: string) =>
    task.run(
      async () => {
        const next = await action<WorkflowView>(type, {
          id: session!.id,
          revision: session!.revision,
          work,
        });
        setSession(next);
        setWork(next.work);
        setDirty(false);
      },
      type === "workflow.complete"
        ? "Проверка завершена. Рабочий ответ сохранён."
        : "Рабочий ответ сохранён.",
    );
  const field = (key: keyof WorkflowWork, label: string) => (
    <label className="field">
      {label}
      <textarea
        rows={3}
        value={String(work?.[key] ?? "")}
        onChange={(e) => {
          setWork({ ...work!, [key]: e.target.value });
          setDirty(true);
        }}
      />
    </label>
  );
  return (
    <div className="staff-page workflow-page">
      <nav className="workflow-links" aria-label="Проверка рабочего процесса">
        <Link className="text-link" href="/admissions">
          К очереди
        </Link>
        <Link className="text-link" href="/admissions/workflow/results">
          Результаты проверок
        </Link>
        {session && (
          <Link className="text-link" href="/admissions/workflow">
            Выбрать другую сессию
          </Link>
        )}
      </nav>
      <h1>Проверка рабочего процесса</h1>
      <p className="subtle">{workflowTask}</p>
      <Feedback task={task} />
      {!session && list && (
        <>
          <div className="workflow-start">
            <h2>Начать отдельную сессию</h2>
            <p>
              Контрольные истории вымышлены. Рабочий ответ не меняет оценку,
              решение или сообщение кандидату.
            </p>
            <label className="field">
              Код участника
              <input
                value={participant}
                onChange={(e) => setParticipant(e.target.value)}
                placeholder="Например, P01 — без имени и контактов"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Случай
                <select
                  value={caseKey}
                  onChange={(e) => setCaseKey(e.target.value)}
                >
                  {list.cases.map((c) => (
                    <option value={c.key} key={c.key}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Режим
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  {Object.entries(workflowModes).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Способ прохождения
              <select
                value={technical ? "technical" : "human"}
                onChange={(e) => setTechnical(e.target.value === "technical")}
              >
                <option value="human">Человек — рабочая проверка</option>
                <option value="technical">
                  Браузерная автоматизация — техническая проверка
                </option>
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={familiar}
                onChange={(e) => setFamiliar(e.target.checked)}
              />
              Уже знаком с этими материалами
            </label>
            <label className="field">
              Условия и знакомство с материалами
              <textarea
                rows={2}
                value={familiarityNote}
                onChange={(e) => setFamiliarityNote(e.target.value)}
                placeholder="Если знакомы, укажите, что уже видели. Не открывайте ту же историю повторно ради сравнения режимов."
              />
            </label>
            {technical && mode === "PROFILE" && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={damaged}
                  onChange={(e) => setDamaged(e.target.checked)}
                />
                Проверить отклонение ошибочного основания
              </label>
            )}
            <button
              className="button primary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  const next = await action<WorkflowView>("workflow.start", {
                    caseKey,
                    mode,
                    participant,
                    technical,
                    familiar,
                    familiarityNote,
                    requestKey,
                    damaged: technical && mode === "PROFILE" && damaged,
                  });
                  router.push(`/admissions/workflow?session=${next.id}`);
                })
              }
            >
              Начать проверку рабочего процесса
            </button>
            <p className="subtle">
              Время отсчитывается с этого действия. Учитываются только явные
              паузы; это не измерение внимания.
            </p>
          </div>
          {!!list.sessions.length && (
            <section className="workflow-history">
              <h2>Мои сессии</h2>
              {list.sessions.map((s) => (
                <p key={s.id}>
                  <Link
                    className="text-link"
                    href={`/admissions/workflow?session=${s.id}`}
                  >
                    {s.title} ·{" "}
                    {workflowModes[s.mode as keyof typeof workflowModes]}
                  </Link>{" "}
                  —{" "}
                  {s.status === "COMPLETED"
                    ? "Завершена"
                    : s.status === "PAUSED"
                      ? "Пауза"
                      : "Начата"}{" "}
                  · {dateLabel(s.startedAt)}
                  {s.technical ? " · техническая" : ""}
                </p>
              ))}
            </section>
          )}
        </>
      )}
      {session && work && (
        <>
          <header className="workflow-heading">
            <div>
              <h2>{session.title}</h2>
              <p>
                {workflowModes[session.mode]} · {session.participant} · порядок{" "}
                {session.order}
                {session.familiar ? " · материалы знакомы" : ""}
              </p>
            </div>
            <strong role="status">
              {session.status === "COMPLETED"
                ? "Завершена"
                : session.status === "PAUSED"
                  ? "На паузе"
                  : "Идёт проверка"}
            </strong>
          </header>
          {session.technical && (
            <p className="notice info">
              Технический проход. Не включается в человеческие измерения.
            </p>
          )}
          <div className="workflow-controls">
            <span>
              {dirty
                ? "Есть несохранённые изменения"
                : `Сохранено ${dateLabel(session.savedAt)}`}
            </span>
            {session.status !== "COMPLETED" && (
              <>
                <button
                  className="button secondary"
                  disabled={task.busy}
                  onClick={() => save("workflow.save")}
                >
                  Сохранить
                </button>
                <button
                  className="button secondary"
                  disabled={task.busy}
                  onClick={() =>
                    save(
                      session.status === "PAUSED"
                        ? "workflow.resume"
                        : "workflow.pause",
                    )
                  }
                >
                  {session.status === "PAUSED" ? "Продолжить" : "Пауза"}
                </button>
              </>
            )}
          </div>
          <div className="workflow-grid">
            <aside>
              <div
                ref={sourcePanel}
                tabIndex={-1}
                className="workflow-source"
                aria-label="Исходные материалы"
              >
                <h3>Исходные материалы</h3>
                <label className="field">
                  Открытый источник
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    {session.input.sources.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                {(() => {
                  const source = session.input.sources.find(
                    (s) => s.id === sourceId,
                  );
                  return (
                    source && (
                      <>
                        <SourceContent
                          source={{
                            id: source.id,
                            kind: source.kind,
                            title: source.title,
                            content:
                              source.text ||
                              "Содержание этого материала недоступно. Его нельзя использовать как прочитанное основание.",
                          }}
                        />
                        <p className="subtle">
                          Материал {source.version.slice(0, 8)} · отправленная
                          версия {session.input.applicationVersion.revision}
                        </p>
                      </>
                    )
                  );
                })()}
                <button
                  className="text-link"
                  onClick={() => {
                    if (sourceTrigger.current) sourceTrigger.current.focus();
                    else
                      document
                        .querySelector<HTMLTextAreaElement>(
                          ".workflow-work textarea",
                        )
                        ?.focus();
                  }}
                >
                  Вернуться к работе
                </button>
              </div>
            </aside>
            <div className="workflow-main">
              <details className="scoring-scale">
                <summary>
                  Критерии и шкала · {session.input.criteria.rubricVersion}
                </summary>
                <p>{session.input.criteria.guidance}</p>
                {session.input.criteria.levels.map((l) => (
                  <p key={l.label}>
                    <strong>{l.label}.</strong> {l.meaning}
                  </p>
                ))}
                <p>
                  Отсутствие сведений не означает низкую оценку.
                  {!session.input.criteria.numeric &&
                    " Числовая шкала в этом случае не задана."}
                </p>
                {session.input.criteria.numeric?.points.map((point) => (
                  <p key={point.value}>
                    <strong>
                      {point.value} · {point.label}.
                    </strong>{" "}
                    {point.meaning}
                  </p>
                ))}
              </details>
              {session.input.language && (
                <section className="notice info">
                  <div>
                    <strong>Английский — отдельная проверка</strong>
                    <p>{session.input.language.conclusion}</p>
                  </div>
                </section>
              )}
              {session.mode === "PROFILE" && (
                <section
                  aria-label="Подготовленный профиль"
                  className="workflow-profile"
                >
                  <h3>Предварительный профиль</h3>
                  {session.profileIssue && (
                    <p className="notice warning" role="alert">
                      {session.profileIssue}
                    </p>
                  )}
                  {session.profile && (
                    <>
                      <p>{session.profile.summary}</p>
                      <p>
                        <strong>
                          {
                            scoringActions[
                              session.profile.recommendation.action
                            ]
                          }
                        </strong>
                        <br />
                        {session.profile.recommendation.reason}
                      </p>
                      {session.profile.domains.map((d) => (
                        <details key={d.domain}>
                          <summary>
                            {d.domain} ·{" "}
                            {d.rating?.label ?? "Оценка не установлена"}
                          </summary>
                          <p>
                            Основания: {d.sufficiency}. {d.consistency}.
                          </p>
                          <p>{d.interpretation}</p>
                          {d.evidenceIds.map((id) => {
                            const e = session.profile!.evidence.find(
                              (e) => e.id === id,
                            )!;
                            return (
                              <div key={id} className="workflow-evidence">
                                <blockquote>{e.quote}</blockquote>
                                <p>{e.explanation}</p>
                                <button
                                  className="text-link"
                                  onClick={(event) =>
                                    openSource(e.sourceId, event.currentTarget)
                                  }
                                >
                                  Открыть источник
                                </button>
                              </div>
                            );
                          })}
                          {d.gaps.map((g) => (
                            <p key={g}>Уточнить: {g}</p>
                          ))}
                        </details>
                      ))}
                      <h3>Вопросы для интервью</h3>
                      {session.profile.questions.map((q) => (
                        <p key={q.id}>
                          {q.text}
                          <br />
                          <button
                            className="text-link"
                            onClick={(e) =>
                              openSource(q.sourceId, e.currentTarget)
                            }
                          >
                            Материал к вопросу
                          </button>
                        </p>
                      ))}
                    </>
                  )}
                </section>
              )}
              <section aria-label="Рабочий ответ" className="workflow-work">
                <h3>Ваш рабочий ответ</h3>
                <fieldset disabled={session.status !== "ACTIVE" || task.busy}>
                  {field(
                    "evidence",
                    "Существенные основания или отсутствие оснований",
                  )}
                  <div className="field">
                    <span>Источники вашего вывода</span>
                    {session.input.sources
                      .filter((s) => s.text)
                      .map((s) => (
                        <label className="check-row" key={s.id}>
                          <input
                            type="checkbox"
                            checked={work.sourceIds.includes(s.id)}
                            onChange={(e) => {
                              setWork({
                                ...work,
                                sourceIds: e.target.checked
                                  ? [...work.sourceIds, s.id]
                                  : work.sourceIds.filter((id) => id !== s.id),
                              });
                              setDirty(true);
                            }}
                          />
                          {s.title}
                        </label>
                      ))}
                  </div>
                  {field("questions", "Вопросы, которые остаются")}
                  <label className="field">
                    Следующий шаг
                    <select
                      value={work.nextAction}
                      onChange={(e) => {
                        setWork({
                          ...work,
                          nextAction: e.target
                            .value as WorkflowWork["nextAction"],
                        });
                        setDirty(true);
                      }}
                    >
                      <option value="">Выберите действие</option>
                      {Object.entries(scoringActions).map(([k, v]) => (
                        <option value={k} key={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  {field("reason", "Почему выбран этот шаг")}
                  {field("errors", "Замеченные ошибки материалов или профиля")}
                  {field("corrections", "Что вы исправили в своём выводе")}
                </fieldset>
                {session.status !== "COMPLETED" && (
                  <button
                    className="button primary"
                    disabled={task.busy || session.status === "PAUSED"}
                    onClick={() => save("workflow.complete")}
                  >
                    Сохранить и завершить проверку
                  </button>
                )}
              </section>
            </div>
          </div>
          {session.status === "COMPLETED" && (
            <>
              <p>
                Полное время: {durationLabel(workflowTime(session).elapsedMs)}.
                Без явных пауз:{" "}
                {durationLabel(workflowTime(session).withoutPausesMs)}. Это
                технический таймер сессии.
              </p>
              <WorkflowAnnotationForm session={session} onSave={setSession} />
            </>
          )}
        </>
      )}
    </div>
  );
}
function WorkflowAnnotationForm({
  session,
  onSave,
}: {
  session: WorkflowView;
  onSave: (s: WorkflowView) => void;
}) {
  const [checked, setChecked] = useState(false);
  const task = useTask(),
    [support, setSupport] = useState("NOT_CHECKED"),
    [evidence, setEvidence] = useState(""),
    [questions, setQuestions] = useState(""),
    [note, setNote] = useState(""),
    [count, setCount] = useState(0);
  return (
    <details className="workflow-annotation">
      <summary>Отдельная человеческая разметка результата</summary>
      <p>
        Сопоставьте ответ с источниками. Автоматическое присутствие цитаты не
        подтверждает смысл интерпретации. Не считайте пропуски по совпадению
        слов.
      </p>
      <label className="field">
        Поддерживает ли источник интерпретацию?
        <select value={support} onChange={(e) => setSupport(e.target.value)}>
          <option value="NOT_CHECKED">Не проверено</option>
          <option value="SUPPORTED">Поддерживает</option>
          <option value="PARTIAL">Частично</option>
          <option value="UNSUPPORTED">Не поддерживает</option>
        </select>
      </label>
      <label className="field">
        Пропущенные существенные основания — по одному на строку
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </label>
      <label className="field">
        Пропущенные вопросы — по одному на строку
        <textarea
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
        />
      </label>
      <label className="field">
        Количество содержательных исправлений
        <input
          type="number"
          min={0}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <label className="field">
        Обоснование разметки и ссылки на названия источников
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        Проверены пропущенные основания, вопросы и содержательные исправления
      </label>
      <Feedback task={task} />
      <button
        className="button secondary"
        disabled={task.busy}
        onClick={() =>
          task.run(async () => {
            const next = await action<WorkflowView>("workflow.annotate", {
              id: session.id,
              revision: session.revision,
              annotation: {
                checked,
                support,
                missedEvidence: evidence.split("\n").filter(Boolean),
                missedQuestions: questions.split("\n").filter(Boolean),
                correctionCount: count,
                note,
              },
            });
            onSave(next);
          }, "Разметка сохранена отдельно от рабочего ответа.")
        }
      >
        Сохранить разметку
      </button>
      {session.annotations.map((a, i) => (
        <p key={i}>
          Разметка {i + 1} · {dateLabel(a.at)} · {a.note}
        </p>
      ))}
    </details>
  );
}
