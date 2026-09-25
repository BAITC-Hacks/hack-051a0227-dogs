"use client";
import { useEffect, useRef, useState } from "react";
import { Quote, X } from "lucide-react";
import { action } from "@/lib/client";
import type { ScoringResult } from "@/lib/scoring-contract";
import { DeskConversation } from "./desk-chat";
import { Feedback, useTask } from "./ui";
export function ScoringEvidence({
  evidence,
  applicationId,
  runId,
  onSource,
}: {
  evidence: ScoringResult["evidence"][number];
  applicationId: string;
  runId: string;
  onSource: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [chat, setChat] = useState(false),
    [verified, setVerified] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    task = useTask();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  async function show() {
    setVerified(false);
    setChat(false);
    setOpen(true);
    const current = await action<ScoringResult["evidence"][number]>(
      "scoring.evidence",
      {
        applicationId,
        runId,
        evidenceId: evidence.id,
      },
    );
    if (
      current.sourceVersion !== evidence.sourceVersion ||
      current.quote !== evidence.quote
    )
      throw new Error(
        "Основание изменилось или стало недоступно. Обновите анализ.",
      );
    setVerified(true);
  }
  return (
    <>
      <button
        ref={trigger}
        className="source-button evidence-trigger"
        onClick={() => task.run(show)}
      >
        <Quote size={15} />
        Цитата и основание
      </button>
      <dialog
        ref={ref}
        className="desk-dialog evidence-dialog"
        onClose={() => setOpen(false)}
      >
        <div className="desk-dialog-head">
          <div>
            <h2>Основание оценки</h2>
            <p>Фрагмент из рассмотренной версии</p>
          </div>
          <button
            aria-label="Закрыть основание"
            className="icon-button"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <Feedback task={task} />
        {verified && (
          <>
            <blockquote className="evidence-quote">{evidence.quote}</blockquote>
            <p>{evidence.explanation}</p>
            <details>
              <summary>Версия источника</summary>
              <p className="meta">{evidence.sourceVersion}</p>
            </details>
            <div className="desk-evidence-actions">
              <button
                className="button secondary"
                onClick={() => {
                  ref.current?.close();
                  setOpen(false);
                  trigger.current?.focus();
                  onSource(evidence.sourceId);
                }}
              >
                Открыть полный источник
              </button>
              <button
                className="button dark"
                aria-expanded={chat}
                onClick={() => setChat(!chat)}
              >
                Уточнить у Vision Desk
              </button>
            </div>
            {chat && (
              <DeskConversation
                applicationIds={[applicationId]}
                sourceId={evidence.sourceId}
                initialQuestion="Что именно сообщает кандидат в этом источнике и какой предметный вопрос поможет уточнить его личный вклад?"
              />
            )}
          </>
        )}
      </dialog>
    </>
  );
}
