"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Circle } from "lucide-react";
import type { myData } from "@/lib/data";
import { unansweredQuestions } from "@/lib/message-state";
import { dateLabel } from "@/lib/client";
import { applicationRequirements } from "@/lib/validation";
import type { ApplicationFields } from "@/lib/types";
import type { SkillView } from "@/lib/skill-tree.server";
import { PublishedFeedback } from "./published-feedback";
import { Messages } from "./messages";
import { ProjectPassport } from "./project-passport";
import { SkillTree } from "./skill-tree";
import { UserAvatar } from "./user-avatar";
import { CandidateOverview, SupportBanner } from "./candidate-overview";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
const sections = {
  overview: "Обзор",
  university: "Заявка",
  route: "Древо навыков",
  projects: "Материалы",
  messages: "Сообщения",
} as const;
type Section = keyof typeof sections | "profile";
export function MyPath({
  data,
  tree,
  initialView = "overview",
  nodeId,
}: {
  data: Data;
  tree: SkillView;
  initialView?: string;
  nodeId?: string;
}) {
  const { user, attempts, application: app } = data;
  const router = useRouter();
  const [section, setSection] = useState<Section>(
    initialView in sections ? (initialView as Section) : "overview",
  );
  const panel = useRef<HTMLDivElement>(null);
  const queryString = useSearchParams().toString();
  function navigate(next: Section, hash = "") {
    if (next === "profile") {
      router.push("/account");
      return;
    }
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
          : hash === "#application-messages"
            ? "messages"
            : hash === "#published-feedback"
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
                body: `Заполнено ${requirements.filter((r) => r.complete).length} из ${requirements.length} обязательных разделов.`,
                label: "Продолжить заявку",
                href: "/apply",
              }
          : {
              title: "Продолжи своё развитие",
              body: "В дереве навыков тебя ждёт следующий личный шаг.",
              label: "Открыть дерево навыков",
              href: `/my?view=route&node=${tree.recommendedId}`,
            };
  return (
    <div className="page wrap candidate-hub candidate-reference">
      <header className="hub-heading">
        <div className="hub-person">
          <Link href="/account" aria-label="Профиль и фото">
            <UserAvatar user={user} size={72} />
          </Link>
          <div>
            <p className="eyebrow">Мой путь</p>
            <h1>{user.name}</h1>
            <p>
              {tree.completedCount
                ? `В дереве навыков завершено шагов: ${tree.completedCount}`
                : "Заявка и следующие действия собраны здесь."}
            </p>
          </div>
        </div>
        <SupportBanner />
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
      <div className="hub-panels" ref={panel} tabIndex={-1}>
        <section hidden={section !== "overview"} aria-label="Обзор моего пути">
          <CandidateOverview
            data={data}
            tree={tree}
            primary={primary}
            important={important}
            needsAnswer={needsAnswer}
            navigate={navigate}
          />
        </section>
        <section hidden={section !== "projects"} aria-label="Мои проекты">
          <div className="hub-section-heading">
            <h2>Материалы и работы</h2>
            <Link className="text-link" href="/apply/status">
              Отправленная заявка
            </Link>
          </div>
          {app?.materials.length ? (
            <div className="material-list">
              <h3>Файлы заявки</h3>
              {app.materials.map((m) => (
                <p key={m.id}>
                  <Link href={`/api/files/${m.id}`} className="text-link">
                    {m.name}
                  </Link>{" "}
                  <small>
                    {m.releasedAt ? "Передано комиссии" : "Личный материал"} ·
                    версия {m.version}
                  </small>
                </p>
              ))}
            </div>
          ) : null}
          {attempts.length > 0 && <div className="legacy-work"><ProjectPassport data={data} /></div>}
        </section>
        <section hidden={section !== "route"} aria-label="Древо навыков">
          <SkillTree initial={tree} selectedId={nodeId} />
        </section>
        <section hidden={section !== "university"} aria-label="Заявка">
          <div className="hub-section-heading">
            <h2>Заявка</h2>
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
                <p>Учебные задания не являются условием отправки заявки.</p>
              </details>
              {app.submittedAt && (
                <>
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
          hidden={section !== "messages"}
          aria-label="Сообщения университета"
        >
          <div id="application-messages" className="hub-section-heading">
            <h2>
              {needsAnswer
                ? "Нужно ответить на уточнение"
                : "Сообщения университета"}
            </h2>
          </div>
          {app?.submittedAt ? (
            <Messages
              applicationId={app.id}
              messages={app.messages.filter((m) => m.kind !== "FEEDBACK")}
              verificationRequests={app.verificationRequests}
            />
          ) : (
            <p>Сообщения появятся после отправки заявки.</p>
          )}
        </section>
      </div>
    </div>
  );
}
