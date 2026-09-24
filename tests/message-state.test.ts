import { test } from "node:test";
import assert from "node:assert/strict";
import { unansweredQuestions } from "../src/lib/message-state";
test("Связанный ответ закрывает свой вопрос, а свободное сообщение не скрывает остальные", () => {
  const questions = ["q1", "q2"].map((id) => ({
    id,
    kind: "QUESTION",
    createdAt: "2026-09-24T10:00:00Z",
    author: { role: "STAFF" },
  }));
  const reply = {
    id: "a",
    kind: "MESSAGE",
    createdAt: "2026-09-24T11:00:00Z",
    author: { role: "CANDIDATE" },
  };
  assert.equal(unansweredQuestions([...questions, reply]).length, 2);
  assert.deepEqual(
    unansweredQuestions([...questions, { ...reply, replyToId: "q2" }]).map(
      (q) => q.id,
    ),
    ["q1"],
  );
  assert.deepEqual(
    unansweredQuestions([{ ...questions[0], kind: "MESSAGE" }, reply]),
    [],
  );
  assert.equal(
    unansweredQuestions([
      ...questions,
      { ...reply, kind: "RECEIPT", replyToId: "q1" },
    ]).length,
    2,
  );
});

test("Историческое уточнение остаётся важным действием до ответа кандидата", () => {
  const question = {
    id: "legacy",
    kind: "CLARIFICATION",
    createdAt: "2026-09-24T10:00:00Z",
    author: { role: "STAFF" },
  };
  const reply = {
    id: "answer",
    kind: "MESSAGE",
    createdAt: "2026-09-24T11:00:00Z",
    author: { role: "CANDIDATE" },
  };
  assert.equal(unansweredQuestions([question]).length, 1);
  assert.equal(
    unansweredQuestions([question, { ...reply, replyToId: "legacy" }]).length,
    0,
  );
  assert.equal(unansweredQuestions([question, reply]).length, 0);
  assert.equal(
    unansweredQuestions([question, { ...reply, replyToId: "another-question" }])
      .length,
    1,
  );
});
