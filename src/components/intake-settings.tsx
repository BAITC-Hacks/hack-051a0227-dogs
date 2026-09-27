"use client";
import { useState } from "react";
import { type IntakeRules } from "@/lib/intake-contract";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function IntakeSettings({ rules }: { rules: IntakeRules }) {
  const [text, setText] = useState(JSON.stringify(rules, null, 2)),
    [expected, setExpected] = useState(rules.version),
    task = useTask();
  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        task.run(async () => {
          const result = await action<IntakeRules>("intake.rules", {
            rules: JSON.parse(text),
            expected,
          });
          setExpected(result.version);
        }, "Новая версия применяется к черновикам. Отправленные заявки сохраняют прежние требования.");
      }}
    >
      <p>
        Текущая версия: {expected}. Изменение требует нового значения version.
        UNIVERSITY означает подтверждённое требование, ADDITIONAL дополнительное
        поле, AUTHORED авторское правило. Не переносите условия бакалавриата на
        Foundation.
      </p>
      <label className="field">
        Правила набора
        <textarea
          rows={24}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button className="button primary" disabled={task.busy}>
        Сохранить новую версию
      </button>
      <Feedback task={task} />
    </form>
  );
}
