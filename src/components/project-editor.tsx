"use client";
import { useRef, useState } from "react";
import {
  ProductWorkspace,
  MediaWorkspace,
  EngineeringWorkspace,
  SociologyWorkspace,
  PolicyWorkspace,
} from "./workspaces";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Info,
  Save,
  RotateCcw,
  LayoutGrid,
} from "lucide-react";
import { action, ActionError } from "@/lib/client";
import { EquipmentWorkspace } from "./equipment-workspace";
import {
  equipmentInitial,
  equipmentSchema,
  type EquipmentState,
} from "@/lib/equipment";
import {
  sameWorkState,
  versionCompleted,
  workFeedback,
  workCompleted,
  workHref,
  workTitle,
  type Milestone,
} from "@/lib/journey";
import { WorkResult } from "./work-result";
import { ContextStart, MilestoneMarks, WorkspaceTip } from "./journey-actions";
import { programFor, programs } from "@/lib/catalog";
import { initialState, modules } from "@/lib/projects";
import type { ProjectState, Feedback as ProjectFeedback } from "@/lib/types";
import type { ProjectAttempt, AttemptVersion } from "@prisma/client";
import { Feedback, useTask, Tag } from "./ui";
export function ProjectEditor({
  slug,
  attempt,
  authenticated,
  milestones: initialMilestones,
  selectedRevision,
  fromRevision,
  parent,
}: {
  slug: string;
  attempt: (ProjectAttempt & { versions: AttemptVersion[] }) | null;
  authenticated: boolean;
  milestones: Milestone[];
  selectedRevision?: number;
  fromRevision?: number;
  parent?: { attemptId: string; revision: number; feedback: unknown };
}) {
  const p = programFor(slug)!;
  const router = useRouter();
  const context = attempt?.context ?? "WORKSHOP";
  const editing =
    fromRevision === undefined
      ? attempt?.state
      : attempt?.versions.find((v) => v.revision === fromRevision)?.state;
  const [equipment, setEquipment] = useState<EquipmentState>(
    context === "EQUIPMENT" ? equipmentSchema.parse(editing) : equipmentInitial,
  );
  const [milestones, setMilestones] = useState(initialMilestones);
  const [resultRevision, setResultRevision] = useState(
    selectedRevision ?? attempt?.revision ?? 0,
  );
  const request = useRef({ signature: "", key: "" });
  const ownerReady = useRef(!!attempt || authenticated);
  const task = useTask();
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<ProjectState>(
    editing && context === "WORKSHOP"
      ? (editing as unknown as ProjectState)
      : structuredClone(initialState),
  );
  const [saved, setSaved] = useState<unknown>(attempt?.state ?? null);
  const [attemptId, setAttemptId] = useState(attempt?.id ?? "");
  const [revision, setRevision] = useState(attempt?.revision ?? 0);
  const [feedback, setFeedback] = useState<ProjectFeedback | null>(null);
  const [versions, setVersions] = useState(attempt?.versions ?? []);
  const currentState = context === "EQUIPMENT" ? equipment : state;
  const dirty = !sameWorkState(currentState, saved);
  const update = <K extends keyof ProjectState>(
    key: K,
    value: ProjectState[K],
  ) => {
    setState((s) => ({ ...s, [key]: value }));
    setFeedback(null);
    task.setNotice("");
  };
  function move(key: "screens" | "fragments", i: number, direction: number) {
    const arr = [...state[key]];
    [arr[i], arr[i + direction]] = [arr[i + direction], arr[i]];
    update(key, arr);
  }
  async function save(againstRevision = revision) {
    await task.run(async () => {
      // Establish the guest cookie before saving: a lost first save response
      // can then be retried under the same owner and idempotency key.
      if (!ownerReady.current) {
        await action("project.progress");
        ownerReady.current = true;
      }
      const signature = JSON.stringify({
        state: currentState,
        revision: againstRevision,
        id: attemptId,
      });
      if (request.current.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      const result = await action<{
        id: string;
        revision: number;
        feedback: ProjectFeedback;
        versions: AttemptVersion[];
        state: unknown;
        milestones: Milestone[];
      }>("project.save", {
        slug,
        state: currentState,
        id: attemptId || undefined,
        revision: againstRevision,
        requestKey: request.current.key,
        basedOnRevision: fromRevision ?? revision,
      }).catch(async (error: unknown) => {
        if (error instanceof ActionError && error.status === 409 && attemptId) {
          try {
            const progress = await action<{
              attempts: { id: string; revision: number }[];
            }>("project.progress");
            const latest = progress.attempts.find((a) => a.id === attemptId);
            if (latest && latest.revision !== againstRevision)
              setConflictRevision(latest.revision);
          } catch {
            /* The original error and the edited work remain available. */
          }
        }
        throw error;
      });
      setConflictRevision(null);
      setAttemptId(result.id);
      setRevision(result.revision);
      setSaved(result.state);
      if (context === "EQUIPMENT")
        setEquipment(equipmentSchema.parse(result.state));
      else setState(result.state as ProjectState);
      setResultRevision(result.revision);
      setMilestones(result.milestones);
      setFeedback(null);
      setVersions(result.versions);
      router.refresh();
    }, "Работа сохранена. Можно продолжить с этого места.");
  }
  const checks = feedback?.checks ?? [];
  return (
    <div className="page wrap">
      <div className="breadcrumbs">
        <Link href="/">Проекты</Link>
        <ArrowRight size={12} />
        <span>
          {context === "EQUIPMENT"
            ? "Новый контекст · оборудование"
            : "Открытая площадка"}
        </span>
      </div>
      <div className="page-title">
        <div>
          <h1>{workTitle({ slug, context }, p.action)}</h1>
          <p>Маленькое действие. Результат, который принадлежит тебе.</p>
        </div>
        <Tag tone="blue">{p.shortTitle}</Tag>
      </div>
      <nav className="project-tabs" aria-label="Проба деятельности">
        {programs.map((prog) => (
          <Link
            key={prog.slug}
            className={prog.slug === slug ? "active" : ""}
            href={"/projects/" + prog.slug}
          >
            {prog.shortTitle}
          </Link>
        ))}
      </nav>
      <div className="workspace">
        <details className="brief-panel panel" open>
          <summary>Что произошло</summary>
          {context === "EQUIPMENT" ? (
            <>
              <p>
                Команда готовит съёмку в библиотеке. Посетителю нужно
                забронировать оборудование на один час. У него есть почта, но
                нет телефона.
              </p>
              <table className="source-table">
                <caption>Доступность оборудования</caption>
                <thead>
                  <tr>
                    <th>Вещь</th>
                    <th>16:00</th>
                    <th>17:00</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Камера</td>
                    <td>Занята</td>
                    <td>Свободна</td>
                  </tr>
                  <tr>
                    <td>Диктофон</td>
                    <td>Свободен</td>
                    <td>Проверка</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Покажи доступность до запроса контакта. Для занятого времени
                предложи свободное. В подтверждении оставь вещь и время.
              </p>
              {parent && (
                <details className="versions">
                  <summary>Из какой работы пришёл принцип</summary>
                  <Link
                    className="text-link"
                    href={workHref(
                      { id: parent.attemptId, slug },
                      parent.revision,
                    )}
                  >
                    Открыть исходный результат · версия {parent.revision}
                  </Link>
                  <p>Сохранённая обратная связь исходной работы:</p>
                  <ul>
                    {(parent.feedback as ProjectFeedback).checks.map((c) => (
                      <li key={c.label}>{c.detail}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <>
              <p>
                Команда готовит открытую образовательную площадку в библиотеке.
                Зал освободится позже, часть участников придёт впервые. План
                нужно пересмотреть.
              </p>
              <div className="team-message">
                <strong>Дана · координирует площадку</strong>
                <p>
                  «Начинаем в 16:00 вместо 14:00. Мастерские остаются
                  бесплатными. Ждём ребят без предварительного опыта».
                </p>
              </div>
              {context === "WORKSHOP" && slug === "digital-products" && (
                <>
                  <div className="team-message">
                    <strong>Алия · будущая участница</strong>
                    <p>
                      «У меня нет личного телефона. Сначала хочу выбрать
                      мастерскую, а потом рассказывать о себе».
                    </p>
                  </div>
                  <p>
                    Условия: покажи выбор до личных данных, сделай телефон
                    необязательным, заверши путь подтверждением.
                  </p>
                </>
              )}
              {context === "WORKSHOP" && slug === "digital-media" && (
                <>
                  <div className="team-message">
                    <strong>Марат · редактор</strong>
                    <p>
                      «В чате уже пишут об отмене. Сверь историю с сообщением
                      Даны и помоги участникам не запутаться».
                    </p>
                  </div>
                  <p>
                    Используй подготовленные фрагменты, придумай заголовок и
                    подпись. Проверь время начала.
                  </p>
                </>
              )}
              {context === "WORKSHOP" && slug === "creative-engineering" && (
                <>
                  <p>
                    План: 4 × 3 клетки. Правая колонка — проход. Ресурс: 12
                    единиц. Нужны стол и питание. Экран должен стоять рядом с
                    питанием по стороне.
                  </p>
                  <table className="source-table">
                    <caption className="screen-reader-only">
                      Стоимость модулей
                    </caption>
                    <thead>
                      <tr>
                        <th>Модуль</th>
                        <th>Ресурс</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(modules).map((m) => (
                        <tr key={m.title}>
                          <td>{m.title}</td>
                          <td>{m.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="subtle">
                    Это схема по условиям задачи, без расчёта физических
                    нагрузок.
                  </p>
                </>
              )}
              {context === "WORKSHOP" && slug === "sociology" && (
                <>
                  <table className="source-table">
                    <caption>Опрос 30 посетителей библиотеки</caption>
                    <thead>
                      <tr>
                        <th>Удобное время</th>
                        <th>Ответы</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>До 14:00</td>
                        <td>7</td>
                      </tr>
                      <tr>
                        <td>14:00–16:00</td>
                        <td>5</td>
                      </tr>
                      <tr>
                        <td>После 16:00</td>
                        <td>18</td>
                      </tr>
                    </tbody>
                  </table>
                  <p>
                    Другая аудитория в опрос не попала. Отдели то, что известно,
                    от предположений.
                  </p>
                </>
              )}
              {context === "WORKSHOP" && slug === "public-policy" && (
                <>
                  <p>
                    Всего 12 единиц ресурса. Одна единица покрывает потребность
                    5 участников в материалах, 3 — в помощи наставника или 4 — в
                    тихих местах.
                  </p>
                  <table className="source-table">
                    <thead>
                      <tr>
                        <th>Потребность</th>
                        <th>Участники</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Материалы</td>
                        <td>30</td>
                      </tr>
                      <tr>
                        <td>Наставник</td>
                        <td>18</td>
                      </tr>
                      <tr>
                        <td>Тихое место</td>
                        <td>16</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="subtle">
                    Покрытие рассчитывается по этим правилам учебной задачи.
                  </p>
                </>
              )}
            </>
          )}
          <hr className="divider" />
          <p className="subtle">
            Вымышленная учебная ситуация. Можно менять решение и пробовать
            снова. Работа не влияет на поступление автоматически.
          </p>
        </details>
        <div className="workspace-main">
          <div className="editor-head">
            <div>
              <h2>Твоя рабочая область</h2>
              <p>
                {revision
                  ? `Сохранена версия ${revision}`
                  : "Измени исходный план и проверь условия задачи."}
                {dirty && revision > 0 ? " · Есть несохранённые изменения" : ""}
              </p>
            </div>
            <Tag>{p.artifact}</Tag>
          </div>
          {(!attempt || attempt.revision === 0) && <WorkspaceTip />}
          {fromRevision !== undefined && (
            <p className="notice info">
              Доработка версии {fromRevision}. Сохранение добавит новый вариант;
              предыдущие останутся в истории.
            </p>
          )}
          <div className="editor-surface">
            {context === "EQUIPMENT" && (
              <EquipmentWorkspace
                state={equipment}
                setState={(s) => {
                  setEquipment(s);
                  setFeedback(null);
                  task.setNotice("");
                }}
                id={attemptId}
                hintsUsed={attempt?.hintsUsed ?? []}
              />
            )}

            {context === "WORKSHOP" && slug === "digital-products" && (
              <ProductWorkspace
                key={resetKey}
                state={state}
                update={update}
                reorder={move}
              />
            )}
            {context === "WORKSHOP" && slug === "digital-media" && (
              <MediaWorkspace
                key={resetKey}
                state={state}
                update={update}
                reorder={move}
              />
            )}
            {context === "WORKSHOP" && slug === "creative-engineering" && (
              <EngineeringWorkspace
                key={resetKey}
                state={state}
                update={update}
              />
            )}
            {context === "WORKSHOP" && slug === "sociology" && (
              <SociologyWorkspace
                key={resetKey}
                state={state}
                update={update}
              />
            )}
            {context === "WORKSHOP" && slug === "public-policy" && (
              <PolicyWorkspace key={resetKey} state={state} update={update} />
            )}
          </div>
          <div className="editor-toolbar">
            <button
              className="button primary"
              disabled={task.busy || !dirty}
              onClick={() => save()}
            >
              <Save size={17} />
              {task.error
                ? "Повторить сохранение"
                : workCompleted(slug, currentState, context)
                  ? "Сохранить результат"
                  : "Сохранить черновик"}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                setFeedback(workFeedback(slug, currentState, context))
              }
            >
              Проверить условия <CheckCircle2 size={17} />
            </button>
            <button
              className="button quiet"
              onClick={() => {
                setState(structuredClone(initialState));
                setEquipment(structuredClone(equipmentInitial));
                setFeedback(null);
                setResetKey((key) => key + 1);
              }}
            >
              <RotateCcw size={15} />К исходному плану
            </button>
          </div>
          <Feedback task={task} />
          {conflictRevision !== null && (
            <div className="conflict-recovery">
              <p>
                На сервере уже версия {conflictRevision}. Твой вариант можно
                сохранить отдельно: обе работы останутся в истории.
              </p>
              <a
                className="text-link"
                target="_blank"
                rel="noopener"
                href={workHref({ id: attemptId, slug }, conflictRevision)}
              >
                Открыть версию {conflictRevision} в новой вкладке
              </a>
              <button
                className="button secondary"
                disabled={task.busy}
                onClick={() => save(conflictRevision)}
              >
                Сохранить мой вариант новой версией
              </button>
            </div>
          )}
          {revision > 0 && !dirty && (
            <a className="text-link" href="#result">
              Посмотреть сохранённый результат · версия {revision}{" "}
              <ArrowRight size={16} />
            </a>
          )}
          {feedback && (
            <section className="feedback-panel" aria-label="Обратная связь">
              <h3>Что говорит проверка</h3>
              <p className="subtle">{feedback.summary}</p>
              {checks.map((c) => (
                <div key={c.label} className="check-result">
                  {c.passed ? (
                    <Check size={18} className="check-pass" />
                  ) : (
                    <Info size={18} className="check-fail" />
                  )}
                  <div>
                    <strong>{c.label}</strong>
                    <p>{c.detail}</p>
                  </div>
                </div>
              ))}
              <p className="subtle">
                Можно исправить работу или оставить свой вариант. Проверка
                касается явных условий этой задачи.
              </p>
            </section>
          )}
          {saved !== null && revision > 0 && versions.length > 0 && (
            <section className="artifact-summary" id="result">
              <div className="result-title">
                <LayoutGrid size={18} />
                {context === "EQUIPMENT" ? "Маршрут бронирования" : p.artifact}
              </div>
              <h2>Твоя сохранённая работа</h2>
              <WorkResult
                work={{ slug, context, versions }}
                revision={resultRevision}
                onRevision={setResultRevision}
                expanded
              />
              <MilestoneMarks
                items={milestones.filter((m) => m.attemptId === attemptId)}
              />
              <div className="result-next">
                <h3>Что можно сделать дальше</h3>
                {context === "WORKSHOP" &&
                slug === "digital-products" &&
                versions.some(
                  (v) =>
                    v.revision === resultRevision &&
                    versionCompleted({ slug, context }, v),
                ) ? (
                  <>
                    <p>
                      Примени порядок «сначала выбор, затем контакт» в
                      бронировании оборудования. Здесь нужно ещё учитывать
                      занятое время и детали брони.
                    </p>
                    <ContextStart
                      versionId={
                        versions.find((v) => v.revision === resultRevision)!.id
                      }
                    />
                  </>
                ) : (
                  <p>
                    {workCompleted(
                      slug,
                      versions.find((v) => v.revision === resultRevision)
                        ?.state ?? saved,
                      context,
                    )
                      ? "Условия выполнены. Можно сохранить другой обоснованный вариант или попробовать другую мастерскую."
                      : "Вернись к условиям, отмеченным в разборе, и сохрани новый вариант. Текущий останется в истории."}
                  </p>
                )}
                <p>
                  В этой работе используются:{" "}
                  {workFeedback(slug, saved, context)
                    .actions.join(", ")
                    .toLowerCase()}
                  . На программе есть дисциплины: {p.disciplines.join(", ")}.
                </p>
                <div className="row">
                  <Link className="button dark" href="/my">
                    Открыть мой путь <ArrowUpRight size={18} />
                  </Link>
                  <Link className="text-link" href={"/programs/" + slug}>
                    Изучить направление <ArrowRight size={16} />
                  </Link>
                </div>
                {!authenticated && (
                  <p className="subtle">
                    Работа уже доступна в этом браузере.{" "}
                    <Link
                      className="text-link"
                      href={
                        "/login?mode=register&next=" +
                        encodeURIComponent(
                          workHref({ id: attemptId, slug }, resultRevision),
                        )
                      }
                    >
                      Сохранить доступ в аккаунте
                    </Link>{" "}
                    — без повторного прохождения.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
