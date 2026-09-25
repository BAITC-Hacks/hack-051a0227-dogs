"use client";
import "./candidate-overview.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  CircleDot,
  FileCheck2,
  FileText,
  Lightbulb,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import type { myData } from "@/lib/data";
import type { TreeView } from "@/lib/development-tree.server";
import { branches, treeHref } from "@/lib/development-tree";
import { programFor } from "@/lib/catalog";
import { workHref, workTitle, versionCompleted } from "@/lib/journey";
import { dateLabel } from "@/lib/client";
import { missions, readMission } from "@/lib/missions";
import { resourceTypes } from "@/lib/learning-resources";
import { PathPointMark } from "./path-point-mark";
import { SkillMark } from "./skill-mark";
import { InteractiveProfile } from "./interactive-profile";

const practiceLabels: Record<string, string> = {
  frame: "Первая проблема",
  listen: "Диалог с командой",
  delegate: "Поручения в команде",
  respond: "Новые условия",
  test: "Проверка маршрута",
  context: "Новый контекст",
  service: "Завершение сервиса",
  hypothesis: "Проверка гипотезы",
  evidence: "Работа с фактами",
  constraints: "Учёт ограничений",
  tradeoff: "Выбор компромисса",
  revise: "Пересмотр плана",
  compare: "Сравнение версий",
  media: "Проверяемый репортаж",
  engineering: "Работающая схема",
};
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
type View = "overview" | "projects" | "route" | "university" | "profile";
type Primary = { title: string; body: string; label: string; href: string };
export function SupportBanner({ small = false }: { small?: boolean }) {
  return (
    <aside className={`overview-support ${small ? "small" : ""}`}>
      {!small && <Sparkles size={21} aria-hidden="true" />}
      <div>
        <strong>
          {small
            ? "Большие цели начинаются с маленьких шагов"
            : "Твоё развитие — наша поддержка"}
        </strong>
        <p>
          {small
            ? "Продолжай пробовать и находить своё."
            : "Практика, новые идеи и поддержка на каждом шаге."}
        </p>
      </div>
      <Image
        src="/images/invision/overview/student-320.webp"
        alt=""
        width={320}
        height={326}
        className="overview-student"
      />
      {!small && (
        <span className="overview-motto" aria-hidden="true">
          Большие цели
          <br />
          начинаются
          <br />с маленьких
          <br />
          шагов
        </span>
      )}
    </aside>
  );
}
export function CandidateOverview({
  data,
  tree,
  primary,
  important,
  needsAnswer,
  navigate,
}: {
  data: Data;
  tree: TreeView;
  primary: Primary;
  important: boolean;
  needsAnswer: boolean;
  navigate: (view: View, hash?: string) => void;
}) {
  const { attempts, application: app } = data;
  const work =
    attempts.find((a) => !versionCompleted(a, a.versions[0])) ??
    attempts.find((a) => a.interest === "MORE") ??
    attempts[0];
  const completed = attempts.filter((a) =>
    a.versions.some((v) => versionCompleted(a, v)),
  );
  const nodes = tree.nodes.filter((n) => n.slug === tree.programSlug);
  const done = nodes.filter((n) => n.evidence);
  const next = tree.nodes.find((n) => n.id === tree.currentId)!;
  const available = nodes.filter((n) => !n.evidence);
  const materials = tree.nodes
    .filter((n) => n.resource && n.slug === tree.programSlug)
    .filter(
      (n, i, a) => a.findIndex((x) => x.resource?.id === n.resource?.id) === i,
    )
    .slice(0, 3);
  const mission = work
    ? readMission(work.versions[0]?.state ?? work.state)
    : null;
  const definition = work ? missions[work.slug] : null;
  const [chat, setChat] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (chat !== null || reading || filesOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [chat, reading, filesOpen]);
  function openChat(question = "") {
    returnFocus.current = document.activeElement as HTMLElement;
    setChat(question);
  }
  function close() {
    setChat(null);
    setReading(false);
    setFilesOpen(false);
    returnFocus.current?.focus();
  }
  function follow(e: React.MouseEvent<HTMLAnchorElement>) {
    if (primary.href.startsWith("#")) {
      e.preventDefault();
      navigate("university", primary.href);
    }
  }
  const skillCards = branches.map((b) => {
    const group = nodes.filter((n) => n.branch === b.id);
    const fallback = tree.nodes.filter((n) => n.branch === b.id);
    const use = group.length ? group : fallback;
    return {
      id: b.id,
      title: b.title,
      nodes: use,
      next: use.find((n) => !n.evidence) ?? use[0],
    };
  });
  const context = tree.nodes.find((n) => n.id === "context")!;
  const prompts = [
    "Как объяснить выбор в моей работе?",
    "Что попробовать в следующей версии?",
    "Какая практика поможет продолжить?",
  ];
  return (
    <div className="reference-overview">
      <div className="overview-top">
        <section
          className="overview-card overview-next"
          aria-label="Следующее важное действие"
        >
          <div className="overview-next-surface">
            <div className="overview-next-title">
              <span className="overview-task-mark">
                <FileCheck2 size={31} />
              </span>
              <div>
                <span className="overview-kicker">
                  {important
                    ? "Следующий шаг по заявке"
                    : "Следующий шаг в развитии"}
                </span>
                <h2>{primary.title}</h2>
              </div>
            </div>
            <p className="overview-primary-description">{primary.body}</p>
            <Image
              className="overview-checklist"
              src="/images/invision/overview/checklist-320.webp"
              alt=""
              width={320}
              height={320}
            />
            <div className="overview-next-actions">
              <Link
                className="button primary"
                href={primary.href}
                onClick={follow}
              >
                {primary.label}
              </Link>
              <button
                className="overview-link"
                onClick={() => navigate(important ? "university" : "route")}
              >
                {important ? "Все сообщения" : "Выбрать практику"}
                <ArrowRight size={16} />
              </button>
            </div>
            {needsAnswer && (
              <span className="overview-response-tag">Нужен твой ответ</span>
            )}
          </div>
        </section>
        <section className="overview-card overview-plan">
          <div className="overview-card-heading">
            <h2>Твой план развития — кратко</h2>
            <Link className="overview-link" href={treeHref(next.id)}>
              Полный план
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="overview-plan-grid">
            <div>
              <h3>
                <span className="overview-icon mint">
                  <Trophy size={23} />
                </span>
                Твои результаты
              </h3>
              <ul>
                {done.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Check size={13} />
                    <Link href={n.evidence!.href} title={n.title}>
                      {practiceLabels[n.id] ?? n.title}
                    </Link>
                  </li>
                ))}
                {!done.length && (
                  <li>
                    <CircleDot size={13} />
                    <span>Выбери первую практику</span>
                  </li>
                )}
              </ul>
              <p>Опирайся на сохранённые работы и свой опыт.</p>
            </div>
            <div>
              <h3>
                <span className="overview-icon peach">
                  <ChartNoAxesColumnIncreasing size={23} />
                </span>
                Для развития
              </h3>
              <ul>
                {available.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <CircleDot size={13} />
                    <Link href={treeHref(n.id)} title={n.title}>
                      {practiceLabels[n.id] ?? n.title}
                    </Link>
                  </li>
                ))}
                {!available.length && (
                  <li>
                    <Check size={13} />
                    <span>Все практики направления выполнены</span>
                  </li>
                )}
              </ul>
              <p>Попробуй следующий шаг в выбранном направлении.</p>
            </div>
            <div>
              <h3>
                <span className="overview-icon blue">
                  <Target size={23} />
                </span>
                Рекомендуем
              </h3>
              <Link
                href={treeHref(next.id)}
                className="overview-plan-recommend"
              >
                <span className="overview-dot">✓</span>
                {next.title}
              </Link>
              <p>
                {programFor(tree.programSlug)?.shortTitle}. Начни с конкретной
                задачи.
              </p>
            </div>
          </div>
        </section>
        <section className="overview-card overview-progress">
          <div className="overview-card-heading">
            <h2>Твой прогресс</h2>
            <button
              className="overview-link"
              onClick={() => navigate("profile")}
            >
              Начисления
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="overview-progress-main">
            <div
              className="overview-ring"
              style={
                {
                  "--progress": `${nodes.length ? (done.length / nodes.length) * 100 : 0}%`,
                } as CSSProperties
              }
              aria-label={`${done.length} из ${nodes.length} практик выполнено`}
            >
              <strong>
                {done.length}
                <span>/{nodes.length}</span>
              </strong>
            </div>
            <div>
              <h3>
                {done.length
                  ? "Практика даёт результат"
                  : "Начни с одной практики"}
              </h3>
              <p>
                {done.length
                  ? `Сохранены результаты ${done.length} из ${nodes.length} практик направления.`
                  : "Выполни задачу и сохрани свою работу."}
              </p>
            </div>
          </div>
          <div className="overview-progress-facts">
            <button onClick={() => navigate("profile")}>
              <PathPointMark />
              <strong>
                {data.progress.total}
                <span>поинтов</span>
              </strong>
              <small>За работы и практики</small>
            </button>
            <button onClick={() => navigate("projects")}>
              <span className="overview-icon peach">
                <ChartNoAxesColumnIncreasing size={23} />
              </span>
              <strong>
                {completed.length}
                <span>
                  {completed.length === 1
                    ? "проект"
                    : completed.length > 1 && completed.length < 5
                      ? "проекта"
                      : "проектов"}
                </span>
              </strong>
              <small>В твоей коллекции</small>
            </button>
          </div>
        </section>
      </div>
      <div className="overview-bottom">
        <div className="overview-learning-column">
          <section className="overview-card overview-skill-summary">
            <div className="overview-card-heading">
              <h2>Древо навыков — рост в действии</h2>
              <Link className="overview-link" href={treeHref()}>
                Перейти в древо
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="overview-skill-grid">
              {[
                ...skillCards,
                {
                  id: "context",
                  title: "Новый контекст",
                  nodes: [context],
                  next: context,
                },
              ].map((b) => {
                const count = b.nodes.filter((n) => n.evidence).length;
                return (
                  <Link
                    key={b.id}
                    href={treeHref(b.next.id)}
                    className="overview-skill"
                  >
                    <SkillMark branch={b.id} />
                    <div>
                      <strong>{b.title}</strong>
                      <div className="overview-skill-meter">
                        <span>
                          <i
                            style={{
                              width: `${(count / b.nodes.length) * 100}%`,
                            }}
                          />
                        </span>
                        <small>
                          {count}/{b.nodes.length}
                        </small>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <p className="overview-meter-note">
              Выполненные практики, подтверждённые сохранённой работой.
            </p>
          </section>
          <section className="overview-card overview-resources">
            <div className="overview-card-heading">
              <h2>Рекомендуем почитать и изучить</h2>
              <button
                className="overview-link"
                onClick={() => {
                  returnFocus.current = document.activeElement as HTMLElement;
                  setReading(true);
                }}
              >
                Все материалы
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="overview-resource-grid">
              {materials.map((n, i) => (
                <article key={n.resource!.id}>
                  <div className="overview-resource-title">
                    <span
                      className={`overview-icon ${i === 0 ? "rose" : i === 1 ? "blue" : "mint"}`}
                    >
                      <BookOpen size={25} />
                    </span>
                    <div>
                      <h3>
                        <a
                          href={n.resource!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {n.resource!.title}
                        </a>
                      </h3>
                      <p>{n.resource!.author}</p>
                    </div>
                  </div>
                  <span className="overview-resource-type">
                    {resourceTypes[n.resource!.type]} ·{" "}
                    {n.resource!.language.toUpperCase()}
                  </span>
                  <p className="overview-resource-reason">
                    {n.resource!.reason}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
        <section className="overview-card overview-project">
          <div className="overview-card-heading">
            <h2>Текущий проект</h2>
            <button
              className="overview-link"
              onClick={() => navigate("projects")}
            >
              Все проекты
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="overview-project-highlight">
            <div className="overview-project-title">
              <span className="overview-icon lime">
                <Lightbulb size={28} />
              </span>
              <h3>
                {work
                  ? workTitle(work, programFor(work.slug)!.action)
                  : "Сервис обмена учебниками"}
              </h3>
              <span className="overview-work-status">
                {work && versionCompleted(work, work.versions[0])
                  ? "Сохранено"
                  : "В работе"}
              </span>
            </div>
            {work && (
              <p className="overview-project-date">
                <CalendarDays size={14} />
                Обновлено {dateLabel(work.updatedAt)} · версия {work.revision}
              </p>
            )}
            <p>
              {definition?.goal ??
                "Построй путь от поиска книги до передачи и проверь своё решение."}
            </p>
            {mission?.plan.headline && (
              <p className="overview-project-result">{mission.plan.headline}</p>
            )}
            <Link
              className="button secondary"
              href={work ? workHref(work) : "/projects/digital-products"}
            >
              {work ? "Продолжить работу" : "Начать проект"}
            </Link>
          </div>
          <div className="overview-files">
            <h3>Твои материалы ({app?.materials.length ?? 0})</h3>
            {app?.materials.length ? (
              <ul>
                {app.materials.slice(0, 3).map((f, i) => (
                  <li key={f.id}>
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText
                        size={20}
                        className={i % 2 === 0 ? "file-red" : "file-blue"}
                      />
                      <span>{f.name}</span>
                      <time>
                        {new Date(f.createdAt).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </time>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="overview-files-empty">
                <FileText size={22} />
                <p>
                  Прикрепи материалы к заявке. Они останутся рядом с твоими
                  проектами.
                </p>
              </div>
            )}
          </div>
          <button
            className="overview-link overview-project-more"
            onClick={() => {
              returnFocus.current = document.activeElement as HTMLElement;
              setFilesOpen(true);
            }}
          >
            Открыть все материалы
            <ArrowRight size={16} />
          </button>
        </section>
        <div className="overview-coach-column">
          <section className="overview-card overview-coach">
            <div className="overview-card-heading">
              <h2>
                <Sparkles size={24} />
                Vision · AI-наставник
              </h2>
              <button className="overview-link" onClick={() => openChat()}>
                Задать вопрос
                <ArrowRight size={16} />
              </button>
            </div>
            <p>
              Обсуди свою работу, найди следующий шаг и подготовь объяснение
              решения.
            </p>
            <button
              className="overview-featured-question"
              onClick={() =>
                openChat("Как лучше рассказать о моей работе на интервью?")
              }
            >
              <span>Как лучше рассказать о моей работе на интервью?</span>
              <span className="overview-send">
                <ArrowRight size={20} />
              </span>
            </button>
            <span className="overview-other-questions">Попробуй спросить</span>
            <div className="overview-questions">
              {prompts.map((q) => (
                <button key={q} onClick={() => openChat(q)}>
                  {q}
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </section>
          <SupportBanner small />
        </div>
      </div>
      <dialog
        ref={dialog}
        className={`overview-dialog ${reading ? "reading-dialog" : ""}`}
        onCancel={close}
        onClose={() => {
          if (chat !== null || reading || filesOpen) close();
        }}
      >
        <header>
          <h2>
            {filesOpen
              ? "Твои материалы к заявке"
              : reading
                ? "Материалы для твоего развития"
                : "Vision · Твой AI-наставник"}
          </h2>
          <button className="icon-button" aria-label="Закрыть" onClick={close}>
            <X size={22} />
          </button>
        </header>
        {filesOpen && (
          <div className="overview-reading-detail overview-files">
            {app?.materials.length ? (
              <ul>
                {app.materials.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={20} />
                      <span>{f.name}</span>
                      <ArrowRight size={16} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>В этой заявке пока нет загруженных файлов.</p>
            )}
            <Link
              className="button secondary"
              href={app?.submittedAt ? "/apply/status" : "/apply"}
            >
              Открыть заявку
            </Link>
          </div>
        )}
        {chat !== null && (
          <InteractiveProfile
            key={chat}
            scope={work ? { attemptId: work.id } : {}}
            title="Разобрать текущую работу"
            initialOpen
            initialQuestion={chat}
          />
        )}{" "}
        {reading && (
          <div className="overview-reading-detail">
            {materials.map((n) => (
              <article key={n.resource!.id}>
                <h3>{n.resource!.title}</h3>
                <p>{n.resource!.author}</p>
                <p>{n.resource!.description}</p>
                <p>{n.resource!.reason}</p>
                <a
                  className="button secondary"
                  href={n.resource!.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть материал
                </a>
                <Link
                  className="overview-link"
                  onClick={close}
                  href={treeHref(n.id)}
                >
                  Применить в практике
                  <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
