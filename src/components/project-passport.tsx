"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { programFor } from "@/lib/catalog";
import { readMission, missions } from "@/lib/missions";
import { workHref, workTitle, type Work, type Milestone } from "@/lib/journey";
import type { myData } from "@/lib/data";
import { WorkPreview } from "./work-preview";
import { versionCompleted } from "@/lib/journey";
import { WorkResult } from "./work-result";
import { MilestoneMarks } from "./journey-actions";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
function ProjectCard({
  work: a,
  milestones,
  user,
  application: app,
}: {
  work: Work;
  milestones: Milestone[];
  user: Data["user"];
  application: Data["application"];
}) {
  const [revision, setRevision] = useState(a.revision),
    [consent, setConsent] = useState(false);
  const task = useTask(),
    router = useRouter(),
    p = programFor(a.slug)!;
  const transferred = app?.transfers.some(
    (t) => t.attemptId === a.id && t.revision === revision,
  );
  return (
    <article className="passport-project" id={`work-${a.id}`}>
      <header>
        <p className="eyebrow">
          {a.context === "EQUIPMENT" ? "Новый контекст" : p.shortTitle}
        </p>
        <h3>{workTitle(a, p.action)}</h3>
      </header>
      <p className="result-state">
        {versionCompleted(a, a.versions[0])
          ? "Условия выполнены"
          : "Можно продолжить"}{" "}
        · версия {a.revision}
      </p>
      <WorkPreview
        slug={a.slug}
        context={a.context}
        state={a.versions[0]?.state ?? a.state}
        compact
      />
      <div className="passport-actions">
        <Link className="button secondary" href={workHref(a)}>
          Продолжить
        </Link>
        <a className="text-link" href={workHref(a, a.revision)}>
          Разбор результата
        </a>
      </div>
      <details className="passport-details">
        <summary>Версии, сравнение и передача в заявку</summary>
        <WorkResult
          work={a}
          revision={revision}
          onRevision={(n) => {
            setRevision(n);
            setConsent(false);
          }}
          compact
          continuation={false}
        />
        <MilestoneMarks
          items={milestones.filter((m) => m.attemptId === a.id)}
        />
        <div className="passport-actions">
          <a className="text-link" href={workHref(a, revision)}>
            Открыть результат
          </a>
          <Link
            className="button secondary"
            href={`${workHref(a)}&from=${revision}`}
          >
            Доработать эту версию
          </Link>
        </div>
        <details className="project-direction">
          <summary>Связь с направлением и заявкой</summary>
          <p>
            Результат работы:{" "}
            {readMission(a.state)
              ? missions[a.slug].result.toLowerCase()
              : p.artifact.toLowerCase()}
            . На программе: {p.disciplines.join(", ")}. Упражнение знакомит с
            деятельностью и не является вступительным экзаменом.
          </p>
          <Link className="text-link" href={`/programs/${a.slug}`}>
            Изучить направление
          </Link>
          {user.role === "GUEST" ? (
            <p>
              Просмотр и доработка доступны без аккаунта.{" "}
              <Link
                className="text-link"
                href={`/login?mode=register&next=${encodeURIComponent(workHref(a, revision))}`}
              >
                Сохранить доступ в аккаунте
              </Link>
            </p>
          ) : (
            <>
              <button
                className="button secondary"
                aria-pressed={user.interests.includes(a.slug)}
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("interest", {
                      slug: a.slug,
                      enabled: !user.interests.includes(a.slug),
                    });
                    router.refresh();
                  }, "Выбор интереса сохранён. Программа заявки не изменилась.")
                }
              >
                {user.interests.includes(a.slug)
                  ? "Убрать из моих интересов"
                  : "Мне интересно это направление"}
              </button>
              <button
                className="text-link"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("attempt.interest", {
                      id: a.id,
                      value: "MORE",
                    });
                    router.refresh();
                  }, "Эта работа выбрана для следующей доработки.")
                }
              >
                Выбрать следующей доработкой
              </button>
              {!app ? (
                <p>
                  Для передачи сначала{" "}
                  <Link className="text-link" href="/apply">
                    сохрани данные заявки
                  </Link>
                  . Работа останется здесь.
                </p>
              ) : app.submittedAt ? (
                <p>
                  Отправленная заявка зафиксирована. Новая версия работы не
                  меняет её материалы; дополнительные сведения можно обсудить в
                  переписке.
                </p>
              ) : transferred ? (
                <p className="inline">
                  <Check size={17} />
                  Версия {revision} передана как учебная работа.
                </p>
              ) : revision === 0 ? (
                <p>
                  Исходное задание не передаётся. Сохрани свой вариант работы.
                </p>
              ) : (
                <div className="work-transfer">
                  <p>
                    Передаётся только версия {revision} как учебное упражнение.
                    Личные отметки и частота действий не передаются.
                  </p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Разрешаю комиссии просмотреть выбранную версию
                  </label>
                  <button
                    className="button secondary"
                    disabled={!consent || task.busy}
                    onClick={() =>
                      task.run(async () => {
                        await action("work.transfer", {
                          attemptId: a.id,
                          revision,
                          consent,
                        });
                        router.refresh();
                      }, `Версия ${revision} приложена к заявке.`)
                    }
                  >
                    Передать версию {revision} в заявку
                  </button>
                </div>
              )}
            </>
          )}
        </details>
        <Feedback task={task} />
      </details>
    </article>
  );
}
export function ProjectPassport({ data }: { data: Data }) {
  return (
    <section className="project-passport" id="my-projects">
      <div className="section-heading">
        <h2>Мои проекты</h2>
        <p>
          Твоя личная коллекция. В заявку попадает только выбранная тобой версия
          после подтверждения.
        </p>
      </div>
      <div className="passport-grid">
        {data.attempts.map((a) => (
          <ProjectCard
            key={a.id}
            work={a}
            milestones={data.milestones}
            user={data.user}
            application={data.application}
          />
        ))}
      </div>
    </section>
  );
}
