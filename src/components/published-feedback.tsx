import type { myData } from "@/lib/data";
import { dateLabel } from "@/lib/client";
import { InteractiveProfile } from "./interactive-profile";
type Data = NonNullable<Awaited<ReturnType<typeof myData>>>;
export function PublishedFeedback({
  application: app,
}: {
  application: NonNullable<Data["application"]>;
}) {
  if (!app.feedback.length) return null;
  return (
    <section className="published-feedback" id="published-feedback">
      <h2>Обратная связь комиссии</h2>
      {app.feedback.map((f) => (
        <article className="panel" key={f.id}>
          <p className="meta">Опубликовано {dateLabel(f.publishedAt!)}</p>
          <h3>Конкретное наблюдение</h3>
          <p>{f.observation}</p>
          <h3>Что уточнить или развивать</h3>
          <p>{f.suggestion}</p>
          <div className="notice info">
            <div>
              <strong>Следующий шаг</strong>
              <p>{f.nextAction}</p>
            </div>
          </div>
          <details className="versions">
            <summary>К каким материалам относится</summary>
            {f.sourceIds.map((id) => {
              const s = app.sources.find((s) => s.id === id);
              return s ? (
                <div className="evidence-row" key={id}>
                  <h3>{s.title}</h3>
                  <p className="subtle">{s.kind}</p>
                  {s.materialId ? (
                    <a
                      className="text-link"
                      href={"/api/files/" + s.materialId}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть свой материал
                    </a>
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap" }}>{s.content}</p>
                  )}
                </div>
              ) : null;
            })}
          </details>
          <InteractiveProfile scope={{feedbackId:f.id}} title="Разобрать обратную связь и подготовить свой шаг" initialTopic="feedback"/>
        </article>
      ))}
    </section>
  );
}
