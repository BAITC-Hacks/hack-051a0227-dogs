import assert from "node:assert/strict";
import test from "node:test";
import { interviewSuggestions } from "../src/lib/interview-suggestions";

const titles = ["Опыт и личная роль", "Мотивация", "Эссе · ответ"];
const sources = titles.map((title, index) => ({ id: `source-${index}`, title }));

test("fictional candidates receive distinct, source-linked interview prompts", () => {
  const origin = "SHOWCASE_PUBLIC_20260930";
  const mira = interviewSuggestions({ origin, email: "mira.showcase@invision.invalid", sources });
  const dana = interviewSuggestions({ origin, email: "dana.showcase@invision.invalid", sources });
  assert.equal(mira.length, 3);
  assert.equal(dana.length, 3);
  assert.notEqual(mira[0].text, dana[0].text);
  assert.ok(mira.every((question) => sources.some((source) => source.id === question.sourceId)));
  assert.match(mira[0].text, /олимпиады/);
  assert.match(dana[0].text, /цитаты выпускницы/);
});

test("prepared questions never leak into another origin and missing sources are omitted", () => {
  const origin = "SHOWCASE_PUBLIC_20260930";
  assert.deepEqual(interviewSuggestions({ origin, email: "mira.showcase@invision.invalid", sources: [] }), []);
  const own = interviewSuggestions({ origin: "USER", email: "mira.showcase@invision.invalid", sources,
    scoringQuestions: [{ id: "q1", sourceId: sources[0].id, section: "action", gap: "Личный вклад", text: "Что именно вы сделали?" }] });
  assert.equal(own.length, 1);
  assert.equal(own[0].text, "Что именно вы сделали?");
});

test("an applicant without a scoring run still has source-grounded preparation questions", () => {
  const suggestions = interviewSuggestions({ origin: "USER", email: "candidate@example.test",
    sources: [{ id: "experience", title: "Опыт и личная роль", content: "Я сверила ответы участников с записью интервью. Затем исправила цитату." }] });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].sourceId, "experience");
  assert.match(suggestions[0].text, /сверила ответы участников/);
});
