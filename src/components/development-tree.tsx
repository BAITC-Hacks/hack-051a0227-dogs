"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { SkillMark } from "./skill-mark";
import { PathPointMark } from "./path-point-mark";
import { PersonalDevelopmentPlan } from "./interactive-profile";
import { Check, Circle, CircleDot } from "lucide-react";
import { Feedback, useTask } from "./ui";
export function DevelopmentTree({
  initial,
  full = false,
  selectedId,
  embedded = false,
}: {
  initial: TreeView;
  embedded?: boolean;
  full?: boolean;
  selectedId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState(selectedId ?? initial.currentId);
  const [program, setProgram] = useState(
    initial.nodes.find((n) => n.id === selectedId)?.slug ?? initial.programSlug,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const queryNode = useSearchParams().get("node");
  useEffect(() => {
    const target = initial.nodes.find((n) => n.id === queryNode);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      setSelected(target.id);
      setProgram(target.slug);
    });
    return () => cancelAnimationFrame(frame);
  }, [queryNode, initial.nodes]);

  const visible = view.nodes.filter((n) => n.slug === program);
  const node = visible.find((n) => n.id === selected) ?? visible[0];
  const availableBranches = branches.filter((b) =>
    visible.some((n) => n.branch === b.id),
  );
  const [showAll, setShowAll] = useState(true);
  const done = visible.filter((n) => n.evidence).length;
  async function reload() {
    setView(await action<TreeView>("tree.view"));
    router.refresh();
  }
  function choose(id: string) {
    setSelected(id);
    window.history.replaceState(null, "", treeHref(id));
  }
  if (!full)
    return (
      <section className="tree-summary">
        <div>
          <p className="eyebrow">Древо навыков</p>
          <h2>{node.title}</h2>
          <p>{node.purpose}</p>
        </div>
        <Link className="button secondary" href={treeHref(node.id)}>
          Открыть практику
        </Link>
      </section>
    );
  return (
    <div className="development-tree skills-layout">
      {!embedded && (
        <Link className="text-link" href="/my">
          Мой путь
        </Link>
      )}
      <section className="skills-map-panel">
        <header className="skills-heading">
          <div>
            <h2>Древо навыков</h2>
            <p>Выбери навык, выполни практику и сохрани результат.</p>
          </div>
          <details>
            <summary>Как это работает</summary>
            <p>
              Ветки связаны с учебными задачами выбранного направления. Отметки
              подтверждают выполненные действия, а не уровень владения навыком.
              Рекомендации комиссии появляются после публикации.
            </p>
          </details>
        </header>
        <div className="skills-program">
          <label>
            Направление
            <select
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                const n =
                  view.nodes.find(
                    (n) => n.slug === e.target.value && !n.evidence,
                  ) ?? view.nodes.find((n) => n.slug === e.target.value)!;
                choose(n.id);
              }}
            >
              {view.programs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div>
            <strong>
              {done} из {visible.length}
            </strong>
            <span>практик с результатом</span>
          </div>
        </div>
        <p className="subtle">
          {program === view.programSlug
            ? view.programBasis
            : "Ты просматриваешь другое направление. Программа заявки сохраняется."}
        </p>
        <div className="skill-branch-tabs" aria-label="Ветки навыков">
          <button
            type="button"
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
          >
            Все навыки
          </button>
          {availableBranches.map((b) => (
            <button
              type="button"
              key={b.id}
              aria-pressed={!showAll && node.branch === b.id}
              onClick={() => {
                setShowAll(false);
                choose(
                  visible.find((n) => n.branch === b.id && !n.evidence)?.id ??
                    visible.find((n) => n.branch === b.id)!.id,
                );
              }}
            >
              <SkillMark branch={b.id} />
              <span>{b.title}</span>
            </button>
          ))}
        </div>
        <div className="skill-tree-map">
          {availableBranches
            .filter((b) => showAll || b.id === node.branch)
            .map((branch) => (
              <section className="skill-tree-branch" key={branch.id}>
                <div className="skill-branch-heading">
                  <SkillMark branch={branch.id} />
                  <div>
                    <h3>{branch.title}</h3>
                    <p>{branch.intro}</p>
                  </div>
                </div>
                <ol className="skill-path">
                  {visible
                    .filter((n) => n.branch === branch.id)
                    .map((n, index) => (
                      <li key={n.id} className={n.evidence ? "complete" : ""}>
                        <span className="skill-path-step">
                          {index === 0
                            ? "Основа"
                            : n.id === "context"
                              ? "Новый контекст"
                              : "Практика"}
                        </span>
                        <button
                          id={`skill-node-${n.id}`}
                          className={`skill-node ${n.id === node.id ? "selected" : ""}`}
                          aria-pressed={n.id === node.id}
                          onClick={() => {
                            choose(n.id);
                            requestAnimationFrame(() => {
                              heading.current?.focus({ preventScroll: true });
                              if (
                                window.matchMedia("(max-width:1180px)").matches
                              )
                                heading.current?.scrollIntoView({
                                  block: "start",
                                  behavior: "instant",
                                });
                            });
                          }}
                        >
                          <span className="skill-node-state">
                            {n.evidence ? (
                              <Check size={18} />
                            ) : n.step ? (
                              <CircleDot size={18} />
                            ) : (
                              <Circle size={18} />
                            )}{" "}
                            {n.evidence
                              ? "Выполнено"
                              : n.step
                                ? "В работе"
                                : "Можно начать"}
                          </span>
                          <strong>{n.title}</strong>
                          <span className="path-points">
                            <PathPointMark />
                            {n.evidence
                              ? "Результат сохранён"
                              : "+5 за практику"}
                          </span>
                        </button>
                      </li>
                    ))}
                </ol>
              </section>
            ))}
        </div>
        <p className="skills-legend">
          <Check size={16} /> Выполнено <CircleDot size={16} /> В работе{" "}
          <Circle size={16} /> Доступно
        </p>
        {!!view.publications.length && (
          <section className="skills-publication">
            <p className="eyebrow">Опубликовано комиссией</p>
            <h3>Продолжение по твоей заявке</h3>
            <p>Разбери рекомендацию и сохрани личную подготовку.</p>
            <Link
              className="text-link"
              href="/my?view=university#published-feedback"
            >
              Открыть обратную связь
            </Link>
            <PersonalDevelopmentPlan
              feedbackId={view.publications[0].key.replace("publication:", "")}
            />
          </section>
        )}
      </section>
      <aside className="skills-detail">
        <button
          className="text-link skills-back"
          onClick={() => {
            const item = document.getElementById(`skill-node-${node.id}`);
            item?.focus({ preventScroll: true });
            item?.scrollIntoView({ block: "center", behavior: "instant" });
          }}
        >
          К дереву навыков
        </button>
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
      </aside>
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
            : n.previous &&
                treeNodes.find((x) => x.id === n.previous)?.slug === n.slug
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
            {treeNodes.find(
              (x) => x.previous === n.id && x.slug === n.slug,
            ) && (
              <p>
                Можно продолжить:{" "}
                <Link
                  className="text-link"
                  href={treeHref(
                    treeNodes.find(
                      (x) => x.previous === n.id && x.slug === n.slug,
                    )!.id,
                  )}
                >
                  {
                    treeNodes.find(
                      (x) => x.previous === n.id && x.slug === n.slug,
                    )!.title
                  }
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
        <p className="eyebrow">Что почитать и изучить</p>
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
