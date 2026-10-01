import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { knowledgeMatches } from "../../src/lib/knowledge-match";
import { placementResult } from "../../src/lib/language-placement.server";
import { visionAsk } from "../../src/lib/vision-service.server";
import { db } from "../../src/lib/db";

test("local retrieval prefers a relevant authorized source and never invents one", () => {
  const sources = [
    { title: "Языковой сертификат", text: "Укажите исходную шкалу и дату." },
    { title: "Интервью", text: "Приглашение с временем видно после публикации." },
  ];
  assert.equal(knowledgeMatches("Когда будет интервью?", sources)[0], sources[1]);
  assert.deepEqual(knowledgeMatches("Землетрясение в Перу", sources), []);
});

test("written English placement returns a bounded preliminary level only for complete valid answers", () => {
  assert.equal(placementResult(undefined), null);
  assert.equal(placementResult({ "time-change": "time" }), null);
  const correct = {
    "time-change": "time",
    "visitor-reply": "free",
    "clarify-plan": "check",
    inference: "same-place",
    conditional: "conditional",
    argument: "reason",
  };
  assert.deepEqual(placementResult(correct), { correct: 6, total: 6, score: 100, level: "C1" });
  assert.deepEqual(placementResult({ ...correct, argument: "dismiss", conditional: "unclear" }), { correct: 4, total: 6, score: 67, level: "B1" });
  assert.equal(placementResult({ ...correct, argument: "forged" }), null);
});

test("candidate Vision answers a free question from current rules without an external call", async () => {
  const user = await db.user.create({ data: { role: "CANDIDATE", origin: "QA", name: "Тестовая кандидатка", email: `local-vision-${randomUUID()}@qa.local` } });
  try {
    const events: { type: string; value: unknown }[] = [];
    const row = await visionAsk(user, { scope: {}, question: "Расскажи про этот набор и программу", requestKey: randomUUID() }, new AbortController().signal, async (type, value) => { events.push({ type, value }); });
    assert.equal(row.provider, "local-knowledge");
    assert.ok(events.some((event) => event.type === "answer" && JSON.stringify(event.value).includes("набор")));
    assert.equal(events.at(-1)?.type, "done");
  } finally {
    await db.profileAnswer.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
