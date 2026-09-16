"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Save, Quote } from "lucide-react";
import { atola } from "@/lib/catalog";
import type { interviewData } from "@/lib/data";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask, Tag } from "./ui";
type Notes = {
  a1: string;
  t: string;
  o: string;
  l: string;
  a2: string;
  observation: string;
  assessment: string;
};
export function InterviewWorkspace({
  interview: i,
}: {
  interview: NonNullable<Awaited<ReturnType<typeof interviewData>>>;
}) {
  const [notes, setNotes] = useState(i.notes as unknown as Notes);
  const [revision, setRevision] = useState(i.revision);
  const [status, setStatus] = useState(i.status);
  const [sourceId, setSourceId] = useState(i.application.sources[0]?.id ?? "");
  const source = i.application.sources.find((s) => s.id === sourceId);
  const task = useTask();
  const router = useRouter();
  async function save(finish = false) {
    const result = await action<{ revision: number }>("interview.save", {
      id: i.id,
      notes,
      revision,
      finish,
    });
    setRevision(result.revision);
    setStatus(finish ? "COMPLETED" : "SCHEDULED");
    router.refresh();
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
          <h1>Интервью · {i.application.user.name}</h1>
          <p>
            {dateLabel(i.scheduledAt)} · Алматы ·{" "}
            {i.application.program.shortTitle}
          </p>
        </div>
        <Tag tone={status === "COMPLETED" ? "success" : "blue"}>
          {status === "COMPLETED" ? "Результат сохранён" : "Рабочие заметки"}
        </Tag>
      </div>
      <div className="interview-layout">
        <div>
          <div className="notice info">
            Структура ATOLA организует разговор по источникам. Фиксируйте слова,
            наблюдения и собственную интерпретацию раздельно.
          </div>
          {atola.map((s) => (
            <section className="interview-step" key={s.key}>
              <h2>{s.title}</h2>
              <p>{s.prompt}</p>
              <label className="field">
                Заметки по этапу{" "}
                {s.key === "a1"
                  ? "A — контекст"
                  : s.key === "a2"
                    ? "A — следующее действие"
                    : s.key.toUpperCase()}
                <textarea
                  maxLength={4000}
                  value={notes[s.key as keyof Notes]}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [s.key]: e.target.value }))
                  }
                />
              </label>
            </section>
          ))}
          <section className="interview-step">
            <h2>Наблюдения после проведённого этапа</h2>
            <p>
              Добавьте конкретное действие из интервью или проведённой групповой
              работы. Не делайте выводов о психотипе, травме или здоровье.
            </p>
            <label className="field">
              Наблюдаемое действие
              <textarea
                maxLength={4000}
                value={notes.observation}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, observation: e.target.value }))
                }
              />
            </label>
          </section>
          <section className="interview-step">
            <h2>Оценка сотрудника</h2>
            <p>
              Какой вывод следует из источников и разговора? Какие существенные
              вопросы остаются открытыми?
            </p>
            <label className="field">
              Вывод и основание
              <textarea
                maxLength={4000}
                value={notes.assessment}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, assessment: e.target.value }))
                }
              />
            </label>
          </section>
          <div className="row" style={{ marginTop: 24 }}>
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() =>
                task.run(() => save(false), "Заметки интервью сохранены.")
              }
            >
              <Save size={16} />
              Сохранить заметки
            </button>
            <button
              className="button primary"
              disabled={task.busy}
              onClick={() =>
                task.run(
                  () => save(true),
                  "Результат интервью сохранён сотрудником.",
                )
              }
            >
              <Check size={16} />
              Завершить интервью
            </button>
          </div>
          <Feedback task={task} />
          <details className="versions">
            <summary>История заметок · {i.revisions.length}</summary>
            {i.revisions.map((v) => (
              <div className="version-row" key={v.id}>
                <h3>
                  Версия {v.revision} · {dateLabel(v.createdAt)}
                </h3>
                {Object.entries(v.notes as unknown as Notes)
                  .filter(([, text]) => text)
                  .map(([key, text]) => (
                    <p
                      style={{
                        marginTop: 12,
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                      }}
                      key={key}
                    >
                      <strong>
                        {atola.find((a) => a.key === key)?.title ??
                          (key === "observation"
                            ? "Наблюдение"
                            : "Вывод сотрудника")}
                      </strong>
                      <br />
                      {text}
                    </p>
                  ))}
              </div>
            ))}
          </details>
        </div>
        <aside className="review-aside">
          <div className="source-panel">
            <span className="inline subtle">
              <Quote size={16} />
              Контекст по источникам
            </span>
            <label className="field" style={{ marginTop: 18 }}>
              Источник
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                {i.application.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            {source && (
              <>
                <h2>{source.title}</h2>
                <blockquote>{source.content}</blockquote>
                <p className="source-foot">
                  {source.kind} · исходный материал кандидата
                </p>
              </>
            )}
          </div>
          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Основания из рассмотрения</h3>
            {i.application.assessments.slice(0, 3).map((a) => (
              <div className="evidence-row" key={a.id}>
                <strong className="subtle">{a.domain}</strong>
                <p style={{ fontSize: 13, marginTop: 6 }}>{a.interpretation}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
