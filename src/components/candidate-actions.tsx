"use client";
import { useState } from "react";
import type { loadCandidate } from "@/lib/data";
import { CalendarForm, StageActions } from "./selection-actions";

type Candidate = Awaited<ReturnType<typeof loadCandidate>>;
type Choice = "approve" | "decline" | "interview" | null;

export function CandidateActions({ application: a }: { application: Candidate }) {
  const [choice, setChoice] = useState<Choice>(null);
  const interview = a.interviews.find((item) => !["COMPLETED", "CANCELLED"].includes(item.status));
  const base = {
    id: a.id,
    revision: a.revision,
    materialVersion: a.materialVersion,
    stage: a.stage,
    email: a.user.email ?? "",
  };
  return (
    <section className="candidate-actions" id="candidate-actions" aria-label="Действия комиссии">
      <div className="candidate-actions-heading">
        <h2>Действие по заявке</h2>
      </div>
      {a.stage === "DECIDED" ? (
        <p className="subtle">Рассмотрение завершено. Сохранённое решение и публикацию можно открыть в списке решений.</p>
      ) : (
        <>
          <div className="candidate-action-buttons">
            <button type="button" className={`button ${choice === "approve" ? "primary" : "secondary"}`} aria-pressed={choice === "approve"} onClick={() => setChoice(choice === "approve" ? null : "approve")}>Принять</button>
            <button type="button" className={`button ${choice === "decline" ? "primary" : "secondary"}`} aria-pressed={choice === "decline"} onClick={() => setChoice(choice === "decline" ? null : "decline")}>Отклонить</button>
            <button type="button" className={`button ${choice === "interview" ? "primary" : "secondary"}`} aria-pressed={choice === "interview"} onClick={() => setChoice(choice === "interview" ? null : "interview")}>Интервью</button>
          </div>
          {choice === "approve" && <StageActions key="approve" application={base} fixedChoice="APPROVE_STAGE" />}
          {choice === "decline" && <StageActions key="decline" application={base} fixedChoice="DECLINE" />}
          {choice === "interview" && <CalendarForm key="interview" application={base} interview={interview} initiallyOpen compact />}
        </>
      )}
    </section>
  );
}
