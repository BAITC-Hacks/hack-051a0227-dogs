import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFields } from "../src/lib/validation";
import {
  emptyIntake,
  defaultIntakeRules,
  preflight,
  routeFor,
  wordCount,
} from "../src/lib/intake-contract";
import { wallTimeToISO, confirmedMeet } from "../src/lib/calendar-contract";
const candidate = () => ({
  ...emptyFields,
  name: "Лея Соколова",
  email: "leya@qa.local",
  citizenship: "Кыргызстан",
  processing: true,
  videoUrl: "https://example.org/video",
  intake: structuredClone(emptyIntake),
});
test("Preflight: original GPA scales, missing GPA and system without GPA are distinct", () => {
  for (const [value, max] of [
    ["4,6", "5"],
    ["3.4", "4"],
    ["87", "100"],
  ]) {
    const f = candidate();
    f.intake.gpa = {
      ...f.intake.gpa,
      state: "PROVIDED",
      value,
      min: "0",
      max,
      scaleType: "original",
      period: "2025",
    };
    assert.ok(
      !preflight(f, [], defaultIntakeRules, "digital-products").some(
        (i) => i.key === "gpa",
      ),
    );
    assert.equal(f.intake.gpa.value, value);
  }
  const f = candidate();
  f.intake.gpa.state = "NOT_USED";
  assert.ok(
    preflight(f, [], defaultIntakeRules, "digital-products").find(
      (i) => i.key === "grades" && i.group === "SUGGEST",
    ),
  );
  f.intake.gpa = { ...f.intake.gpa, state: "PROVIDED", value: "4.6" };
  assert.ok(
    preflight(f, [], defaultIntakeRules, "digital-products").find(
      (i) => i.key === "gpa" && i.group === "BLOCK",
    ),
  );
});
test("Preflight: formal document rule, nonblocking role, unverified video, foreign exam and separate Foundation rules", () => {
  const f = candidate(),
    result = preflight(f, [], defaultIntakeRules, "creative-engineering");
  assert.ok(
    result.some((i) => i.key === "document-IDENTITY" && i.group === "BLOCK"),
  );
  assert.ok(
    result.some((i) => i.key === "personalRole" && i.group === "SUGGEST"),
  );
  assert.ok(
    result.some((i) => i.key === "video-review" && i.group === "PENDING"),
  );
  assert.ok(!result.some((i) => i.key === "exam-required-ЕНТ"));
  f.citizenship = "Казахстан";
  assert.ok(
    preflight(f, [], defaultIntakeRules, "creative-engineering").some(
      (i) => i.key === "exam-required-ЕНТ",
    ),
  );
  f.intake.entryType = "FOUNDATION";
  assert.ok(
    !preflight(f, [], defaultIntakeRules, "creative-engineering").some(
      (i) => i.group === "BLOCK",
    ),
  );
  assert.notDeepEqual(
    routeFor(defaultIntakeRules, "FOUNDATION", "sociology"),
    routeFor(defaultIntakeRules, "BACHELOR", "sociology"),
  );
  f.videoUrl = "http://127.0.0.1/secrets";
  assert.ok(
    preflight(f, [], defaultIntakeRules, "sociology").some(
      (i) => i.key === "video-format",
    ),
  );
});
test("Preflight: configured essay limits only; exact prompt version", () => {
  const f = candidate(),
    rules = structuredClone(defaultIntakeRules),
    r = rules.routes[0];
  r.essay.required = true;
  r.essay.minWords = 3;
  r.essay.maxWords = 5;
  f.intake.essay.text = "Один два";
  assert.ok(
    preflight(f, [], rules, "sociology").some((i) => i.key === "essay-length"),
  );
  f.intake.essay.text = "Один два три";
  assert.equal(wordCount(f.intake.essay.text), 3);
  assert.ok(
    !preflight(f, [], rules, "sociology").some((i) => i.key === "essay-length"),
  );
  r.essay.version = 2;
  assert.ok(
    preflight(f, [], rules, "sociology").some(
      (i) => i.key === "essay-question",
    ),
  );
});
test("Calendar wall time: Almaty, DST ambiguity and Meet readiness", () => {
  assert.equal(
    wallTimeToISO("2026-09-28T14:00", "Asia/Almaty"),
    "2026-09-28T09:00:00.000Z",
  );
  assert.throws(() => wallTimeToISO("2026-03-29T01:30", "Europe/London"));
  assert.throws(() => wallTimeToISO("2026-10-25T01:30", "Europe/London"));
  assert.equal(
    confirmedMeet({
      id: "x",
      conferenceData: {
        createRequest: { status: { statusCode: "pending" } },
        entryPoints: [
          {
            entryPointType: "video",
            uri: "https://meet.google.com/aaa-bbbb-ccc",
          },
        ],
      },
    }),
    null,
  );
  assert.equal(
    confirmedMeet({
      id: "x",
      conferenceData: {
        createRequest: { status: { statusCode: "success" } },
        entryPoints: [{ entryPointType: "video", uri: "https://evil.test/" }],
      },
    }),
    null,
  );
});
