"use client";
import { UserAvatar } from "./user-avatar";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  sections,
  questionTemplates,
  planSchema,
  resultSchema,
  emptyAnswers,
  type InterviewPlan,
  type InterviewResult,
} from "@/lib/review-contract";
import type { interviewData } from "@/lib/data";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask, Tag } from "./ui";
import { SourceContent } from "./review-source";
export function InterviewWorkspace({
  interview: i,
}: {
  interview: NonNullable<Awaited<ReturnType<typeof interviewData>>>;
}) {
  const [plan, setPlan] = useState<InterviewPlan>(
    planSchema.safeParse(i.plan).success
      ? planSchema.parse(i.plan)
      : { questions: [], notes: "" },
  );
  const [result, setResult] = useState<InterviewResult>(
    resultSchema.safeParse(i.result).success
      ? resultSchema.parse(i.result)
      : { answers: emptyAnswers, observation: "", conclusion: "" },
  );
  const [revision, setRevision] = useState(i.revision);
  const [confirmed, setConfirmed] = useState(false),
    [recordingResult, setRecordingResult] = useState(i.status === "COMPLETED");
  const [performedAt, setPerformedAt] = useState(
    i.performedAt
      ? new Date(
          new Date(i.performedAt).getTime() -
            new Date(i.performedAt).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [sourceId, setSourceId] = useState(
    i.application.sources.find((s) => s.title === "Опыт и личная роль")?.id ??
      i.application.sources[0]?.id ??
      "",
  );
  const [section, setSection] = useState("action"),
    [customQuestion, setCustomQuestion] = useState("");
  const task = useTask(),
    resultTask = useTask(),
    router = useRouter();
  const source = i.application.sources.find((s) => s.id === sourceId);
  const sourceReturn = useRef<HTMLElement | null>(null);
  function openSource(id: string) {
    sourceReturn.current = document.activeElement as HTMLElement;
    setSourceId(id);
    if (window.innerWidth < 1000)
      document
        .getElementById("interview-source")
        ?.scrollIntoView({ block: "start" });
  }
  const base = {
    id: i.id,
    applicationId: i.applicationId,
    revision,
    materialVersion: i.currentMaterialVersion,
  };
  const reviews = i.application.domainReviews.filter(
    (r, index, all) =>
      all.findIndex((other) => other.domain === r.domain) === index &&
      questionTemplates[r.gap] &&
      r.sourceIds.length > 0,
  );
  const scoring = i.scoring.runs.find(
    (r) => r.current && r.status === "COMPLETED",
  );
  function add(
    text: string,
    section: string,
    sourceId: string,
    reviewId?: string,
  ) {
    setPlan((p) => ({
      ...p,
      questions: [
        ...p.questions,
        {
          id: crypto.randomUUID(),
          text,
          section: section as InterviewPlan["questions"][number]["section"],
          sourceId,
          reviewId,
        },
      ],
    }));
  }
  return (
    <div className="staff-page">
      <Link
        className="breadcrumbs"
        href={"/admissions/candidates/" + i.applicationId}
      >
        <ArrowLeft size={14} />
        Карточка кандидата
      </Link>
      <div className="page-title">
        <div>
          <h1 className="person-heading"><UserAvatar user={i.application.user} size={48} />Интервью · {i.application.user.name}</h1>
          <p>
            {dateLabel(i.scheduledAt)} · Алматы ·{" "}
            {i.application.program.shortTitle}
          </p>
        </div>
        <Tag tone={i.status === "COMPLETED" ? "success" : "blue"}>
          {i.status === "COMPLETED"
            ? "Встреча зафиксирована"
            : "Подготовка к встрече"}
        </Tag>
      </div>
      <div className="interview-layout">
        <div>
          <section className="notice info">
            <div>
              <strong>Подготовка и встреча сохраняются отдельно</strong>
              <p>
                Вопросы и план не являются ответами или наблюдениями. Пять
                секций ATOLA остаются обязательной структурой разговора.
              </p>
            </div>
          </section>
          <section className="review-section">
            <h2>План интервью</h2>
            {scoring?.result && (
              <details className="scoring-scale">
                <summary>Вопросы AI-скоринга к этим материалам</summary>
                <p>
                  Выберите нужные вопросы, затем измените их в соответствующей
                  секции и сохраните план.
                </p>
                {scoring.result.questions.map((q) => (
                  <div className="scoring-question" key={q.id}>
                    <p>{q.text}</p>
                    <p>Пробел: {q.gap}</p>
                    <button
                      className="text-link"
                      onClick={() => openSource(q.sourceId)}
                    >
                      Открыть материал
                    </button>
                    <button
                      className="button secondary"
                      disabled={plan.questions.some(
                        (p) =>
                          p.scoringRunId === scoring.id &&
                          p.scoringQuestionId === q.id,
                      )}
                      onClick={() =>
                        setPlan((p) => ({
                          ...p,
                          questions: [
                            ...p.questions,
                            {
                              id: crypto.randomUUID(),
                              section: q.section,
                              text: q.text,
                              sourceId: q.sourceId,
                              scoringRunId: scoring.id,
                              scoringQuestionId: q.id,
                            },
                          ],
                        }))
                      }
                    >
                      Добавить в{" "}
                      {sections
                        .find((s) => s.key === q.section)
                        ?.title.toLowerCase()}
                    </button>
                  </div>
                ))}
              </details>
            )}
            {sections.map((s) => (
              <section className="interview-step" key={s.key}>
                <h3>{s.title}</h3>
                <p>{s.prompt}</p>
                <span className="meta">Основной вопрос секции</span>
                {plan.questions
                  .filter((q) => q.section === s.key)
                  .map((q) => (
                    <div className="interview-question" key={q.id}>
                      <label className="field">
                        Дополнительный вопрос
                        <textarea
                          value={q.text}
                          maxLength={1000}
                          onChange={(e) =>
                            setPlan((p) => ({
                              ...p,
                              questions: p.questions.map((x) =>
                                x.id === q.id
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        Связанный материал
                        <select
                          value={q.sourceId}
                          onChange={(e) =>
                            setPlan((p) => ({
                              ...p,
                              questions: p.questions.map((x) =>
                                x.id === q.id
                                  ? {
                                      ...x,
                                      sourceId: e.target.value,
                                      reviewId: undefined,
                                      scoringRunId: undefined,
                                      scoringQuestionId: undefined,
                                    }
                                  : x,
                              ),
                            }))
                          }
                        >
                          <option value="">
                            Без дополнительного материала
                          </option>
                          {i.application.sources.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      {q.sourceId && (
                        <button
                          className="text-link"
                          onClick={() => openSource(q.sourceId)}
                        >
                          Открыть материал
                        </button>
                      )}
                      <button
                        className="button quiet small"
                        onClick={() =>
                          setPlan((p) => ({
                            ...p,
                            questions: p.questions.filter((x) => x.id !== q.id),
                          }))
                        }
                      >
                        Убрать дополнительный вопрос
                      </button>
                    </div>
                  ))}
              </section>
            ))}
            <details className="versions" open={reviews.length > 0}>
              <summary>
                Вопросы по отмеченным пробелам · {reviews.length}
              </summary>
              {reviews.map((r) => {
                const template = questionTemplates[r.gap];
                return (
                  <div className="evidence-row" key={r.id}>
                    <h3>{r.domain}</h3>
                    <p>
                      <strong>Вопрос сотрудника:</strong> {r.question}
                    </p>
                    <p>{template.text}</p>
                    {r.materialVersion !== i.currentMaterialVersion && (
                      <p className="notice info">
                        После заметки появились новые материалы. Сверьте вопрос
                        с ними.
                      </p>
                    )}
                    <button
                      className="button secondary small"
                      disabled={plan.questions.some((q) => q.reviewId === r.id)}
                      onClick={() =>
                        add(
                          template.text,
                          template.section,
                          r.sourceIds[0],
                          r.id,
                        )
                      }
                    >
                      Добавить вопрос в план
                    </button>
                  </div>
                );
              })}
            </details>
            <div className="panel">
              <h3>Свой дополнительный вопрос</h3>
              <label className="field">
                Секция
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  {sections.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Формулировка
                <textarea
                  value={customQuestion}
                  maxLength={1000}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                />
              </label>
              <p className="subtle">
                Будет связан с открытым справа источником.
              </p>
              <button
                className="button secondary small"
                disabled={
                  customQuestion.trim().length < 5 ||
                  plan.questions.length >= 30
                }
                onClick={() => {
                  add(customQuestion, section, sourceId);
                  setCustomQuestion("");
                }}
              >
                Добавить свой вопрос
              </button>
            </div>
            <label className="field">
              Подготовительные заметки
              <textarea
                value={plan.notes}
                maxLength={6000}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </label>
            <button
              className="button primary"
              disabled={task.busy || resultTask.busy}
              onClick={() =>
                task.run(async () => {
                  const r = await action<{ revision: number }>(
                    "interview.plan",
                    { ...base, plan },
                  );
                  setRevision(r.revision);
                  router.refresh();
                }, "План сохранён отдельно от результатов встречи.")
              }
            >
              Сохранить подготовку
            </button>
            <Feedback task={task} />
            {i.notes && Object.values(i.notes).some(Boolean) && (
              <details className="versions">
                <summary>Ранее сохранённые заметки</summary>
                <p className="subtle">
                  Исходные записи сохранены отдельно; они не перенесены в
                  результаты встречи.
                </p>
                {Object.entries(i.notes).map(([key, value]) =>
                  typeof value === "string" && value ? (
                    <p key={key}>{value}</p>
                  ) : null,
                )}
              </details>
            )}
          </section>
          <section className="review-section">
            <h2>Состоявшаяся встреча</h2>
            {i.performedAt && (
              <p className="notice info">
                Встреча зафиксирована за {dateLabel(i.performedAt)}. Изменение
                результата сохранит предыдущую версию.
              </p>
            )}
            {!recordingResult ? (
              <>
                <p>
                  Откройте эту часть после реального разговора. Подготовительный
                  план останется отдельной записью.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setRecordingResult(true)}
                >
                  Зафиксировать состоявшуюся встречу
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resultTask.run(async () => {
                    const r = await action<{ revision: number }>(
                      "interview.complete",
                      {
                        ...base,
                        result,
                        confirm: confirmed,
                        performedAt: new Date(performedAt).toISOString(),
                      },
                    );
                    setRevision(r.revision);
                    setConfirmed(false);
                    router.refresh();
                  }, "Результаты состоявшейся встречи сохранены отдельно от подготовки.");
                }}
              >
                <label className="field">
                  Фактическая дата и время (часовой пояс устройства)
                  <input
                    type="datetime-local"
                    required
                    value={performedAt}
                    onChange={(e) => setPerformedAt(e.target.value)}
                  />
                </label>
                {sections.map((s) => (
                  <label className="field" key={s.key}>
                    {s.title} · ответ кандидата
                    <textarea
                      required
                      minLength={3}
                      maxLength={4000}
                      value={result.answers[s.key]}
                      onChange={(e) =>
                        setResult((r) => ({
                          ...r,
                          answers: { ...r.answers, [s.key]: e.target.value },
                        }))
                      }
                    />
                    <span className="subtle">
                      Если не обсуждалось, так и укажите. Отсутствие ответа не
                      является нулевым баллом.
                    </span>
                  </label>
                ))}
                <label className="field">
                  Наблюдение сотрудника
                  <textarea
                    required
                    minLength={10}
                    maxLength={4000}
                    value={result.observation}
                    onChange={(e) =>
                      setResult((r) => ({ ...r, observation: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  Итог беседы и основания
                  <textarea
                    required
                    minLength={20}
                    maxLength={4000}
                    value={result.conclusion}
                    onChange={(e) =>
                      setResult((r) => ({ ...r, conclusion: e.target.value }))
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Подтверждаю: встреча состоялась, записаны её ответы и
                  наблюдения
                </label>
                <button
                  className="button primary"
                  disabled={!confirmed || resultTask.busy || task.busy}
                >
                  Сохранить результаты встречи
                </button>
              </form>
            )}
            <Feedback task={resultTask} />
          </section>
          <details className="versions">
            <summary>
              История подготовки и результатов · {i.revisions.length}
            </summary>
            {i.revisions.map((v) => (
              <div className="version-row" key={v.id}>
                <h3>
                  {v.kind === "RESULT"
                    ? "Результаты встречи"
                    : v.kind === "PLAN"
                      ? "Подготовка"
                      : "Ранее сохранённая запись"}{" "}
                  · {dateLabel(v.createdAt)}
                </h3>
                <p className="meta">Версия {v.revision}</p>
                {v.kind === "PLAN" ? (
                  <>
                    <p>{(v.notes as unknown as InterviewPlan).notes}</p>
                    {(v.notes as unknown as InterviewPlan).questions?.map(
                      (q) => (
                        <p key={q.id}>{q.text}</p>
                      ),
                    )}
                  </>
                ) : v.kind === "RESULT" ? (
                  <>
                    <p>
                      {
                        (v.notes as unknown as { result: InterviewResult })
                          .result.observation
                      }
                    </p>
                    <p>
                      {
                        (v.notes as unknown as { result: InterviewResult })
                          .result.conclusion
                      }
                    </p>
                    {sections.map((s) => (
                      <p key={s.key}>
                        <strong>{s.title}:</strong>{" "}
                        {
                          (v.notes as unknown as { result: InterviewResult })
                            .result.answers[s.key]
                        }
                      </p>
                    ))}
                  </>
                ) : (
                  <p>Исходные подготовительные заметки сохранены.</p>
                )}
              </div>
            ))}
          </details>
        </div>
        <aside className="review-aside" id="interview-source">
          <div className="source-panel">
            <h2>Материал к вопросу</h2>
            <label className="field">
              Источник интервью
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {i.application.sources.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-link source-return"
              onClick={() => {
                sourceReturn.current?.scrollIntoView({ block: "center" });
                sourceReturn.current?.focus({ preventScroll: true });
              }}
            >
              Вернуться к вопросу
            </button>
            {source && <SourceContent source={source} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
