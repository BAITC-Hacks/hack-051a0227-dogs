"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { domains } from "@/lib/catalog";
import { gaps, woundedBoundary } from "@/lib/review-contract";
import { action, dateLabel } from "@/lib/client";
import type { loadCandidate } from "@/lib/data";
import { Feedback, Tag, useTask } from "./ui";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
export function ReviewMap({
  application: a,
  onSource,
}: {
  application: Candidate;
  onSource: (id: string) => void;
}) {
  const router = useRouter(),
    task = useTask();
  const [domain, setDomain] = useState<string>(domains[5]);
  const [sourceIds, setSourceIds] = useState<string[]>(
    a.domainReviews.find((r) => r.domain === domains[5])?.sourceIds ?? [],
  );
  const activeReview = a.domainReviews.find((r) => r.domain === domain);
  return (
    <section className="review-section" id="review-map">
      <h2>Карта проверки · девять областей</h2>
      <p className="section-subtitle">
        Сведения, согласованность и проявление рассматриваются отдельно.
        Отсутствие ответа не является низкой оценкой.
      </p>
      <div className="domain-map">
        {domains.map((d) => {
          const r = a.domainReviews.find((r) => r.domain === d),
            assessment = a.assessments.find((x) => x.domain === d),
            ids = r?.sourceIds ?? assessment?.sourceIds ?? [];
          const viewed = ids.filter((id) => {
            const s = a.sources.find((s) => s.id === id);
            return s?.views.some((v) =>
              s.corrections.every((c) => v.correctionIds.includes(c.id)),
            );
          });
          return (
            <details key={d} className="domain-item">
              <summary>
                <strong>{d}</strong>
                <span>
                  {r?.sufficiency ?? "Не рассмотрено"} ·{" "}
                  {assessment ? "Есть оценка сотрудника" : "Без оценки"}
                </span>
              </summary>
              <dl className="domain-facts">
                <div>
                  <dt>Достаточность сведений</dt>
                  <dd>
                    {r?.sufficiency ??
                      assessment?.sufficiency ??
                      "Не рассмотрено"}
                  </dd>
                </div>
                <div>
                  <dt>Согласованность</dt>
                  <dd>{r?.consistency ?? "Не проверено"}</dd>
                </div>
                <div>
                  <dt>Проявление</dt>
                  <dd>{assessment?.level ?? "Оценка не выставлена"}</dd>
                </div>
                <div>
                  <dt>Критерии</dt>
                  <dd>
                    {assessment
                      ? `Версия ${assessment.rubricVersion}`
                      : "Не применялись"}
                  </dd>
                </div>
              </dl>
              {(r && r.materialVersion !== a.materialVersion) ||
              (assessment &&
                assessment.materialVersion !== a.materialVersion) ? (
                <p className="notice info">
                  После записи вывода появились другие материалы или версия
                  рассмотрения не была зафиксирована. Нужна сверка.
                </p>
              ) : null}
              <p className="subtle">
                Отмечено просмотренными: {viewed.length} из {ids.length}{" "}
                связанных источников. Это не подтверждение истинности.
              </p>
              <div className="source-buttons">
                {ids.map((id) => (
                  <button
                    key={id}
                    className="source-button"
                    onClick={() => onSource(id)}
                  >
                    {a.sources.find((s) => s.id === id)?.title ?? "Источник"}
                  </button>
                ))}
              </div>
              {r?.observation && (
                <p>
                  <strong>Наблюдение:</strong> {r.observation}
                </p>
              )}
              {r?.question && (
                <p>
                  <strong>Открытый вопрос:</strong> {r.question}
                </p>
              )}
              {assessment?.contradiction && (
                <p>
                  <strong>Заметка о согласованности:</strong>{" "}
                  {assessment.contradiction}
                </p>
              )}
              {assessment && (
                <p>
                  <strong>Интерпретация сотрудника:</strong>{" "}
                  {assessment.interpretation}
                </p>
              )}
              {d === domains[8] && (
                <p className="notice info">{woundedBoundary}</p>
              )}
              {r && (
                <p className="meta">Зафиксировано {dateLabel(r.createdAt)}</p>
              )}
              <button
                className="text-link"
                onClick={() => {
                  setDomain(d);
                  setSourceIds(ids);
                  document
                    .getElementById("review-map-form")
                    ?.scrollIntoView({ block: "center" });
                }}
              >
                Записать наблюдение или вопрос
              </button>
            </details>
          );
        })}
      </div>
      <details className="assessment-form" id="review-map-form" open>
        <summary>Отметить основания и пробел</summary>
        <form
          key={domain}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            task.run(async () => {
              await action("review.domain", {
                applicationId: a.id,
                materialVersion: a.materialVersion,
                domain,
                sourceIds,
                sufficiency: f.get("sufficiency"),
                consistency: f.get("consistency"),
                gap: f.get("gap"),
                question: f.get("question"),
                observation: f.get("observation"),
              });
              router.refresh();
            }, "Карта проверки сохранена. Оценка проявления не менялась.");
          }}
        >
          <label className="field">
            Область проверки
            <select
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setSourceIds(
                  a.domainReviews.find((r) => r.domain === e.target.value)
                    ?.sourceIds ?? [],
                );
              }}
            >
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {domain === domains[8] && (
            <p className="notice info">{woundedBoundary}</p>
          )}
          <div className="form-grid two">
            <label className="field">
              Достаточность сведений
              <select
                name="sufficiency"
                defaultValue={activeReview?.sufficiency ?? "Не рассмотрено"}
              >
                <option>Не рассмотрено</option>
                <option>Недостаточно</option>
                <option>Частично</option>
                <option>Достаточно</option>
              </select>
            </label>
            <label className="field">
              Согласованность
              <select
                name="consistency"
                defaultValue={activeReview?.consistency ?? "Не проверено"}
              >
                <option>Не проверено</option>
                <option>Не обнаружено противоречий</option>
                <option>Есть противоречие</option>
              </select>
            </label>
          </div>
          <fieldset className="source-checks">
            <legend>Связанные источники</legend>
            {a.sources.map((s) => (
              <label className="check-label" key={s.id}>
                <input
                  type="checkbox"
                  checked={sourceIds.includes(s.id)}
                  onChange={(e) =>
                    setSourceIds((prev) =>
                      e.target.checked
                        ? [...prev, s.id]
                        : prev.filter((id) => id !== s.id),
                    )
                  }
                />
                {s.title} <Tag>{s.kind}</Tag>
              </label>
            ))}
          </fieldset>
          <label className="field">
            Отмеченный пробел
            <select name="gap" defaultValue={activeReview?.gap ?? "NONE"}>
              {Object.entries(gaps).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Вопрос для проверки
            <textarea
              name="question"
              defaultValue={activeReview?.question ?? ""}
              maxLength={4000}
              placeholder="Что именно осталось неясным?"
            />
          </label>
          <label className="field">
            Наблюдение сотрудника
            <textarea
              name="observation"
              defaultValue={activeReview?.observation ?? ""}
              maxLength={4000}
              placeholder="Конкретный факт или ограничение сведений"
            />
          </label>
          <button className="button secondary" disabled={task.busy}>
            Сохранить карту проверки
          </button>
        </form>
        <Feedback task={task} />
      </details>
    </section>
  );
}
