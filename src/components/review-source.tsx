"use client";
import { dateLabel } from "@/lib/client";
export type ReviewSource = {
  id: string;
  title: string;
  kind: string;
  content: string;
  material?: { id: string; mime: string; name: string } | null;
  messageContext?: {
    author: string;
    createdAt: Date;
    question: { body: string; author: string; createdAt: Date } | null;
  };
  corrections?: { id: string; explanation: string; createdAt: Date }[];
};
export function SourceContent({ source }: { source: ReviewSource }) {
  return (
    <>
      <h3>{source.messageContext ? "Ответ кандидата" : source.title}</h3>
      {source.messageContext && (
        <div className="source-question">
          {source.messageContext.question ? (
            <>
              <strong>Вопрос комиссии</strong>
              <p>{source.messageContext.question.body}</p>
              <p className="subtle">
                {source.messageContext.question.author} ·{" "}
                {dateLabel(source.messageContext.question.createdAt)}
              </p>
            </>
          ) : (
            <p className="subtle">
              В этой записи вопрос не был привязан. Переписка сохранена в
              «Вопросах кандидату».
            </p>
          )}
          <p>
            <strong>{source.messageContext.author}</strong> ·{" "}
            {dateLabel(source.messageContext.createdAt)}
          </p>
        </div>
      )}
      {source.kind === "Видео (ссылка)" &&
      source.content.startsWith("https://") ? (
        <a
          className="button secondary small"
          href={source.content}
          target="_blank"
          rel="noreferrer"
        >
          Открыть видео
        </a>
      ) : (
        <blockquote>{source.content}</blockquote>
      )}
      {source.material &&
        (source.material.mime.startsWith("audio/") ? (
          <audio
            aria-label={source.title}
            controls
            preload="metadata"
            src={"/api/files/" + source.material.id}
          />
        ) : source.material.mime.startsWith("video/") ? (
          <video
            aria-label={source.title}
            controls
            preload="metadata"
            src={"/api/files/" + source.material.id}
          />
        ) : (
          <>
            <p className="subtle">
              Документ приложен как материал. Извлечённого текста нет;
              содержание нужно открыть и просмотреть.
            </p>
            <a
              className="button secondary small"
              href={"/api/files/" + source.material.id}
              target="_blank"
              rel="noreferrer"
            >
              Открыть документ
            </a>
          </>
        ))}
      {source.corrections?.map((c) => (
        <div className="notice info" key={c.id}>
          <div>
            <strong>Запрос исправления · {dateLabel(c.createdAt)}</strong>
            <p>{c.explanation}</p>
            <small>
              Исходный текст сохранён. Исправление ещё требует рассмотрения.
            </small>
          </div>
        </div>
      ))}
      <p className="source-foot">
        {source.kind} · просмотр не подтверждает истинность рассказа.
      </p>
    </>
  );
}
