"use client";
import { PathPointMark } from "./path-point-mark";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Check, Circle, Flag, Sparkles } from "lucide-react";
import type { myData } from "@/lib/data";
import { programFor, stageLabels } from "@/lib/catalog";
import { unansweredQuestions } from "@/lib/message-state";
import { dateLabel } from "@/lib/client";
import { workHref, workTitle, versionCompleted } from "@/lib/journey";
import { applicationRequirements } from "@/lib/validation";
import type { ApplicationFields } from "@/lib/types";
import { branches, treeHref } from "@/lib/development-tree";
import type { TreeView } from "@/lib/development-tree.server";
import { PublishedFeedback } from "./published-feedback";
import { Messages } from "./messages";
import { Tag } from "./ui";
import { MilestoneMarks, WorkshopChoices } from "./journey-actions";
import { ProjectPassport } from "./project-passport";
import { InteractiveProfile } from "./interactive-profile";
import { DevelopmentTree } from "./development-tree";
import { AvatarEditor } from "./avatar-editor";
import { UserAvatar } from "./user-avatar";
import { SkillMark } from "./skill-mark";
import { resourceTypes } from "@/lib/learning-resources";
import Image from "next/image";
import { WorkPreview } from "./work-preview";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
const sections = {
  overview: "Обзор",
  projects: "Проекты",
  route: "Древо навыков",
  university: "Университет",
  profile: "Профиль",
} as const;
type Section = keyof typeof sections;
export function MyPath({
  data,
  tree,
  initialView = "overview",
  nodeId,
}: {
  data: Data;
  tree: TreeView;
  initialView?: string;
  nodeId?: string;
}) {
  const { user, attempts, application: app } = data;
  const [section, setSection] = useState<Section>(
    initialView in sections ? (initialView as Section) : "overview",
  );
  const panel = useRef<HTMLDivElement>(null);
  const queryString = useSearchParams().toString();
  function navigate(next: Section, hash = "") {
    setSection(next);
    window.history.pushState(
      null,
      "",
      (next === "overview" ? "/my" : `/my?view=${next}`) + hash,
    );
    requestAnimationFrame(() => {
      panel.current?.focus({ preventScroll: true });
      if (hash)
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ block: "start" });
    });
  }
  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href),
        hash = url.hash;
      const next =
        hash.startsWith("#work-") || hash === "#my-projects"
          ? "projects"
          : ["#application-messages", "#published-feedback"].includes(hash)
            ? "university"
            : url.searchParams.get("tree") === "1"
              ? "route"
              : (url.searchParams.get("view") ?? "overview");
      setSection(next in sections ? (next as Section) : "overview");
      if (hash)
        requestAnimationFrame(() =>
          document
            .getElementById(hash.slice(1))
            ?.scrollIntoView({ block: "nearest" }),
        );
    };
    const id = requestAnimationFrame(sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [queryString]);
  const pending = unansweredQuestions(app?.messages ?? []),
    needsAnswer = !!app?.submittedAt && pending.length > 0;
  const invitation = app?.stage === "INTERVIEW";
  const languageRequired = app?.stage === "LANGUAGE";
  const publishedQuestion =
    app?.stage === "CLARIFICATION" &&
    app.feedback[0] &&
    !app.messages.some(
      (m) =>
        m.author.role === "CANDIDATE" &&
        new Date(m.createdAt) > new Date(app.feedback[0].publishedAt!),
    );
  const unfinished = attempts.find((a) => !versionCompleted(a, a.versions[0]));
  const continuation =
    unfinished ?? attempts.find((a) => a.interest === "MORE") ?? attempts[0];
  const completed = attempts.filter((a) =>
    a.versions.some((v) => versionCompleted(a, v)),
  );
  const directions = new Set(
    completed.filter((a) => a.context === "WORKSHOP").map((a) => a.slug),
  );
  const routeNode = tree.nodes.find((n) => n.id === tree.currentId)!;
  const skillNodes = tree.nodes.filter((n) => n.slug === tree.programSlug);
  const materials = tree.nodes
    .filter((n) => n.resource && n.slug === tree.programSlug)
    .filter(
      (n, i, all) =>
        all.findIndex((x) => x.resource?.id === n.resource?.id) === i,
    )
    .slice(0, 3);
  const practiced = skillNodes.filter((n) => n.evidence);
  const requirements = app
    ? [
        { title: "Выбранная программа", complete: !!app.programSlug },
        ...applicationRequirements(
          app.fields as ApplicationFields,
          app.materials.map((m) => m.kind),
        ),
      ]
    : [];
  const important =
    needsAnswer ||
    invitation ||
    languageRequired ||
    publishedQuestion ||
    (!!app && !app.submittedAt);
  const primary = needsAnswer
    ? {
        title: "Комиссия ждёт твой ответ",
        body: pending.at(-1)!.body,
        label: "Ответить на уточнение",
        href: "#application-messages",
      }
    : languageRequired
      ? {
          title: "Комиссия просит проверить языковой ответ",
          body:
            app?.feedback[0]?.nextAction ??
            "Открой отдельную языковую проверку. Она не меняет результат твоих учебных работ.",
          label: "Открыть языковой ответ",
          href: "/apply/english",
        }
      : publishedQuestion
        ? {
            title: "Уточни материалы по обратной связи",
            body: app!.feedback[0].nextAction,
            label: "Открыть рекомендацию",
            href: "#published-feedback",
          }
        : invitation
          ? {
              title: "Подготовься к интервью",
              body:
                app?.feedback[0]?.nextAction ??
                "В приглашении сохранены время встречи и следующий шаг.",
              label: "Открыть приглашение",
              href: "/apply/status",
            }
          : app && !app.submittedAt
            ? {
                title: "Продолжи заявку",
                body: `Заполнено ${requirements.filter((r) => r.complete).length} из ${requirements.length} обязательных разделов. Работы из мастерских прикладываются по желанию.`,
                label: "Продолжить заявку",
                href: "/apply",
              }
            : continuation
              ? {
                  title: versionCompleted(
                    continuation,
                    continuation.versions[0],
                  )
                    ? "Твой результат можно развить"
                    : "Продолжи начатую работу",
                  body: workTitle(
                    continuation,
                    programFor(continuation.slug)!.action,
                  ),
                  label: versionCompleted(
                    continuation,
                    continuation.versions[0],
                  )
                    ? "Открыть результат"
                    : "Продолжить работу",
                  href: workHref(
                    continuation,
                    versionCompleted(continuation, continuation.versions[0])
                      ? continuation.revision
                      : undefined,
                  ),
                }
              : {
                  title: "Запусти обмен учебниками",
                  body: "Построй путь от поиска книги до её передачи и проверь, где студенту не хватает информации. В разделе проектов есть ещё четыре направления.",
                  label: "Открыть мини-практику",
                  href: "/projects/digital-products",
                };
  return (
    <div className="page wrap candidate-hub">
      <header className="hub-heading">
        <div className="hub-person">
          {user.role === "GUEST" ? (
            <UserAvatar size={72} />
          ) : (
            <AvatarEditor user={user} />
          )}
          <div>
            <p className="eyebrow">Мой путь</p>
            <h1>
              {user.role === "GUEST" ? "Попробуй. Найди своё." : user.name}
            </h1>
            <p>
              {attempts.length
                ? `Результатов: ${completed.length} · Направлений попробовано: ${directions.size}`
                : "Выбери задачу и посмотри, как устроена работа в направлении."}
            </p>
          </div>
        </div>
        <aside className="hub-support">
          <Sparkles size={22} />
          <div>
            <strong>Твоё развитие начинается с практики</strong>
            <p>Пробуй, сохраняй результат и выбирай следующий шаг.</p>
            <Link
              className="text-link"
              href={app?.submittedAt ? "/apply/status" : "/apply"}
            >
              {app ? "Моя заявка" : "Сразу подать заявку"}
            </Link>
          </div>
          <Image
            src="/avatars/character-1.webp"
            alt=""
            width={112}
            height={112}
          />
        </aside>
      </header>
      <nav className="hub-navigation" aria-label="Разделы моего пути">
        {Object.entries(sections).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={section === key ? "page" : undefined}
            onClick={() => navigate(key as Section)}
          >
            {label}
            {key === "university" && needsAnswer && (
              <span
                className="unread-count"
                aria-label={`${pending.length} вопросов без ответа`}
              >
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </nav>
      {user.role === "GUEST" && attempts.length > 0 && (
        <p className="guest-access">
          Работа сохранена в этом браузере.{" "}
          <Link className="text-link" href="/login?mode=register&next=/my">
            Закрепить за аккаунтом
          </Link>{" "}
          без повторного прохождения.
        </p>
      )}
      <div className="hub-panels" ref={panel} tabIndex={-1}>
        <section hidden={section !== "overview"} aria-label="Обзор моего пути">
          <div className="hub-summary-grid">
            <section
              className={`hub-next ${important ? "important" : ""}`}
              aria-label="Следующее важное действие"
            >
              <div className="hub-next-heading">
                <span className="hub-section-icon">
                  <Flag size={25} />
                </span>
                <div>
                  <p className="eyebrow">
                    {important ? "По твоей заявке" : "Следующий шаг"}
                  </p>
                  <h2>{primary.title}</h2>
                </div>
              </div>
              <p className={needsAnswer ? "hub-question" : ""}>
                {primary.body}
              </p>
              <Link
                className="button primary"
                href={primary.href}
                onClick={(e) => {
                  if (primary.href.startsWith("#")) {
                    e.preventDefault();
                    navigate("university", primary.href);
                  }
                }}
              >
                {primary.label}
              </Link>
            </section>
            <section className="hub-block hub-plan">
              <div className="hub-block-heading">
                <h2>Твой план развития</h2>
                <Link className="text-link" href={treeHref(routeNode.id)}>
                  Открыть древо
                </Link>
              </div>
              <p>{programFor(tree.programSlug)?.shortTitle}</p>
              <div className="hub-plan-columns">
                <div>
                  <h3>Уже попробовано</h3>
                  {practiced.length ? (
                    <ul>
                      {practiced.slice(0, 2).map((n) => (
                        <li key={n.id}>
                          <Check size={16} />
                          <Link href={n.evidence!.href}>{n.title}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Сохранённые результаты появятся здесь.</p>
                  )}
                </div>
                <div className="hub-plan-next">
                  <p className="eyebrow">Рекомендуем сейчас</p>
                  <Link className="text-link" href={treeHref(routeNode.id)}>
                    {routeNode.title}
                  </Link>
                  <span>Открыть практику</span>
                </div>
              </div>
            </section>
            <section className="hub-block hub-progress">
              <div className="hub-block-heading">
                <h2>Твой прогресс</h2>
                <button
                  className="text-link"
                  onClick={() => navigate("profile")}
                >
                  Начисления
                </button>
              </div>
              <div className="hub-coin-total">
                <PathPointMark />
                <strong>{data.progress.total}</strong>
                <span>поинтов</span>
              </div>
              <div className="hub-progress-facts">
                <div>
                  <strong>{completed.length}</strong>
                  <span>работ с результатом</span>
                </div>
                <div>
                  <strong>{practiced.length}</strong>
                  <span>выполненных практик</span>
                </div>
              </div>
              <p>
                +10 за пробу направления · +5 за практику навыка или объяснение
                выбора.
              </p>
            </section>
          </div>
          <div className="hub-work-grid">
            <section className="hub-block hub-skills-preview">
              <div className="hub-block-heading">
                <h2>Древо навыков</h2>
                <Link className="text-link" href={treeHref()}>
                  Все ветки
                </Link>
              </div>
              <p>
                Твои действия в направлении «
                {programFor(tree.programSlug)?.shortTitle}».
              </p>
              <div className="hub-skill-cards">
                {branches
                  .filter((b) => skillNodes.some((n) => n.branch === b.id))
                  .map((b) => {
                    const nodes = skillNodes.filter((n) => n.branch === b.id),
                      done = nodes.filter((n) => n.evidence).length;
                    return (
                      <Link
                        key={b.id}
                        href={treeHref(
                          nodes.find((n) => !n.evidence)?.id ?? nodes[0].id,
                        )}
                        className="hub-skill-card"
                      >
                        <SkillMark branch={b.id} />
                        <div>
                          <strong>{b.title}</strong>
                          <span>
                            {done
                              ? `${done} из ${nodes.length} практик выполнено`
                              : "Выбрать первую практику"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </section>
            <section className="hub-block hub-current">
              <div className="hub-block-heading">
                <h2>Текущий проект</h2>
                <button
                  className="text-link"
                  onClick={() => navigate("projects")}
                >
                  Все проекты
                </button>
              </div>
              {continuation ? (
                <>
                  <p className="eyebrow">
                    {programFor(continuation.slug)?.shortTitle} · версия{" "}
                    {continuation.revision}
                  </p>
                  <h3>
                    {workTitle(
                      continuation,
                      programFor(continuation.slug)!.action,
                    )}
                  </h3>
                  <div className="hub-work-artifact">
                    <WorkPreview
                      slug={continuation.slug}
                      context={continuation.context}
                      state={
                        continuation.versions[0]?.state ?? continuation.state
                      }
                      compact
                    />
                  </div>
                  <Link
                    className="button secondary"
                    href={workHref(continuation)}
                  >
                    Продолжить работу
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    Создай небольшой проект и узнай направление через практику.
                  </p>
                  <Link
                    className="button secondary"
                    href="/projects/digital-products"
                  >
                    Начать проект
                  </Link>
                </>
              )}
            </section>
            <section className="hub-block hub-vision">
              <div id="my-vision">
                <InteractiveProfile
                  scope={
                    needsAnswer ||
                    invitation ||
                    languageRequired ||
                    publishedQuestion
                      ? {}
                      : continuation
                        ? { attemptId: continuation.id }
                        : {}
                  }
                  title={
                    important
                      ? "Разобрать следующий шаг"
                      : "Разобрать работу и выбрать продолжение"
                  }
                  compact
                />
              </div>
              <p>
                Обсуди идею, сравни версии или попроси подсказку к текущей
                задаче.
              </p>
              <section className="hub-university">
                <div className="hub-block-heading">
                  <h3>Университет</h3>
                  {app && <Tag tone="blue">{stageLabels[app.stage]}</Tag>}
                </div>
                <p>
                  {needsAnswer
                    ? "Есть вопрос, на который нужен твой ответ."
                    : app?.submittedAt
                      ? "Приглашения и опубликованные рекомендации по твоей заявке."
                      : "Подать заявку можно без прохождения мастерских."}
                </p>
                <button
                  className="text-link"
                  onClick={() => navigate("university")}
                >
                  {app ? "Сообщения и заявка" : "Что нужно для заявки"}
                </button>
              </section>
            </section>
          </div>
          {!!materials.length && (
            <section className="hub-block hub-reading">
              <div className="hub-block-heading">
                <h2>Что почитать и изучить</h2>
                <span>Подборка в твоём кабинете inVision U</span>
              </div>
              <div className="hub-reading-grid">
                {materials.map((n) => (
                  <article key={n.resource!.id}>
                    <span className="hub-section-icon">
                      <BookOpen size={22} />
                    </span>
                    <p className="eyebrow">
                      {resourceTypes[n.resource!.type]} ·{" "}
                      {n.resource!.language.toUpperCase()}
                    </p>
                    <h3>{n.resource!.title}</h3>
                    <p className="subtle">{n.resource!.author}</p>
                    <p>{n.resource!.description}</p>
                    <p>
                      <strong>Зачем читать:</strong> {n.resource!.reason}
                    </p>
                    <a
                      className="text-link"
                      href={n.resource!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть материал
                    </a>
                    <Link className="text-link" href={treeHref(n.id)}>
                      Применить в практике
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}
          {!attempts.length && <WorkshopChoices />}
        </section>
        <section hidden={section !== "projects"} aria-label="Мои проекты">
          {attempts.length > 0 && <ProjectPassport data={data} />}
          <details className="hub-disclosure" open={attempts.length === 0}>
            <summary>Попробовать другое направление</summary>
            <WorkshopChoices
              id="more-workshop-choices"
              tried={[...new Set(attempts.map((a) => a.slug))]}
            />
          </details>
        </section>
        <section hidden={section !== "route"} aria-label="Древо навыков">
          <DevelopmentTree initial={tree} selectedId={nodeId} full embedded />
        </section>
        <section
          hidden={section !== "university"}
          aria-label="Сообщения и заявка"
        >
          <div className="hub-section-heading">
            <h2>Заявка и сообщения</h2>
            <Link
              className="button secondary"
              href={app?.submittedAt ? "/apply/status" : "/apply"}
            >
              {app ? "Открыть заявку" : "Начать заявку"}
            </Link>
          </div>
          {!app && (
            <p>
              Выбери программу, расскажи об опыте и добавь обязательные
              материалы. Учебные проекты можно приложить отдельно с твоего
              согласия.
            </p>
          )}
          {app && (
            <>
              <details className="application-checklist">
                <summary>
                  {app.submittedAt
                    ? `Заявка отправлена ${dateLabel(app.submittedAt)}`
                    : `Заполнено ${requirements.filter((r) => r.complete).length} из ${requirements.length} разделов`}
                </summary>
                <ul>
                  {requirements.map((r) => (
                    <li key={r.title}>
                      {r.complete ? <Check size={17} /> : <Circle size={17} />}
                      <span>
                        {r.title}:{" "}
                        {r.complete ? "заполнено" : "нужно заполнить"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>Мастерские и исследовательское согласие необязательны.</p>
              </details>
              {app.submittedAt && (
                <>
                  <div id="application-messages">
                    <h3>
                      {needsAnswer
                        ? "Нужно ответить на уточнение"
                        : "Переписка с университетом"}
                    </h3>
                    <Messages
                      applicationId={app.id}
                      messages={app.messages.filter(
                        (m) => m.kind !== "FEEDBACK",
                      )}
                    />
                  </div>
                  <PublishedFeedback
                    application={{ ...app, feedback: app.feedback.slice(0, 1) }}
                  />
                  <Link className="text-link" href="/apply/status">
                    История заявки
                  </Link>
                </>
              )}
            </>
          )}
        </section>
        <section
          hidden={section !== "profile"}
          aria-label="Профиль и личный прогресс"
        >
          <div className="hub-section-heading">
            <h2>Твой профиль</h2>
            {user.role !== "GUEST" && <p>{user.email}</p>}
          </div>
          <p>
            Фото можно изменить рядом с именем. Поинты и отметки доступны только
            тебе.
          </p>
          <section className="hub-block">
            <div className="hub-block-heading">
              <h3>Прогресс по работам</h3>
              <span className="path-points">
                <PathPointMark />
                {data.progress.total} поинтов
              </span>
            </div>
            {data.progress.awards.length ? (
              <ul className="progress-evidence">
                {data.progress.awards.map((a) => (
                  <li key={a.key}>
                    <span className="path-points">
                      <PathPointMark />+{a.points}
                    </span>
                    <div>
                      <Link className="text-link" href={a.href}>
                        {a.title}
                      </Link>
                      <p>
                        {a.reason} Основание: версия {a.revision}.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Первая сохранённая работа, выполняющая условия, принесёт 10
                поинтов. Они отмечают практику, а не качество кандидата.
              </p>
            )}
            <p className="subtle">
              За одно действие начисление не повторяется. Удаление работы
              убирает связанную отметку. Поинты не передаются комиссии.
            </p>
          </section>
          {data.milestones.length > 0 && (
            <details className="hub-disclosure">
              <summary>
                Отметки выполненной работы · {data.milestones.length}
              </summary>
              <MilestoneMarks items={data.milestones} />
            </details>
          )}
          {user.interests.length > 0 && (
            <section className="hub-block">
              <h3>Выбранные интересы</h3>
              <p>Ты сохранил их сам. Программа заявки от этого не меняется.</p>
              <div className="button-row">
                {user.interests.map((slug) => (
                  <Link
                    className="button secondary"
                    key={slug}
                    href={`/programs/${slug}`}
                  >
                    {programFor(slug)?.shortTitle}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
