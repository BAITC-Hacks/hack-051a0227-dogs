"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { action, dateLabel } from "@/lib/client";
import {
  branches,
  treeHref,
  treeStatus,
  treeNodes,
} from "@/lib/development-tree";
import { drive } from "@/lib/profile-contract";
import { programFor } from "@/lib/catalog";
import { resourceTypes } from "@/lib/learning-resources";
import type { TreeView, TreeNodeView } from "@/lib/development-tree.server";
import { Feedback, useTask } from "./ui";
export function DevelopmentTree({
  initial,
  full = false,
  selectedId,
}: {
  initial: TreeView;
  full?: boolean;
  selectedId?: string;
}) {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState(selectedId ?? initial.currentId);
  const heading = useRef<HTMLHeadingElement>(null);
  const node = view.nodes.find((n) => n.id === selected) ?? view.nodes[0];
  async function reload() {
    const v = await action<TreeView>("tree.view");
    setView(v);
  }
  if (!full) {
    const current = view.nodes.find((n) => n.id === view.currentId)!;
    return (
      <section className="tree-summary" aria-label="Дерево развития">
        <div>
          <p className="eyebrow">Личная практика</p>
          <h2>{current.step ? current.title : "Дерево развития"}</h2>
          <p>
            {current.step
              ? `${treeStatus[current.status]}. ${current.purpose}`
              : "Пять веток по реальным работам. Выбери материал, попробуй принцип и сохрани результат."}
          </p>
          {view.lastChange && (
            <p>Последнее действие · {dateLabel(view.lastChange)}</p>
          )}
        </div>
        <Link className="button secondary" href={treeHref(current.id)}>
          {current.step ? "Продолжить личный шаг" : "Выбрать практику"}
        </Link>
      </section>
    );
  }
  return (
    <div className="development-tree">
      <Link className="text-link" href="/my">
        Мой путь
      </Link>
      <header className="tree-heading">
        <p className="eyebrow">Личный маршрут</p>
        <h1>Развитие через работу</h1>
        <p>
          Выбери то, что хочется попробовать. Материал помогает разобраться,
          практика оставляет результат.
        </p>
        <p className="tree-boundary">
          Это виды практики, а не шкалы личности. Они не влияют на поступление.{" "}
          <Link href="/apply" className="text-link">
            Перейти к заявке
          </Link>
        </p>
      </header>
      <label className="tree-mobile-choice">
        Ветка практики
        <select
          value={node.branch}
          onChange={(e) => {
            const next = view.nodes.find((n) => n.branch === e.target.value)!;
            setSelected(next.id);
            window.history.replaceState(null, "", treeHref(next.id));
          }}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <a className="text-link tree-jump" href="#selected-practice">
        Открыть выбранный шаг: {node.title}
      </a>
      <div className="tree-map" aria-label="Пять веток практики">
        {branches.map((b, index) => (
          <section
            key={b.id}
            className={`tree-branch ${b.id === node.branch ? "current-branch" : ""}`}
          >
            <header>
              <span aria-hidden="true">0{index + 1}</span>
              <h2>{b.title}</h2>
              <p>{b.intro}</p>
            </header>
            <ol>
              {view.nodes
                .filter((n) => n.branch === b.id)
                .map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`tree-node ${n.id === node.id ? "selected" : ""}`}
                      aria-pressed={n.id === node.id}
                      onClick={() => {
                        setSelected(n.id);
                        window.history.replaceState(null, "", treeHref(n.id));
                        requestAnimationFrame(() => heading.current?.focus());
                      }}
                    >
                      <span>{n.title}</span>
                      <small>
                        {n.step?.state.skipped
                          ? "Отложено · можно вернуться"
                          : treeStatus[n.status]}
                      </small>
                    </button>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
      <h2
        id="selected-practice"
        className="tree-panel-title"
        tabIndex={-1}
        ref={heading}
      >
        {node.title}
      </h2>
      <NodePanel
        key={`${node.id}:${node.resource?.version}:${node.work?.revision}`}
        node={node}
        reload={reload}
      />
      <details className="tree-method">
        <summary>Как устроен маршрут и кто видит прогресс</summary>
        <p>
          Работы, чтение и личные заметки доступны только тебе. Передача версии
          в заявку по-прежнему требует отдельного подтверждения. Просмотр не
          измеряет навык; «изучено» — твоя отметка. Практика определяется
          сохранёнными действиями в упражнении.
        </p>
        <p>
          Связь упражнений с программами и D.R.I.V.E. — наша конфигурация{" "}
          {view.configVersion}. Это не официальная формула университета. Разница
          версий не доказывает обучаемость.
        </p>
      </details>
    </div>
  );
}
function NodePanel({
  node: n,
  reload,
}: {
  node: TreeNodeView;
  reload: () => Promise<void>;
}) {
  const task = useTask(),
    [note, setNote] = useState(n.step?.note ?? ""),
    [explanation, setExplanation] = useState<{
      text: string;
      resource: { url: string; title: string; version: number } | null;
      work: { href: string; revision: number } | null;
    } | null>(null),
    [player, setPlayer] = useState(false);
  async function run(
    type: string,
    extra: Record<string, unknown> = {},
    navigate = false,
  ) {
    await task.run(async () => {
      const result = await action<{ href?: string }>(type, {
        nodeId: n.id,
        revision: n.step?.revision,
        ...extra,
      });
      if (navigate && result.href) {
        window.location.assign(result.href);
        return;
      }
      await reload();
    });
  }
  return (
    <section className="tree-panel" aria-label={n.title}>
      <div className="tree-practice">
        <p className="eyebrow">{treeStatus[n.status]}</p>
        <p>{n.purpose}</p>
        <p>{n.basis}</p>
        <button
          className="text-link"
          disabled={task.busy}
          onClick={() =>
            task.run(async () =>
              setExplanation(await action("tree.explain", { nodeId: n.id })),
            )
          }
        >
          Почему предложен этот шаг?
        </button>
        {explanation && (
          <aside className="tree-explanation" aria-live="polite">
            <h3>Основания рекомендации</h3>
            <p>{explanation.text}</p>
            {explanation.resource && (
              <a
                className="text-link"
                href={explanation.resource.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {explanation.resource.title} · версия описания{" "}
                {explanation.resource.version}
              </a>
            )}
            {explanation.work && (
              <Link href={explanation.work.href} className="text-link">
                Связанная работа · версия {explanation.work.revision}
              </Link>
            )}
          </aside>
        )}
        <h3>Короткая практика</h3>
        <p>{n.practice}</p>
        <p>
          <strong>Подтверждение:</strong> {n.completion}
        </p>
        <p>
          {n.id === "context"
            ? "Нужен сохранённый результат сервиса: из него создаётся отдельная задача бронирования."
            : n.previous
              ? `Перед этим можно попробовать «${treeNodes.find((x) => x.id === n.previous)?.title}». Если уже знакомо — начни сразу с практики.`
              : "Предварительная подготовка не нужна. Материал можно прочитать до или после практики."}
        </p>
        {!n.step ? (
          <button
            className="button dark"
            disabled={task.busy}
            onClick={() => run("tree.start")}
          >
            Добавить в мой план
          </button>
        ) : (
          <div className="tree-actions">
            {n.workUnavailable ? (
              <>
                <p role="status">
                  Связанная работа больше недоступна. История шага сохранена без
                  её содержания.
                </p>
                <button
                  className="button secondary"
                  disabled={task.busy}
                  onClick={() => run("tree.rebind")}
                >
                  Выбрать другую работу
                </button>
              </>
            ) : (
              <button
                className="button dark"
                disabled={task.busy}
                onClick={() => run("tree.practice", {}, true)}
              >
                {n.work ? "Продолжить связанную работу" : "Начать практику"}
              </button>
            )}
            <button
              className="text-link"
              disabled={task.busy}
              onClick={() =>
                run("tree.skip", { skipped: !n.step!.state.skipped })
              }
            >
              {n.step.state.skipped
                ? "Вернуть в план"
                : "Отложить без потери работы"}
            </button>
          </div>
        )}
        {n.evidence && (
          <aside className="tree-evidence">
            <h3>Результат подтверждён работой</h3>
            <Link className="text-link" href={n.evidence.href}>
              Открыть результат · версия {n.evidence.revision}
            </Link>
            {n.evidence.older && (
              <p>
                У работы есть более новая версия. Этот результат относится к
                указанной сохранённой версии.
              </p>
            )}
            {n.evidence.changes.length > 0 ? (
              <>
                <p>От исходного варианта этого шага:</p>
                <ul>
                  {n.evidence.changes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Содержательных изменений от исходной версии этого шага не
                зафиксировано. Выполнение условия не означает улучшение
                качества.
              </p>
            )}
            <Link className="text-link" href={n.evidence.href}>
              Открыть версии и сравнение
            </Link>
            {treeNodes.find((x) => x.previous === n.id) && (
              <p>
                Можно продолжить:{" "}
                <Link
                  className="text-link"
                  href={treeHref(
                    treeNodes.find((x) => x.previous === n.id)!.id,
                  )}
                >
                  {treeNodes.find((x) => x.previous === n.id)!.title}
                </Link>
              </p>
            )}
          </aside>
        )}
        <p className="tree-program">
          Связь с деятельностью:{" "}
          <Link href={`/programs/${n.slug}`}>
            {programFor(n.slug)?.shortTitle}
          </Link>
          . Интерес выбираешь ты.
        </p>
        <p>{n.drive.map((k) => `${k} — ${drive[k].title}`).join(" · ")}</p>
      </div>
      <div className="tree-resource">
        <p className="eyebrow">Материал для этого шага</p>
        {n.resource ? (
          <>
            <p>
              {n.resource.origin === "INVISION"
                ? "Официальный материал inVision U"
                : n.resource.origin === "PARTNER"
                  ? "Материал указанного партнёра"
                  : "Внешний образовательный ресурс"}
            </p>
            <h3>{n.resource.title}</h3>
            <p>{n.resource.author}</p>
            <p>
              {resourceTypes[n.resource.type]} ·{" "}
              {n.resource.language.toUpperCase()} · проверено{" "}
              {n.resource.checkedAt}
            </p>
            <p>{n.resource.description}</p>
            <p>{n.resource.reason}</p>
            <a
              className="text-link"
              href={n.resource.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (n.step) void run("tree.open");
              }}
            >
              Открыть оригинал в новой вкладке
            </a>
            {n.resource.embedding === "YOUTUBE" && (
              <>
                <button
                  className="button secondary"
                  onClick={() => {
                    setPlayer(!player);
                    if (n.step) void run("tree.open");
                  }}
                >
                  {player ? "Закрыть плеер" : "Показать разрешённый плеер"}
                </button>
                {player && (
                  <iframe
                    title={n.resource.title}
                    src={n.resource.embedUrl}
                    loading="lazy"
                    allow="fullscreen; encrypted-media"
                    referrerPolicy="no-referrer"
                    allowFullScreen
                  />
                )}
                <p>
                  Если видео не воспроизводится, открой оригинал или начни
                  практику по её условиям.
                </p>
              </>
            )}
            {n.resource.type === "VIDEO" &&
              n.resource.embedding === "LINK_ONLY" && (
                <p>
                  Видео открывается у автора. Встраивание не подтверждено;
                  содержание обсуждается только по проверенному описанию.
                </p>
              )}
            {n.resourceUpdated && (
              <p>
                В каталоге есть новая версия описания. Твой шаг связан с версией{" "}
                {n.resource.version}; прежние отметки не переносятся
                автоматически.
              </p>
            )}
          </>
        ) : (
          <p role="status">
            Материал сейчас недоступен. Практику можно выполнить по условиям
            задания; читать недоступную ссылку не требуется.
          </p>
        )}
        {n.step && n.alternative && (!n.resource || n.resourceUpdated) && (
          <button
            className="button secondary"
            disabled={task.busy}
            onClick={() => run("tree.resource")}
          >
            Выбрать доступное описание · {n.alternative.title}
          </button>
        )}
        {n.step && n.resource && (
          <div className="tree-study">
            <label>
              Что попробуешь применить?
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
            </label>
            <button
              className="button secondary"
              disabled={task.busy || !n.step.state.openedAt}
              onClick={() => run("tree.study", { note })}
            >
              {n.step.state.studiedAt
                ? "Сохранить заметку"
                : "Отметить материал изученным"}
            </button>
            <p>
              {n.step.state.studiedAt
                ? "Ты отметил изучение. Практика подтверждается отдельно работой."
                : "Открой материал и запиши одну мысль. Само открытие не означает изучение или выполнение практики."}
            </p>
          </div>
        )}
        {n.step && (
          <details>
            <summary>История личного шага</summary>
            <p>Описание материала · версия {n.step.state.resourceVersion}</p>
            <ul>
              {n.step.state.events
                .filter((e) => e.kind !== "PRACTICE_REQUEST")
                .map((e, i) => (
                  <li key={i}>
                    {(
                      {
                        START: "Шаг выбран",
                        OPEN: "Материал открыт",
                        STUDY_SELF_REPORTED: "Изучение отмечено тобой",
                        PRACTICE: "Практика связана с работой",
                        RESOURCE_CHANGE: "Выбрана другая версия материала",
                        PAUSE: "Отложено",
                        RESUME: "Возвращено в план",
                        RESELECT_WORK: "Выбрана другая работа",
                      } as Record<string, string>
                    )[e.kind] ?? "Действие сохранено"}{" "}
                    · {dateLabel(e.at)}
                    {e.resourceVersion
                      ? ` · материал ${e.resourceVersion}`
                      : ""}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
      <Feedback task={task} />
    </section>
  );
}
