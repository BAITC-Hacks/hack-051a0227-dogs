"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { deskConsentSchema, deskSourceKinds } from "@/lib/vision-desk-contract";
import { Feedback, useTask } from "./ui";
export function DeskConsent({
  applicationId,
  initial,
  sources,
}: {
  applicationId: string;
  initial: unknown;
  sources: { id: string; title: string; kind: string }[];
}) {
  const parsed = deskConsentSchema.safeParse(initial),
    task = useTask(),
    router = useRouter();
  const [consent, setConsent] = useState(
      parsed.success
        ? parsed.data
        : { granted: false, revision: 0, sourceIds: [] as string[], at: "" },
    ),
    [selected, setSelected] = useState(consent.sourceIds),
    [confirm, setConfirm] = useState(false);
  return (
    <details className="desk-consent">
      <summary>
        Разрешение на фактическую подготовку с OpenAI ·{" "}
        {consent.granted ? "дано" : "не дано"}
      </summary>
      <p>
        Можно разрешить серверу передать выбранные текстовые источники OpenAI
        для фактической сводки и вопросов сотруднику. Файлы, голос, личное
        обучение и скрытые оценки не передаются. Это добровольно и не меняет
        очередь или решение. Без разрешения сотрудник работает с материалами
        внутри приложения.
      </p>
      <p>
        Новые ответы не включаются автоматически. Разрешение можно отозвать; уже
        отправленный внешний запрос отозвать нельзя.
      </p>
      {sources
        .filter((s) => deskSourceKinds.includes(s.kind))
        .map((s) => (
          <label className="check-row" key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={(e) => {
                setSelected((x) =>
                  e.target.checked
                    ? [...x, s.id]
                    : x.filter((id) => id !== s.id),
                );
                setConfirm(false);
              }}
            />
            {s.title}
          </label>
        ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        Разрешаю указанную обработку выбранных источников OpenAI
      </label>
      <div className="desk-toolbar">
        <button
          className="button secondary"
          disabled={!confirm || !selected.length || task.busy}
          onClick={() =>
            task.run(async () => {
              setConsent(
                await action("desk.consent", {
                  applicationId,
                  revision: consent.revision,
                  granted: true,
                  sourceIds: selected,
                }),
              );
              setConfirm(false);
              router.refresh();
            }, "Разрешение сохранено.")
          }
        >
          Сохранить разрешение
        </button>
        {consent.granted && (
          <button
            className="text-link"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                setConsent(
                  await action("desk.consent", {
                    applicationId,
                    revision: consent.revision,
                    granted: false,
                    sourceIds: [],
                  }),
                );
                router.refresh();
              }, "Разрешение отозвано. Новые запросы остановлены.")
            }
          >
            Отозвать разрешение
          </button>
        )}
      </div>
      <Feedback task={task} />
    </details>
  );
}
