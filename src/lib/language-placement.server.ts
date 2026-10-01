import "server-only";
import { placementQuestions, type PlacementAnswers } from "./language-placement";

const answerKey: Record<(typeof placementQuestions)[number]["id"], string> = {
  "time-change": "time",
  "visitor-reply": "free",
  "clarify-plan": "check",
  inference: "same-place",
  conditional: "conditional",
  argument: "reason",
};

export function placementResult(answers: PlacementAnswers | undefined) {
  if (!answers || placementQuestions.some((question) => !question.choices.some(([id]) => id === answers[question.id]))) return null;
  const correct = placementQuestions.reduce((sum, question) => sum + Number(answers[question.id] === answerKey[question.id]), 0);
  const level = correct <= 1 ? "A1" : correct === 2 ? "A2" : correct <= 4 ? "B1" : correct === 5 ? "B2" : "C1";
  return { correct, total: placementQuestions.length, score: Math.round(correct * 100 / placementQuestions.length), level };
}
