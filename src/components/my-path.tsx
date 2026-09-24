"use client";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import type { myData } from "@/lib/data";
import { programFor, stageLabels } from "@/lib/catalog";
import { unansweredQuestions } from "@/lib/message-state";
import { dateLabel } from "@/lib/client";
import { workHref, workTitle, versionCompleted } from "@/lib/journey";
import { applicationRequirements } from "@/lib/validation";
import type { ApplicationFields } from "@/lib/types";
import { PublishedFeedback } from "./published-feedback";
import { Messages } from "./messages";
import { Tag } from "./ui";
import {
  ContextStart,
  MilestoneMarks,
  WorkshopChoices,
} from "./journey-actions";
import { ProjectPassport } from "./project-passport";
import { InteractiveProfile } from "./interactive-profile";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
export function MyPath({ data }: { data: Data }) {
  const { user, attempts, application: app } = data;
  const pendingQuestions = unansweredQuestions(app?.messages ?? []);
  const latestStaff =
    pendingQuestions.at(-1) ??
    app?.messages
      .filter(
        (m) =>
          m.author.role === "STAFF" && ["QUESTION", "MESSAGE"].includes(m.kind),
      )
      .at(-1);
  const replied = !!latestStaff && pendingQuestions.length === 0;
  const needsAnswer = !!app?.submittedAt && pendingQuestions.length > 0;
  const invitation = app?.stage === "INTERVIEW";
  const unfinished = attempts.find((a) => !versionCompleted(a, a.versions[0]));
  const chosen = attempts.find((a) => a.interest === "MORE");
  const continuation = chosen ?? unfinished;
  const completed = attempts.filter((a) =>
    a.versions.some((v) => versionCompleted(a, v)),
  );
  const sourceForContext = attempts.find(
    (a) =>
      a.slug === "digital-products" &&
      a.context === "WORKSHOP" &&
      a.versions.some((v) => versionCompleted(a, v)),
  );
  const contextVersion = sourceForContext?.versions.find((v) =>
    versionCompleted(sourceForContext, v),
  );
  const offerContext =
    contextVersion &&
    !attempts.some((a) => a.parentVersionId === contextVersion.id);
  const primary = app
    ? {
        title: needsAnswer
          ? "Нужно ответить на уточнение"
          : invitation
            ? "Приглашение на интервью"
            : app.submittedAt
              ? replied
                ? "Твой ответ у комиссии"
                : "Заявка на рассмотрении"
              : "Продолжи свою заявку",
        body:
          needsAnswer || invitation
            ? (app.feedback[0]?.nextAction ??
              latestStaff?.body ??
              "Открой сообщение сотрудника ниже.")
            : replied
              ? "Ответ сохранён. Проверка продолжается; при необходимости можно дополнить переписку."
              : app.submittedAt
                ? (app.feedback[0]?.nextAction ??
                  "Отправленная версия сохранена. Здесь появится опубликованный следующий шаг комиссии.")
                : "Комплектность заявки показана отдельно от учебных проектов.",
        href: needsAnswer
          ? "#application-messages"
          : app.submittedAt
            ? "/apply/status"
            : "/apply",
        label: needsAnswer
          ? "Ответить сотруднику"
          : invitation
            ? "Открыть приглашение"
            : app.submittedAt
              ? "Открыть статус"
              : "Продолжить заявку",
      }
    : continuation
      ? {
          title: "Продолжи с того места, где остановился",
          body: workTitle(continuation, programFor(continuation.slug)!.action),
          href: workHref(continuation),
          label: "Продолжить работу",
        }
      : offerContext
        ? {
            title: "Примени принцип в другой задаче",
            body: "Твой маршрут сохранён. Попробуй бронирование: здесь нужно учитывать занятое время и подтверждение выдачи.",
            href: "",
            label: "",
          }
        : attempts.length
          ? {
              title: "Работы сохранены. Что интересно дальше?",
              body: "Можно доработать результат или выбрать другое действие. Все направления доступны независимо от достижений.",
              href: "#workshop-choices",
              label: "Выбрать следующую пробу",
            }
          : {
              title: "Выбери задачу для первой пробы",
              body: "Обмен учебниками, робот, репортаж, исследование клуба или план центра. В каждой задаче можно проверить своё решение.",
              href: "#workshop-choices",
              label: "Выбрать задачу",
            };
  const directions = new Set(
    completed.filter((a) => a.context === "WORKSHOP").map((a) => a.slug),
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
  return (
    <div className="page wrap candidate-journey">
      <header className="journey-heading">
        <p className="eyebrow">inVision U · личное пространство</p>
        <h1>
          {user.role === "GUEST"
            ? "Твой путь начинается с работы"
            : `${user.name.split(" ")[0]}, это твой путь`}
        </h1>
        <p>
          Создавай, проверяй и сохраняй свои решения. Поступление остаётся
          самостоятельным путём.
        </p>
      </header>
      <section className={`journey-next ${app ? "application-priority" : ""}`}>
        <div>
          <p className="eyebrow">
            {app ? "По твоей заявке" : "Следующее действие"}
          </p>
          <h2>{primary.title}</h2>
          <p>{primary.body}</p>
          {app && <Tag tone="blue">{stageLabels[app.stage]}</Tag>}
        </div>
        <div className="journey-primary">
          {!app && !continuation && offerContext ? (
            <ContextStart versionId={contextVersion.id} primary />
          ) : (
            <Link className="button dark" href={primary.href}>
              {primary.label}
            </Link>
          )}
          {!app && (
            <Link className="text-link" href="/apply">
              Сразу подать заявку
            </Link>
          )}
        </div>
      </section>
      {user.role === "GUEST" && attempts.length > 0 && (
        <p className="guest-access">
          Работы доступны в этом браузере.{" "}
          <Link className="text-link" href="/login?mode=register&next=/my">
            Сохранить доступ в аккаунте
          </Link>{" "}
          без повторного прохождения.
        </p>
      )}
      {app && (
        <section
          className="application-in-journey"
          aria-label="Официальная заявка"
        >
          <details className="application-checklist">
            <summary>
              {app.submittedAt
                ? `Отправленная заявка · ${dateLabel(app.submittedAt)}`
                : `Комплектность заявки · ${requirements.filter((r) => r.complete).length} из ${requirements.length} разделов`}
            </summary>
            <ul>
              {requirements.map((r) => (
                <li key={r.title}>
                  {r.complete ? <Check size={17} /> : <Circle size={17} />}
                  <span>
                    {r.title}: {r.complete ? "заполнено" : "нужно заполнить"}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Мастерские и исследовательское согласие необязательны. Заполненные
              поля не означают подтверждение их содержания комиссией.
            </p>
          </details>
          {app.submittedAt && (
            <>
              <PublishedFeedback
                application={{ ...app, feedback: app.feedback.slice(0, 1) }}
              />
              <details
                className="journey-messages"
                id="application-messages"
                open={needsAnswer || replied}
              >
                <summary>
                  Сообщения университета{needsAnswer ? " · нужен ответ" : ""}
                </summary>
                <Messages
                  applicationId={app.id}
                  messages={app.messages.filter((m) => m.kind !== "FEEDBACK")}
                />
              </details>
              <Link className="text-link" href="/apply/status">
                Вся история заявки и исправление факта
              </Link>
            </>
          )}
        </section>
      )}
      {(attempts.length > 0 || app) && (
        <InteractiveProfile title="AI-профиль · мои работы и личный план" />
      )}
      {attempts.length > 0 && (
        <>
          <section className="work-route" aria-label="Маршрут знакомства">
            <div className="section-heading">
              <h2>Твой маршрут по работам</h2>
              <p>
                {completed.length > 0 &&
                  `${completed.length} сохранённых результатов. `}
                {directions.size > 0 &&
                  `Попробовано направлений: ${directions.size}. `}
                {unfinished && "Есть задача для продолжения."}
              </p>
            </div>
            <ol>
              {attempts.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span className="route-dot" aria-hidden="true" />
                  <div>
                    <strong>{workTitle(a, programFor(a.slug)!.action)}</strong>
                    <p>
                      {versionCompleted(a, a.versions[0])
                        ? "Результат сохранён · можно доработать"
                        : a.revision === 0
                          ? "Задача открыта · результат ещё не сохранён"
                          : "Черновик сохранён · условия можно проверить"}
                    </p>
                  </div>
                  <Link className="text-link" href={workHref(a)}>
                    {versionCompleted(a, a.versions[0])
                      ? "Открыть работу"
                      : "Продолжить"}
                  </Link>
                </li>
              ))}
            </ol>
            <Link className="text-link" href="#my-projects">
              Все работы и версии
            </Link>
          </section>
          {data.milestones.length > 0 && (
            <section className="journey-achievements">
              <h2>Отметки твоей работы</h2>
              <p>
                Личные ориентиры. Они не оценивают лидерство и не передаются
                комиссии.
              </p>
              <MilestoneMarks items={data.milestones} />
            </section>
          )}
          <ProjectPassport data={data} />
        </>
      )}
      <WorkshopChoices tried={[...new Set(attempts.map((a) => a.slug))]} />
      {user.interests.length > 0 && (
        <section className="saved-interests">
          <h2>Твои выбранные интересы</h2>
          <p>
            Сохранены только по твоему выбору. Программа заявки от них не
            меняется.
          </p>
          <div className="row">
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
    </div>
  );
}
