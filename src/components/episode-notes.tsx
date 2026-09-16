"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { loadCandidate } from "@/lib/data";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
export function EpisodeNotes({
  application: a,
  sourceId,
}: {
  application: Candidate;
  sourceId: string;
}) {
  const [quote, setQuote] = useState("");
  const task = useTask(),
    router = useRouter();
  const source = a.sources.find((s) => s.id === sourceId);
  if (!source || source.materialId || source.kind === "Видео (ссылка)")
    return null;
  return (
    <details className="versions">
      <summary>Отметить фрагмент и личное действие</summary>
      <p className="subtle">
        Повторное описание добавьте к тому же эпизоду. Похожее название не
        объединяет проекты автоматически.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          task.run(async () => {
            await action("review.episode", {
              applicationId: a.id,
              materialVersion: a.materialVersion,
              sourceId,
              quote,
              episodeId: f.get("episodeId"),
              title: f.get("title"),
              personalAction: f.get("personalAction"),
            });
            router.refresh();
          }, "Фрагмент связан с эпизодом. Исходный материал сохранён.");
        }}
      >
        <button
          className="text-link"
          type="button"
          onClick={() => setQuote(window.getSelection()?.toString() ?? "")}
        >
          Взять выделенный фрагмент
        </button>
        <label className="field">
          Точная цитата
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            minLength={10}
            maxLength={2000}
            required
          />
        </label>
        <label className="field">
          К какому эпизоду относится
          <select name="episodeId">
            <option value="">Новый отдельный эпизод</option>
            {a.episodes
              .filter((e) => !e.mergedIntoId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Название нового эпизода
          <input name="title" maxLength={160} />
        </label>
        <label className="field">
          Личное действие по этому фрагменту
          <textarea
            name="personalAction"
            minLength={15}
            maxLength={4000}
            required
          />
        </label>
        <button className="button secondary small" disabled={task.busy}>
          Сохранить фрагмент
        </button>
      </form>
      <Feedback task={task} />
    </details>
  );
}
export function MergeEpisodes({ application: a }: { application: Candidate }) {
  const task = useTask(),
    router = useRouter();
  const episodes = a.episodes.filter((e) => !e.mergedIntoId);
  if (episodes.length < 2) return null;
  return (
    <details className="versions">
      <summary>Объединить сведения об одном проекте</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          task.run(async () => {
            await action("review.merge", {
              applicationId: a.id,
              materialVersion: a.materialVersion,
              fromId: f.get("fromId"),
              intoId: f.get("intoId"),
              reason: f.get("reason"),
            });
            router.refresh();
          }, "Сведения объединены явно. Исходные записи и основание сохранены.");
        }}
      >
        <label className="field">
          Дополнительное описание
          <select name="fromId">
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Основной эпизод
          <select name="intoId">
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Почему это один проект
          <textarea name="reason" required minLength={15} maxLength={4000} />
        </label>
        <button className="button secondary small" disabled={task.busy}>
          Объединить сведения
        </button>
      </form>
      <Feedback task={task} />
    </details>
  );
}
