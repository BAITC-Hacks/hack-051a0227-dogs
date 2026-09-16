"use client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function SettingsForm({
  guidance,
  version,
}: {
  guidance: string;
  version: number;
}) {
  const router = useRouter();
  const task = useTask();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const guidance = new FormData(e.currentTarget).get("guidance");
        task.run(async () => {
          await action("settings", { guidance });
          router.refresh();
        }, "Новая версия правил рассмотрения сохранена.");
      }}
    >
      <label className="field">
        Правила для оценок сотрудника · версия {version}
        <textarea
          key={version}
          name="guidance"
          defaultValue={guidance}
          minLength={40}
          maxLength={5000}
          rows={12}
          required
        />
      </label>
      <p className="subtle" style={{ marginTop: 14 }}>
        Новая версия применяется к последующим оценкам. Ранее сохранённые выводы
        сохраняют номер своей рубрики.
      </p>
      <button
        className="button primary"
        disabled={task.busy}
        style={{ marginTop: 20 }}
      >
        <Save size={17} />
        Сохранить новую версию
      </button>
      <Feedback task={task} />
    </form>
  );
}
