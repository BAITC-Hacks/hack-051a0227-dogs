"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Circle } from "lucide-react";
import type { myData } from "@/lib/data";
import { programFor, stageLabels } from "@/lib/catalog";
import { unansweredQuestions } from "@/lib/message-state";
import { dateLabel } from "@/lib/client";
import { workHref, workTitle, versionCompleted } from "@/lib/journey";
import { applicationRequirements } from "@/lib/validation";
import type { ApplicationFields } from "@/lib/types";
import { treeHref, treeStatus } from "@/lib/development-tree";
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
import { WorkPreview } from "./work-preview";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
const sections = {
  overview: "Обзор",
  projects: "Проекты",
  route: "Маршрут",
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
  const material =
    tree.nodes.find((n) => n.resource && n.id === tree.currentId) ??
    tree.nodes.find((n) => n.resource && n.slug === continuation?.slug) ??
    tree.nodes.find((n) => n.resource);
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
        <Link
          className="text-link"
          href={app?.submittedAt ? "/apply/status" : "/apply"}
        >
          {app ? "Моя заявка" : "Сразу подать заявку"}
        </Link>
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
          <section
            className={`hub-next ${important ? "important" : ""}`}
            aria-label="Следующее важное действие"
          >
            <div>
              <p className="eyebrow">
                {important ? "По твоей заявке" : "Следующий шаг"}
              </p>
              <h2>{primary.title}</h2>
              <p className={needsAnswer ? "hub-question" : ""}>
                {primary.body}
              </p>
            </div>
            <Link
              className="button dark"
              href={primary.href}
              onClick={(event) => {
                if (primary.href.startsWith("#")) {
                  event.preventDefault();
                  navigate("university", primary.href);
                }
              }}
            >
              {primary.label}
            </Link>
          </section>
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
                needsAnswer
                  ? "Разобрать вопрос комиссии"
                  : languageRequired
                    ? "Разобрать следующий шаг по языку"
                    : publishedQuestion
                      ? "Разобрать опубликованную рекомендацию"
                      : invitation
                        ? "Подготовиться к разговору с комиссией"
                        : continuation
                          ? "Разобрать эту работу и выбрать следующий шаг"
                          : "Помочь выбрать первую практику"
              }
              compact
            />
          </div>
          {attempts.length ? (
            <div className="hub-overview-grid">
              <section className="hub-block hub-current">
                <div className="hub-block-heading">
                  <h2>
                    {important ? "Твоя текущая работа" : "Сохранено у тебя"}
                  </h2>
                  <button
                    className="text-link"
                    onClick={() => navigate("projects")}
                  >
                    Все проекты
                  </button>
                </div>
                {continuation && (
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
                    <WorkPreview
                      slug={continuation.slug}
                      context={continuation.context}
                      state={
                        continuation.versions[0]?.state ?? continuation.state
                      }
                      compact
                    />
                    <Link className="text-link" href={workHref(continuation)}>
                      Открыть работу
                    </Link>
                  </>
                )}
              </section>
              <div className="hub-side">
                <section className="hub-block hub-route">
                  <p className="eyebrow">Шаги развития · добровольно</p>
                  <h2>
                    {routeNode.step
                      ? routeNode.title
                      : "От решения к пониманию"}
                  </h2>
                  <p>
                    {routeNode.step
                      ? `${treeStatus[routeNode.status]}. ${routeNode.purpose}`
                      : "Разбери свой выбор, изучи материал и примени идею в работе. Выбирай только интересные тебе шаги."}
                  </p>
                  <Link className="text-link" href={treeHref(routeNode.id)}>
                    Продолжить маршрут
                  </Link>
                </section>
                <section className="hub-block hub-progress">
                  <div className="hub-block-heading">
                    <h2>Личный прогресс</h2>
                    <span className="path-points">
                      {data.progress.total} поинтов
                    </span>
                  </div>
                  <p>
                    За сохранённую пробу направления +10. За объяснение своего
                    выбора +5.
                  </p>
                  <button
                    className="text-link"
                    onClick={() => navigate("profile")}
                  >
                    За какие действия
                  </button>
                  <p className="subtle">Приватно. Не влияет на поступление.</p>
                </section>
              </div>
            </div>
          ) : (
            <WorkshopChoices />
          )}
          <div className="hub-bottom-grid">
            {material?.resource && (
              <section className="hub-block hub-resource">
                <p className="eyebrow">Материал к следующему шагу</p>
                <h2>{material.resource.title}</h2>
                <p>{material.purpose}</p>
                <p className="subtle">
                  Рекомендуем к шагу «{material.title}»
                  {material.work
                    ? ` и версии ${material.work.revision} твоей работы`
                    : ", чтобы применить идею в практике"}
                  .
                </p>
                <Link className="text-link" href={treeHref(material.id)}>
                  Посмотреть материал и задание
                </Link>
              </section>
            )}
            <section className="hub-block hub-university">
              <div className="hub-block-heading">
                <h2>Университет</h2>
                {app && <Tag tone="blue">{stageLabels[app.stage]}</Tag>}
              </div>
              <p>
                {needsAnswer
                  ? "Есть вопрос, на который нужен твой ответ."
                  : important
                    ? "Приглашение, переписка и опубликованные рекомендации собраны здесь."
                    : app?.feedback[0]
                      ? app.feedback[0].nextAction
                      : app?.submittedAt
                        ? "Отправленная версия сохранена. Опубликованные сообщения появляются здесь."
                        : "Подать заявку можно сразу. Мастерские и поинты не являются обязательными условиями."}
              </p>
              <button
                className="text-link"
                onClick={() => navigate("university")}
              >
                {app ? "Сообщения и заявка" : "Что нужно для заявки"}
              </button>
            </section>
          </div>
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
        <section hidden={section !== "route"} aria-label="Маршрут развития">
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
                    История заявки и исправление факта
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
              <span className="path-points">{data.progress.total} поинтов</span>
            </div>
            {data.progress.awards.length ? (
              <ul className="progress-evidence">
                {data.progress.awards.map((a) => (
                  <li key={a.key}>
                    <span className="path-points">+{a.points}</span>
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
