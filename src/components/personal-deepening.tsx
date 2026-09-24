"use client";
import { useState } from "react";
import { action } from "@/lib/client";
import type { ProfileView } from "@/lib/profile-contract";
import { deepeningPrompts } from "@/lib/path-progress";
import { DevelopmentStepCard } from "./interactive-profile";
import { Feedback, useTask } from "./ui";
export function PersonalDeepening({
  attemptId,
  revision,
  slug,
}: {
  attemptId: string;
  revision: number;
  slug: string;
}) {
  const task = useTask(),
    [view, setView] = useState<ProfileView | null>(null);
  const scope = { attemptId, revision };
  const recommendation = view?.recommendations.find(
    (r) =>
      r.kind === "EXPLAIN" &&
      r.attemptId === attemptId &&
      r.revision === revision,
  );
  const step = view?.steps.find(
    (s) =>
      s.recommendation?.kind === "EXPLAIN" &&
      s.recommendation.attemptId === attemptId &&
      s.recommendation.revision === revision,
  );
  async function load() {
    const next = await action<ProfileView>("profile.load", { scope });
    setView(next);
    return next;
  }
  return (
    <details
      className="personal-deepening"
      onToggle={(e) => {
        if (e.currentTarget.open && !view)
          task.run(async () => {
            await load();
          });
      }}
    >
      <summary>
        Дополнительный шаг: объясни свой выбор{" "}
        <span className="path-points">
          {step?.status === "SELF_REPORTED" ? "Выполнено" : "+5 поинтов"}
        </span>
      </summary>
      <p>
        Сравни своё решение с альтернативой. Это поможет увидеть, где твой
        подход работает, а где его стоит изменить.
      </p>
      {step ? (
        <DevelopmentStepCard step={step} scope={scope} reload={load} brief />
      ) : (
        <>
          <p>{deepeningPrompts[slug]}</p>
          <button
            className="button secondary"
            disabled={task.busy || !recommendation}
            onClick={() =>
              task.run(async () => {
                await action("profile.stepStart", {
                  scope,
                  key: recommendation!.key,
                });
                await load();
              })
            }
          >
            Записать объяснение
          </button>
        </>
      )}
      <p className="subtle">
        Добровольно. Поинты за объяснение начисляются один раз в этом
        направлении. Они видны только тебе и не влияют на поступление.
      </p>
      <Feedback task={task} />
    </details>
  );
}
