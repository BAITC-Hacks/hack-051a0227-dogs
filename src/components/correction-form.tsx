"use client";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function CorrectionForm({ sourceId }: { sourceId: string }) {
  const task = useTask();
  const router = useRouter();
  return (
    <details className="versions">
      <summary>Уточнить фактическую ошибку</summary>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const explanation = new FormData(form).get("explanation");
          task.run(async () => {
            await action("correction", { sourceId, explanation });
            form.reset();
            router.refresh();
          }, "Уточнение сохранено. Исходный источник и оценки сотрудника сохранены в истории.");
        }}
      >
        <label className="field">
          Что нужно исправить и на каком основании?
          <textarea
            name="explanation"
            required
            minLength={10}
            maxLength={3000}
          />
        </label>
        <button className="button secondary small" disabled={task.busy}>
          Сохранить уточнение
        </button>
      </form>
      <Feedback task={task} />
    </details>
  );
}
