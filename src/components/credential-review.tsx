"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function CredentialReview({
  applicationId,
  materialVersion,
  reviews,
}: {
  applicationId: string;
  materialVersion: string;
  reviews: {
    id: string;
    key: string;
    verdict: string;
    note: string;
    createdAt: Date;
    materialVersion: string;
  }[];
}) {
  const [key, setKey] = useState("GPA"),
    [verdict, setVerdict] = useState("VERIFIED"),
    [note, setNote] = useState(""),
    task = useTask(),
    router = useRouter();
  return (
    <section className="credential-review">
      <h3>Проверка академических сведений</h3>
      <div className="form-grid two">
        <label className="field">
          Что проверено
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="EDUCATION">Образование</option>
            <option value="GPA">Исходные оценки / GPA</option>
            <option value="EXAMS">Экзамены</option>
            <option value="LANGUAGE_CERTIFICATE">Языковой сертификат</option>
            <option value="VIDEO_LINK">Доступность видео</option>
          </select>
        </label>
        <label className="field">
          Результат
          <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            <option value="VERIFIED">Подтверждено по материалу</option>
            <option value="NEEDS_CLARIFICATION">Нужно уточнение</option>
            <option value="UNAVAILABLE">Источник недоступен</option>
            <option value="NOT_APPLICABLE">Не применяется</option>
          </select>
        </label>
      </div>
      <label className="field">
        Основание и конкретный материал
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={3000}
        />
      </label>
      <button
        type="button"
        className="button secondary"
        disabled={task.busy || note.trim().length < 10}
        onClick={() =>
          task.run(async () => {
            await action("credential.review", {
              applicationId,
              materialVersion,
              key,
              verdict,
              note,
            });
            setNote("");
            router.refresh();
          }, "Проверка сохранена отдельно от лидерских оценок.")
        }
      >
        Сохранить проверку
      </button>
      <Feedback task={task} />
      {reviews.length > 0 && (
        <details>
          <summary>История проверок · {reviews.length}</summary>
          {reviews.map((r) => (
            <p key={r.id}>
              <strong>
                {
                  (
                    {
                      EDUCATION: "Образование",
                      GPA: "GPA",
                      EXAMS: "Экзамены",
                      LANGUAGE_CERTIFICATE: "Языковой сертификат",
                      VIDEO_LINK: "Видео",
                    } as Record<string, string>
                  )[r.key]
                }{" "}
                ·{" "}
                {
                  (
                    {
                      VERIFIED: "Подтверждено",
                      NEEDS_CLARIFICATION: "Нужно уточнение",
                      UNAVAILABLE: "Источник недоступен",
                      NOT_APPLICABLE: "Не применяется",
                    } as Record<string, string>
                  )[r.verdict]
                }
              </strong>{" "}
              · {dateLabel(r.createdAt)}
              {r.materialVersion !== materialVersion
                ? " · материалы изменились"
                : ""}
              <br />
              {r.note}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
