"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowRight, BookOpen, Send, Check } from "lucide-react";
import type { myData } from "@/lib/data";
import { programFor, stageLabels } from "@/lib/catalog";
import { action, dateLabel } from "@/lib/client";
import { changesBetween, initialState } from "@/lib/projects";
import type { ProjectState } from "@/lib/types";
import { Messages } from "./messages";
import { Feedback, useTask, Tag } from "./ui";
export function MyPath({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof myData>>>;
}) {
  const [memory, setMemory] = useState("");
  const [transfer, setTransfer] = useState("");
  const [consent, setConsent] = useState(false);
  const task = useTask();
  const router = useRouter();
  const { user, attempts, application: app } = data;
  const replied =
    app?.messages.at(-1)?.authorId === user.id &&
    app?.messages.at(-1)?.kind === "MESSAGE";
  return (
    <div className="page wrap">
      <div className="page-title">
        <div>
          <h1>
            {user.role === "GUEST"
              ? "Твой путь уже начался"
              : `${user.name.split(" ")[0]}, это твой путь`}
          </h1>
          <p>Идеи, которые ты проверил. Работа, к которой можно вернуться.</p>
        </div>
        {app && <Tag tone="blue">{stageLabels[app.stage]}</Tag>}
      </div>
      <div className="journey-layout">
        <div>
          <section className="next-step">
            <h2>
              {user.role === "GUEST"
                ? "Дай своей работе продолжение"
                : app?.stage === "CLARIFICATION"
                  ? replied
                    ? "Твой ответ у комиссии"
                    : "Комиссия ждёт уточнение"
                  : app?.submittedAt
                    ? "Следи за следующим шагом"
                    : attempts.length
                      ? "Первый результат есть. Что дальше?"
                      : "Сделай первый ход"}
            </h2>
            <p>
              {user.role === "GUEST"
                ? "Создай аккаунт, чтобы продолжать с другого устройства. Гостевая работа сохранится."
                : app?.stage === "CLARIFICATION"
                  ? replied
                    ? "Уточнение сохранено в переписке. Можно дополнить ответ или дождаться следующего действия сотрудника."
                    : "Открой сообщение ниже и ответь на конкретный вопрос сотрудника."
                  : app?.submittedAt
                    ? "Заявка сохранена. Сообщения и решения комиссии появятся в твоём статусе."
                    : "Можно продолжить проект, попробовать другое направление или сразу перейти к поступлению."}
            </p>
            <Link
              className="button dark"
              href={
                user.role === "GUEST"
                  ? "/login?mode=register&next=/my"
                  : app?.submittedAt
                    ? "/apply/status"
                    : attempts.length
                      ? "/apply"
                      : "/projects/digital-products"
              }
            >
              {user.role === "GUEST"
                ? "Создать аккаунт"
                : app?.submittedAt
                  ? "Открыть статус"
                  : attempts.length
                    ? "Перейти к заявке"
                    : "Начать проект"}
              <ArrowUpRight size={18} />
            </Link>
          </section>
          <div className="row between">
            <h2>Мои работы</h2>
            <Link href="/#projects" className="text-link">
              Другие пробы <ArrowRight size={16} />
            </Link>
          </div>
          {attempts.length ? (
            attempts.map((a) => {
              const p = programFor(a.slug)!;
              return (
                <article key={a.id} className="work-row">
                  <div className={`work-art ${p.color}`}>{p.letter}</div>
                  <div>
                    <Tag>{p.artifact}</Tag>
                    <h3>{p.action}</h3>
                    <p>
                      Версия {a.revision} · {dateLabel(a.updatedAt)}
                    </p>
                    <div className="row" style={{ marginTop: 12 }}>
                      <button
                        className="text-link"
                        onClick={() => setMemory(memory === a.id ? "" : a.id)}
                      >
                        <BookOpen size={15} />
                        Связь с программой
                      </button>
                      {user.role !== "GUEST" && (
                        <button
                          className="text-link"
                          onClick={() => {
                            setTransfer(transfer === a.id ? "" : a.id);
                            setConsent(false);
                          }}
                        >
                          В заявку <Send size={14} />
                        </button>
                      )}
                    </div>
                    {memory === a.id && (
                      <div className="memory-box">
                        <strong>По твоей сохранённой работе</strong>
                        <p>
                          Ты изменил:{" "}
                          {changesBetween(
                            a.slug,
                            initialState,
                            a.state as unknown as ProjectState,
                          )
                            .join(", ")
                            .toLowerCase() || "пока сохранён исходный план"}
                          .
                        </p>
                        <p>Связанные дисциплины: {p.disciplines.join(", ")}.</p>
                        <Link
                          className="source-citation"
                          href={"/programs/" + a.slug}
                        >
                          Источник: описание направления
                        </Link>
                        <p className="subtle" style={{ marginTop: 10 }}>
                          Этот ответ использует только сохранённую работу и
                          каталог программ.
                        </p>
                      </div>
                    )}
                    {transfer === a.id && (
                      <div className="memory-box">
                        {!app ? (
                          <>
                            <p>
                              Сначала сохрани основные данные заявки. Затем
                              вернись сюда и подтверди передачу работы.
                            </p>
                            <Link href="/apply" className="text-link">
                              Заполнить заявку <ArrowRight size={15} />
                            </Link>
                          </>
                        ) : app.submittedAt ? (
                          <p>
                            Отправленная версия заявки зафиксирована. Новые
                            сведения можно обсудить в переписке.
                          </p>
                        ) : app.transfers.some(
                            (t) =>
                              t.attemptId === a.id && t.revision === a.revision,
                          ) ? (
                          <p className="inline">
                            <Check size={17} /> Версия {a.revision} приложена
                            как учебное упражнение.
                          </p>
                        ) : (
                          <>
                            <p>
                              Передаётся только версия {a.revision}. Обозначение
                              «учебное упражнение» сохранится. Интерес и
                              поведение при прохождении не используются как балл
                              при поступлении.
                            </p>
                            <label
                              className="check-label"
                              style={{ marginTop: 14 }}
                            >
                              <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                              />
                              Разрешаю комиссии просмотреть эту учебную работу.
                            </label>
                            <button
                              className="button secondary small"
                              style={{ marginTop: 14 }}
                              disabled={!consent || task.busy}
                              onClick={() =>
                                task.run(async () => {
                                  await action("work.transfer", {
                                    attemptId: a.id,
                                    revision: a.revision,
                                    consent,
                                  });
                                  router.refresh();
                                }, "Учебная работа приложена к заявке.")
                              }
                            >
                              Подтвердить передачу
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <details className="versions">
                      <summary>Что хочется дальше?</summary>
                      <div className="row" style={{ marginTop: 8 }}>
                        {[
                          ["MORE", "Изучить глубже"],
                          ["ANOTHER", "Попробовать другое"],
                        ].map(([value, label]) => (
                          <button
                            className="button secondary small"
                            key={value}
                            disabled={task.busy || user.role === "GUEST"}
                            aria-pressed={a.interest === value}
                            onClick={() =>
                              task.run(async () => {
                                await action("attempt.interest", {
                                  id: a.id,
                                  value,
                                });
                                router.refresh();
                              }, "Интерес сохранён отдельно от результата работы.")
                            }
                          >
                            {a.interest === value && <Check size={13} />}{" "}
                            {label}
                          </button>
                        ))}
                      </div>
                      {user.role === "GUEST" && (
                        <Link href="/login?mode=register" className="text-link">
                          Сохранить интерес в аккаунте
                        </Link>
                      )}
                    </details>
                  </div>
                  <Link
                    href={"/projects/" + a.slug}
                    className="button secondary small"
                  >
                    Продолжить <ArrowUpRight size={15} />
                  </Link>
                </article>
              );
            })
          ) : (
            <div className="empty">
              <h3>Начни проект — работа сохранится здесь</h3>
              <p style={{ marginTop: 12 }}>
                Можно начать с любого действия и вернуться к нему позже.
              </p>
              <Link
                href="/projects/digital-products"
                className="button primary"
              >
                Начать проект <ArrowUpRight size={17} />
              </Link>
            </div>
          )}
          <Feedback task={task} />
        </div>
        <aside>
          <section className="panel">
            <h2>Изученные направления</h2>
            {[...new Set([...user.interests, ...attempts.map((a) => a.slug)])]
              .length ? (
              [
                ...new Set([...user.interests, ...attempts.map((a) => a.slug)]),
              ].map((slug) => {
                const p = programFor(slug);
                return (
                  p && (
                    <div className="review-section" key={slug}>
                      <h3>{p.shortTitle}</h3>
                      <Link
                        href={"/programs/" + slug}
                        className="text-link"
                        style={{ marginTop: 9 }}
                      >
                        Открыть программу <ArrowUpRight size={15} />
                      </Link>
                    </div>
                  )
                );
              })
            ) : (
              <>
                <p>
                  Знакомство начинается с действия. Попробуй проект, чтобы
                  увидеть связь с учебными дисциплинами.
                </p>
                <Link
                  href="/#projects"
                  className="text-link"
                  style={{ marginTop: 18 }}
                >
                  Выбрать действие <ArrowRight size={15} />
                </Link>
              </>
            )}
          </section>
          <section className="panel" style={{ marginTop: 24 }}>
            <h2>Сообщения</h2>
            {app?.submittedAt ? (
              <Messages applicationId={app.id} messages={app.messages} />
            ) : (
              <p className="subtle">
                После отправки заявки здесь будет переписка с комиссией.
                Обратную связь по работе можно открыть в самом проекте.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
