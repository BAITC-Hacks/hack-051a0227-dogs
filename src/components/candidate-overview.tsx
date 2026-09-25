"use client";
import "./candidate-overview.css";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  FileCheck2,
  FileText,
  Heart,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import type { myData } from "@/lib/data";
import type { TreeView } from "@/lib/development-tree.server";
import { branches, treeHref } from "@/lib/development-tree";
import { programFor } from "@/lib/catalog";
import { workHref, workTitle, versionCompleted } from "@/lib/journey";
import { dateLabel } from "@/lib/client";
import { missions } from "@/lib/missions";
import { resourceTypes } from "@/lib/learning-resources";
import { PathPointMark } from "./path-point-mark";
import { SkillMark } from "./skill-mark";
import { InteractiveProfile } from "./interactive-profile";

type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
type View = "overview" | "projects" | "route" | "university" | "profile";
type Primary = { title: string; body: string; label: string; href: string };

export function SupportBanner() {
  return (
    <aside className="overview-support">
      <Sparkles size={25} aria-hidden="true" />
      <div>
        <strong>
          Твоё развитие —<br />
          наша поддержка
        </strong>
        <p>
          Практика, новые идеи и поддержка
          <br className="wide-only" /> на каждом шаге.
        </p>
      </div>
      <Image
        src="/images/invision/overview/student-320.webp"
        alt=""
        width={320}
        height={326}
        className="overview-student"
      />
      <span className="overview-motto" aria-hidden="true">
        Больше
        <br />
        чем образование
        <Heart size={24} />
      </span>
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
  const materials = nodes
    .filter((n) => n.resource)
    .filter(
      (n, i, a) => a.findIndex((x) => x.resource?.id === n.resource?.id) === i,
    )
    .slice(0, 3);
  const definition = work ? missions[work.slug] : null;
  const context = nodes.find((n) => n.id === "context");
  const skillCards: {
    id: (typeof branches)[number]["id"];
    title: string;
    intro: string;
    nodes: TreeView["nodes"];
    next: TreeView["nodes"][number];
  }[] = branches
    .map((b) => ({
      ...b,
      nodes: nodes.filter((n) => n.branch === b.id && n.id !== "context"),
    }))
    .filter((b) => b.nodes.length)
    .slice(0, context ? 3 : 4)
    .map((b) => ({
      ...b,
      next: b.nodes.find((n) => !n.evidence) ?? b.nodes[0],
    }));
  if (context)
    skillCards.push({
      id: "ideas",
      title: "Новый контекст",
      intro: "Применяй знакомый принцип в новых условиях.",
      nodes: [context],
      next: context,
    });
  const interviewQuestion = important
    ? "Как лучше рассказать о моей работе на интервью?"
    : "Какой следующий шаг выбрать для моей работы?";
  const guide = tree.nodes.find(
    (n) => n.resource?.id === "video-guide",
  )?.resource;
  const [chat, setChat] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogTitle = useId();
  useEffect(() => {
    if (chat !== null || reading || filesOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [chat, reading, filesOpen]);
  function openChat(question = "") {
    returnFocus.current = document.activeElement as HTMLElement;
    setChat(question);
  }
  function openReading() {
    returnFocus.current = document.activeElement as HTMLElement;
    setReading(true);
  }
  function openFiles() {
    returnFocus.current = document.activeElement as HTMLElement;
    setFilesOpen(true);
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
  return (
    <div className="reference-overview overview-v2">
      <div className="overview-lead-grid">
        <section
          className="overview-card overview-next"
          aria-label="Следующее важное действие"
        >
          <div className="overview-next-surface">
            <span className="overview-task-mark">
              <FileCheck2 size={29} aria-hidden="true" />
            </span>
            <div className="overview-next-copy">
              <span className="overview-kicker">
                {needsAnswer
                  ? "Нужен твой ответ"
                  : important
                    ? "Следующий шаг по заявке"
                    : "Следующий шаг"}
              </span>
              <h2>{primary.title}</h2>
              <p className="overview-primary-description">{primary.body}</p>
              <div className="overview-next-actions">
                <Link
                  className="button primary"
                  href={primary.href}
                  onClick={follow}
                >
                  {primary.label}
                  <ArrowRight size={18} />
                </Link>
                <button
                  className="overview-all-tasks"
                  onClick={() => navigate(important ? "university" : "route")}
                >
                  {important ? "Все сообщения" : "Все мои задачи"}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
            <div className="overview-checklist-art" aria-hidden="true">
              <Image
                src="/images/invision/overview-v2/checklist-720.webp"
                alt=""
                width={720}
                height={960}
                sizes="(max-width: 700px) 160px, 270px"
              />
              <span className="overview-paper-note">
                Маленькие
                <br />
                шаги —<br />
                большие
                <br />
                перемены <Heart size={15} />
              </span>
            </div>
          </div>
        </section>
        <div className="overview-side">
          <section className="overview-card overview-progress">
            <div className="overview-card-heading">
              <h2>Мой прогресс</h2>
              <button
                className="overview-link"
                onClick={() => navigate("profile")}
              >
                Детали
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
                  <ChartNoAxesColumnIncreasing size={25} />
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
          <section className="overview-card overview-coach">
            <h2>
              <Sparkles size={26} aria-hidden="true" />
              Vision · AI-наставник
            </h2>
            <p>Задай вопрос о своей работе и выбери, как двигаться дальше.</p>
            <button
              className="overview-featured-question"
              onClick={() => openChat(interviewQuestion)}
            >
              <span>{interviewQuestion}</span>
              <span className="overview-send">
                <ArrowRight size={20} />
              </span>
            </button>
          </section>
        </div>
      </div>
      <section className="overview-card overview-skill-summary">
        <div className="overview-card-heading">
          <h2>Древо навыков — твой рост в действии</h2>
          <Link className="overview-link" href={treeHref()}>
            Перейти в древо
            <ArrowRight size={16} />
          </Link>
        </div>
        <p className="overview-section-description">
          Твои сохранённые практики в направлении «
          {programFor(tree.programSlug)?.shortTitle}». Выбери навык, чтобы
          увидеть работу и следующий шаг.
        </p>
        <div
          className="overview-skill-grid"
          style={{ "--skill-columns": skillCards.length } as CSSProperties}
        >
          {skillCards.map((b) => {
            const count = b.nodes.filter((n) => n.evidence).length;
            return (
              <Link
                className="overview-skill"
                key={b.next.id}
                href={treeHref(b.next.id)}
              >
                {b.next.id === "context" ? (
                  <span className="skill-mark skill-context">
                    <ChartNoAxesColumnIncreasing size={27} />
                  </span>
                ) : (
                  <SkillMark branch={b.id} />
                )}
                <div className="overview-skill-value">
                  <h3>{b.title}</h3>
                  <div
                    className="overview-skill-meter"
                    aria-label={`${count} из ${b.nodes.length} практик выполнено`}
                  >
                    <span>
                      <i
                        style={{ width: `${(count / b.nodes.length) * 100}%` }}
                      />
                    </span>
                    <small>
                      {count}/{b.nodes.length}
                    </small>
                  </div>
                </div>
                <p>{b.intro}</p>
              </Link>
            );
          })}
        </div>
      </section>
      <div className="overview-work-grid">
        <section className="overview-card overview-project">
          <div className="overview-card-heading">
            <h2>{work ? "Текущий проект" : "Твоя первая работа"}</h2>
            <button
              className="overview-link"
              onClick={() => navigate("projects")}
            >
              Все проекты
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="overview-project-content">
            <div className="overview-project-copy">
              <div className="overview-project-title">
                <span className="overview-icon lime">
                  <FileText size={27} />
                </span>
                <h3>
                  {work
                    ? workTitle(work, programFor(work.slug)!.action)
                    : "Сервис обмена учебниками"}
                </h3>
                <span className="overview-work-status">
                  {!work
                    ? "Можно начать"
                    : versionCompleted(work, work.versions[0])
                      ? "Сохранено"
                      : "В работе"}
                </span>
              </div>
              {work && (
                <p className="overview-project-date">
                  <CalendarDays size={15} />
                  Обновлено {dateLabel(work.updatedAt)} · версия {work.revision}
                </p>
              )}
              <p className="overview-project-description">
                {definition?.goal ??
                  "Построй путь от поиска книги до передачи и проверь своё решение."}
              </p>
              <Link
                className="button secondary"
                href={work ? workHref(work) : "/projects/digital-products"}
              >
                {work ? "Продолжить работу" : "Начать проект"}
                <ArrowRight size={18} />
              </Link>
            </div>
            <div className="overview-project-art" aria-hidden="true">
              <Image
                src="/images/invision/overview-v2/books-360.webp"
                alt=""
                width={360}
                height={480}
                sizes="(max-width:700px) 120px, 190px"
              />
              <span>
                Идеи
                <br />
                сегодня —<br />
                возможности
                <br />
                завтра <Heart size={11} />
              </span>
            </div>
          </div>
        </section>
        <section className="overview-card overview-resources">
          <div className="overview-card-heading">
            <h2>Подборка материалов</h2>
            <button className="overview-link" onClick={openReading}>
              Все материалы
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="overview-resource-list">
            {materials.map((n, i) => (
              <a
                key={n.resource!.id}
                href={n.resource!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="overview-resource"
                title={n.resource!.reason}
              >
                <span
                  className={`overview-icon ${i === 0 ? "rose" : i === 1 ? "lime" : "blue"}`}
                >
                  {i === 1 ? <UsersRound size={27} /> : <BookOpen size={27} />}
                </span>
                <div>
                  <span className="overview-resource-topic">
                    {branches.find((b) => b.id === n.branch)?.title ??
                      "Для развития"}
                  </span>
                  <h3>{n.resource!.title}</h3>
                  <p>
                    {n.resource!.author} · {resourceTypes[n.resource!.type]} ·{" "}
                    {n.resource!.language.toUpperCase()}
                  </p>
                </div>
                <span className="overview-round-link">
                  <ArrowRight size={16} />
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
      <section className="overview-useful">
        <h2>Полезно для поступления</h2>
        <div className="overview-useful-grid">
          <a
            href="https://www.invisionu.education/ru"
            target="_blank"
            rel="noopener noreferrer"
            className="overview-useful-card"
          >
            <span className="overview-icon lime">
              <Building2 size={27} />
            </span>
            <span>
              <strong>Университет</strong>
              <small>
                Программы и возможности
                <br />
                inVision U для тебя.
              </small>
            </span>
            <span className="overview-round-link">
              <ArrowRight size={16} />
            </span>
          </a>
          <button className="overview-useful-card" onClick={openFiles}>
            <span className="overview-icon blue">
              <FileText size={27} />
            </span>
            <span>
              <strong>Материалы к заявке</strong>
              <small>
                Посмотри, что уже сохранено,
                <br />и подготовь следующий материал.
              </small>
            </span>
            <span className="overview-round-link">
              <ArrowRight size={16} />
            </span>
          </button>
          {guide ? (
            <a
              className="overview-useful-card"
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="overview-icon lime">
                <UsersRound size={27} />
              </span>
              <span>
                <strong>Как рассказать о своём опыте</strong>
                <small>
                  Советы inVision U<br />
                  для подготовки видео.
                </small>
              </span>
              <span className="overview-round-link">
                <ArrowRight size={16} />
              </span>
            </a>
          ) : (
            <button
              className="overview-useful-card"
              onClick={() => navigate("university")}
            >
              <span className="overview-icon lime">
                <UsersRound size={27} />
              </span>
              <span>
                <strong>Связь с университетом</strong>
                <small>
                  Заявка, сообщения
                  <br />и следующие шаги.
                </small>
              </span>
              <span className="overview-round-link">
                <ArrowRight size={16} />
              </span>
            </button>
          )}
        </div>
      </section>
      <aside className="overview-closing">
        <span className="overview-closing-note" aria-hidden="true">
          Ты развиваешься
          <br />и это видно <Heart size={23} />
        </span>
        <div>
          <h2>Двигаемся дальше?</h2>
          <p>
            Продолжай выполнять задания, пробуй новые направления
            <br className="wide-only" /> и собирай свои работы. Мы рядом на
            каждом шаге.
          </p>
        </div>
        <Link className="button" href={treeHref(next.id)}>
          Посмотреть возможности
          <ArrowRight size={18} />
        </Link>
      </aside>
      <dialog
        ref={dialog}
        aria-labelledby={dialogTitle}
        className={`overview-dialog ${reading ? "reading-dialog" : ""}`}
        onCancel={close}
        onClose={() => {
          if (chat !== null || reading || filesOpen) close();
        }}
      >
        <header>
          <h2 id={dialogTitle}>
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
