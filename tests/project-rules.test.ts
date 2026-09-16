import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectSchema,
  initialState,
  checkProject,
  changesBetween,
} from "../src/lib/projects";
import {
  fieldsSchema,
  emptyFields,
  submissionIssues,
  validSignature,
} from "../src/lib/validation";
const state = () => structuredClone(initialState);
test("Все пять проб принимают неполную сохранённую работу, сохраняя разные проверки", () => {
  assert.equal(projectSchema.safeParse(state()).success, true);
  const results = [
    "digital-products",
    "digital-media",
    "creative-engineering",
    "sociology",
    "public-policy",
  ].map((slug) => checkProject(slug, state()));
  assert.equal(new Set(results.map((r) => r.actions.join())).size, 5);
  assert.ok(results.every((r) => r.checks.length >= 2));
});
test("Маршрут реагирует на порядок, обязательность и завершение", () => {
  const s = state();
  assert.equal(checkProject("digital-products", s).checks[0].passed, false);
  s.screens = ["event", "profile", "confirm"];
  s.requiredPhone = false;
  assert.ok(checkProject("digital-products", s).checks.every((c) => c.passed));
  assert.deepEqual(changesBetween("digital-products", initialState, s), [
    "Порядок экранов",
    "Обязательность телефона",
  ]);
  s.screens = ["confirm", "profile", "event"];
  assert.equal(
    checkProject("digital-products", s).checks.at(-1)?.passed,
    false,
  );
});
test("Медиа проверяет изменённое время и неподтверждённый слух", () => {
  const s = state();
  s.caption = "Встречаемся в 16:00";
  assert.ok(checkProject("digital-media", s).checks.every((c) => c.passed));
  s.headline = "Встреча отменена";
  assert.equal(checkProject("digital-media", s).checks[1].passed, false);
  s.headline = "Встречаемся";
  s.caption = "Встречаемся в 14:00, а потом в 16:00";
  assert.equal(checkProject("digital-media", s).checks[0].passed, false);
});
test("Инженерия проверяет проход, ресурс и соседство по стороне", () => {
  const s = state();
  s.modules = [
    { kind: "desk", cell: 0 },
    { kind: "power", cell: 1 },
    { kind: "screen", cell: 2 },
  ];
  assert.ok(
    checkProject("creative-engineering", s).checks.every((c) => c.passed),
  );
  s.modules.push({ kind: "screen", cell: 7 });
  const checks = checkProject("creative-engineering", s).checks;
  assert.equal(checks[0].passed, false);
  assert.equal(checks[1].passed, false);
  assert.equal(checks[3].passed, false);
});
test("Исследование не выдаёт оценку личности за классификацию источников", () => {
  const s = state();
  s.classifications = {
    a: "observation",
    b: "assumption",
    c: "observation",
    d: "assumption",
  };
  s.question = "Что мешает не посетившим библиотеку?";
  s.note = "Нужна другая выборка, а не вывод обо всех школьниках.";
  assert.ok(checkProject("sociology", s).checks.every((c) => c.passed));
  assert.equal("score" in checkProject("sociology", s), false);
});
test("Ресурс не может пройти проверку при превышении бюджета", () => {
  const s = state();
  s.allocations = [8, 6, 1];
  s.explanation = "В первую очередь обеспечим материалы и время наставников.";
  assert.equal(checkProject("public-policy", s).checks[0].passed, false);
  s.allocations = [4, 4, 4];
  assert.ok(checkProject("public-policy", s).checks.every((c) => c.passed));
});
test("Поддельная геометрия и дубли экранов отклоняются серверной схемой", () => {
  const s = state();
  s.modules = [{ kind: "desk", cell: 20 }];
  assert.equal(projectSchema.safeParse(s).success, false);
  s.modules = [];
  s.screens = ["event", "event", "confirm"];
  assert.equal(projectSchema.safeParse(s).success, false);
});
test("Forced-choice требует разные ответы; исследовательское согласие не обязательно", () => {
  const f = {
    ...emptyFields,
    name: "Елена Иванова",
    email: "person@example.org",
    city: "Алматы",
    experience: "Я провела несколько интервью и описала выводы для команды.",
    personalRole: "Исследование и анализ",
    motivation:
      "Хочу изучать проектирование и исследование потребностей людей.",
    videoUrl: "https://example.org/video",
    most: "0",
    least: "0",
    processing: true,
    documentNote: "Сертификат требует уточнения.",
  };
  assert.equal(fieldsSchema.safeParse(f).success, false);
  f.least = "1";
  assert.equal(fieldsSchema.safeParse(f).success, true);
  assert.deepEqual(submissionIssues(f, []), []);
  f.processing = false;
  assert.ok(submissionIssues(f, []).length > 0);
});
test("Тип файла проверяется по содержимому", () => {
  assert.equal(
    validSignature(Buffer.from("%PDF-1.4\n"), "application/pdf"),
    true,
  );
  assert.equal(
    validSignature(
      Buffer.from("<script>not a PDF</script>"),
      "application/pdf",
    ),
    false,
  );
  assert.equal(validSignature(Buffer.from("RIFF1234WAVE"), "audio/wav"), true);
});
