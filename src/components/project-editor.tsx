"use client";
import { useState } from "react";
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
import { action, dateLabel } from "@/lib/client";
import { describeWork } from "@/lib/presentation";
import { programFor, programs } from "@/lib/catalog";
import {
  initialState,
  modules,
  checkProject,
  changesBetween,
} from "@/lib/projects";
import type { ProjectState, Feedback as ProjectFeedback } from "@/lib/types";
import type { ProjectAttempt, AttemptVersion } from "@prisma/client";
import { Feedback, useTask, Tag } from "./ui";
export function ProjectEditor({
  slug,
  attempt,
  authenticated,
}: {
  slug: string;
  attempt: (ProjectAttempt & { versions: AttemptVersion[] }) | null;
  authenticated: boolean;
}) {
  const p = programFor(slug)!;
  const router = useRouter();
  const task = useTask();
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<ProjectState>(
    attempt
      ? (attempt.state as unknown as ProjectState)
      : structuredClone(initialState),
  );
  const [saved, setSaved] = useState(
    (attempt?.state as unknown as ProjectState) ?? null,
  );
  const [attemptId, setAttemptId] = useState(attempt?.id ?? "");
  const [revision, setRevision] = useState(attempt?.revision ?? 0);
  const [feedback, setFeedback] = useState<ProjectFeedback | null>(null);
  const [versions, setVersions] = useState(attempt?.versions ?? []);
  const dirty = JSON.stringify(state) !== JSON.stringify(saved);
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
  async function save() {
    await task.run(async () => {
      const result = await action<{
        id: string;
        revision: number;
        feedback: ProjectFeedback;
        versions: AttemptVersion[];
      }>("project.save", { slug, state, id: attemptId || undefined, revision });
      setAttemptId(result.id);
      setRevision(result.revision);
      setSaved(structuredClone(state));
      setFeedback(result.feedback);
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
        <span>Открытая площадка</span>
      </div>
      <div className="page-title">
        <div>
          <h1>{p.action}</h1>
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
          <p>
            Команда готовит открытую образовательную площадку в библиотеке. Зал
            освободится позже, часть участников придёт впервые. План нужно
            пересмотреть.
          </p>
          <div className="team-message">
            <strong>Дана · координирует площадку</strong>
            <p>
              «Начинаем в 16:00 вместо 14:00. Мастерские остаются бесплатными.
              Ждём ребят без предварительного опыта».
            </p>
          </div>
          {slug === "digital-products" && (
            <>
              <div className="team-message">
                <strong>Алия · будущая участница</strong>
                <p>
                  «У меня нет личного телефона. Сначала хочу выбрать мастерскую,
                  а потом рассказывать о себе».
                </p>
              </div>
              <p>
                Условия: покажи выбор до личных данных, сделай телефон
                необязательным, заверши путь подтверждением.
              </p>
            </>
          )}
          {slug === "digital-media" && (
            <>
              <div className="team-message">
                <strong>Марат · редактор</strong>
                <p>
                  «В чате уже пишут об отмене. Сверь историю с сообщением Даны и
                  помоги участникам не запутаться».
                </p>
              </div>
              <p>
                Используй подготовленные фрагменты, придумай заголовок и
                подпись. Проверь время начала.
              </p>
            </>
          )}
          {slug === "creative-engineering" && (
            <>
              <p>
                План: 4 × 3 клетки. Правая колонка — проход. Ресурс: 12 единиц.
                Нужны стол и питание. Экран должен стоять рядом с питанием по
                стороне.
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
                Это схема по условиям задачи, без расчёта физических нагрузок.
              </p>
            </>
          )}
          {slug === "sociology" && (
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
                Другая аудитория в опрос не попала. Отдели то, что известно, от
                предположений.
              </p>
            </>
          )}
          {slug === "public-policy" && (
            <>
              <p>
                Всего 12 единиц ресурса. Одна единица покрывает потребность 5
                участников в материалах, 3 — в помощи наставника или 4 — в тихих
                местах.
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
                  : "Измени исходный план — это станет твоей первой версией."}
                {dirty && revision > 0 ? " · Есть несохранённые изменения" : ""}
              </p>
            </div>
            <Tag>{p.artifact}</Tag>
          </div>
          <div className="editor-surface">
            {slug === "digital-products" && (
              <ProductWorkspace
                key={resetKey}
                state={state}
                update={update}
                reorder={move}
              />
            )}
            {slug === "digital-media" && (
              <MediaWorkspace
                key={resetKey}
                state={state}
                update={update}
                reorder={move}
              />
            )}
            {slug === "creative-engineering" && (
              <EngineeringWorkspace
                key={resetKey}
                state={state}
                update={update}
              />
            )}
            {slug === "sociology" && (
              <SociologyWorkspace
                key={resetKey}
                state={state}
                update={update}
              />
            )}
            {slug === "public-policy" && (
              <PolicyWorkspace key={resetKey} state={state} update={update} />
            )}
          </div>
          <div className="editor-toolbar">
            <button
              className="button primary"
              disabled={task.busy}
              onClick={save}
            >
              <Save size={17} />
              Сохранить работу
            </button>
            <button
              className="button secondary"
              onClick={() => setFeedback(checkProject(slug, state))}
            >
              Проверить условия <CheckCircle2 size={17} />
            </button>
            <button
              className="button quiet"
              onClick={() => {
                setState(structuredClone(initialState));
                setFeedback(null);
                setResetKey((key) => key + 1);
              }}
            >
              <RotateCcw size={15} />К исходному плану
            </button>
          </div>
          <Feedback task={task} />
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
          {saved && (
            <section className="artifact-summary">
              <div className="result-title">
                <LayoutGrid size={18} />
                {p.artifact} · версия {revision}
              </div>
              <h3>Ты уже сделал первый ход.</h3>
              <p className="subtle">В сохранённой работе изменено:</p>
              <ul>
                {(changesBetween(slug, initialState, saved).length
                  ? changesBetween(slug, initialState, saved)
                  : ["Исходный план сохранён для дальнейшей работы"]
                ).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p style={{ fontSize: 13 }}>
                Ты попробовал:{" "}
                {checkProject(slug, saved).actions.join(", ").toLowerCase()}.
                Эти действия связаны с дисциплинами: {p.disciplines.join(", ")}.
              </p>
              <details className="versions">
                <summary>Как продолжить с D.R.I.V.E.</summary>
                <p>
                  Проверь предположение по материалам, примени обратную связь,
                  учти контекст аудитории, объясни выбор команде и заверши
                  изменение. Это способы работы, которые можно попробовать, а не
                  оценка личности.
                </p>
              </details>
              <div className="row" style={{ marginTop: 20 }}>
                <Link
                  className="button dark"
                  href={authenticated ? "/my" : "/login?mode=register&next=/my"}
                >
                  {authenticated ? "Открыть мой путь" : "Сохранить в аккаунте"}
                  <ArrowUpRight size={18} />
                </Link>
                <Link className="text-link" href={"/programs/" + slug}>
                  Что изучают на программе <ArrowRight size={16} />
                </Link>
              </div>
              {!authenticated && (
                <p className="subtle" style={{ marginTop: 12 }}>
                  Работа уже сохранена для этого браузера. Аккаунт позволит
                  вернуться с другого устройства.
                </p>
              )}
            </section>
          )}
          {versions.length > 0 && (
            <details className="versions">
              <summary>
                Исходная работа и история изменений · {versions.length}
              </summary>
              {versions.map((v) => (
                <details className="version-row" key={v.id}>
                  <summary>
                    Версия {v.revision} ·{" "}
                    {v.revision === 0
                      ? "Исходный план"
                      : dateLabel(v.createdAt)}
                  </summary>
                  <pre>
                    {describeWork(slug, v.state as unknown as ProjectState)}
                  </pre>
                </details>
              ))}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
