import { test } from "node:test";
import assert from "node:assert/strict";
import { learningFacts, learningQuestion } from "../src/lib/learning-context";
import { initialMission } from "../src/lib/missions";
import { reorderItems } from "../src/lib/reorder";
test("Контекст Vision содержит только разрешённые учебные значения", () => {
  const m = initialMission("digital-media");
  m.plan.explanation = "PRIVATE biography";
  m.plan.verification = "PRIVATE document";
  m.plan.choices["injected"] = "PRIVATE instructions";
  m.plan.sequence.push("PRIVATE sequence");
  const text = learningFacts("digital-media", { mission: m }, 2, false);
  assert.ok(text.includes("Версия работы: 2"));
  assert.ok(text.includes("Порядок:"));
  assert.ok(!text.includes("PRIVATE"));
  assert.equal(
    learningFacts("digital-media", { arbitrary: "PRIVATE" }, 1, false).includes(
      "PRIVATE",
    ),
    false,
  );
  const safe = learningQuestion(
    "Арина test@example.com +7 771 555 66 77 https://private.local sk-secret",
    "Арина".split("|"),
  );
  assert.ok(!/Арина|example|771|private|sk-secret/u.test(safe));
});
test("Перестановка сохраняет элементы: перенос, обмен и крайние позиции", () => {
  const a = ["a", "b", "c", "d"];
  assert.deepEqual(reorderItems(a, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(reorderItems(a, 0, 2, true), ["c", "b", "a", "d"]);
  assert.deepEqual(a, ["a", "b", "c", "d"]);
  assert.equal(reorderItems(a, -1, 2), a);
  assert.equal(reorderItems(a, 0, 9), a);
});
