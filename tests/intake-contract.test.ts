import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFields } from "../src/lib/validation";
import {
  emptyIntake,
  certificateScaleIssue,
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
      (i) => i.key === "grades" && i.group === "BLOCK",
    ),
  );
  f.intake.gpa.originalGrades = "Алгебра: 5, история: 4";
  assert.ok(
    !preflight(f, [], defaultIntakeRules, "digital-products").some(
      (i) => i.key === "grades",
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
    preflight(f, [], defaultIntakeRules, "creative-engineering").some(
      (i) => i.key === "gpa-state" && i.group === "BLOCK",
    ),
  );
  assert.ok(
    !preflight(f, [], defaultIntakeRules, "creative-engineering").some(
      (i) => i.key === "exam-required-ЕНТ",
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
test("ЕНТ minimum applies to Kazakhstan bachelor applicants; SAT does not silently replace it", () => {
  const applicant = candidate();
  applicant.citizenship = "Казахстан";
  applicant.intake.exams = [{ type: "SAT", value: "1320", scaleMin: "400", scaleMax: "1600", date: "2026-06-01", period: "", materialId: "" }];
  assert.ok(preflight(applicant, [], defaultIntakeRules, "digital-products").some((issue) => issue.key === "exam-required-ЕНТ"));
  applicant.intake.exams.push({ type: "ЕНТ", value: "79", scaleMin: "0", scaleMax: "140", date: "2026-06-22", period: "Математика + Информатика", materialId: "" });
  assert.ok(preflight(applicant, [], defaultIntakeRules, "digital-products").some((issue) => issue.key === "exam-minimum-ЕНТ" && issue.group === "BLOCK"));
  applicant.intake.exams[1].value = "80";
  assert.ok(!preflight(applicant, [], defaultIntakeRules, "digital-products").some((issue) => issue.key === "exam-minimum-ЕНТ"));
});
test("Preflight: essay and one complete English route are required by the current application", () => {
  const f = candidate();
  let issues = preflight(f, [], defaultIntakeRules, "digital-products");
  assert.ok(issues.some((i) => i.key === "essay-empty" && i.group === "BLOCK"));
  assert.ok(
    issues.some((i) => i.key === "language-choice" && i.group === "BLOCK"),
  );
  f.intake.essay.text =
    "Я проверила расписание и изменила порядок после нового ответа команды.";
  f.intake.english.method = "INTERNAL";
  issues = preflight(f, [], defaultIntakeRules, "digital-products");
  assert.ok(
    issues.some((i) => i.key === "language-response" && i.group === "BLOCK"),
  );
  issues = preflight(
    f,
    [],
    defaultIntakeRules,
    "digital-products",
    "PENDING_REVIEW",
  );
  assert.ok(!issues.some((i) => i.key === "language-response"));
  f.intake.english.method = "CERTIFICATE";
  f.intake.english.certificate = {
    ...f.intake.english.certificate,
    type: "IELTS",
    value: "6",
    scaleMin: "0",
    scaleMax: "9",
    date: "2026-05-14",
  };
  issues = preflight(f, [], defaultIntakeRules, "digital-products");
  assert.ok(
    issues.some(
      (i) =>
        i.key === "certificate-file" && i.group === "BLOCK" && i.section === 4,
    ),
  );
  f.intake.english.certificate.materialId = "certificate-id";
  issues = preflight(
    f,
    [{ id: "certificate-id", kind: "document", purpose: "LANGUAGE" }],
    defaultIntakeRules,
    "digital-products",
  );
  assert.ok(!issues.some((i) => i.key === "certificate-file"));
});
test("Preflight distinguishes unfinished exam rows and points to their section", () => {
  const f = candidate();
  f.citizenship = "Казахстан";
  f.intake.exams = [
    {
      type: "ЕНТ",
      value: "112",
      scaleMin: "0",
      scaleMax: "140",
      date: "2026-08-10",
      period: "",
      materialId: "",
    },
    {
      type: "",
      value: "",
      scaleMin: "",
      scaleMax: "",
      date: "",
      period: "",
      materialId: "",
    },
  ];
  const issues = preflight(f, [], defaultIntakeRules, "digital-products");
  assert.ok(!issues.some((issue) => issue.key === "exam-required-ЕНТ"));
  assert.ok(
    issues.some(
      (issue) =>
        issue.key === "exam-1" &&
        issue.section === 1 &&
        issue.text.includes("Экзамен 2"),
    ),
  );
});
test("Certificate feedback identifies the exact invalid field and accepts an original CEFR scale", () => {
  const certificate = {
    type: "Другой сертификат",
    value: "Basdasd",
    scaleMin: "A1",
    scaleMax: "C2",
    date: "2026-09-01",
  };
  assert.deepEqual(certificateScaleIssue(certificate)?.field, "language-value");
  const applicant = candidate();
  applicant.intake.english.method = "CERTIFICATE";
  applicant.intake.english.certificate = {
    ...applicant.intake.english.certificate,
    ...certificate,
  };
  assert.equal(
    preflight(applicant, [], defaultIntakeRules, "digital-products").find(
      (item) => item.key === "certificate-scale",
    )?.field,
    "language-value",
  );
  certificate.value = "B2";
  assert.equal(certificateScaleIssue(certificate), null);
  certificate.type = "IELTS";
  assert.equal(certificateScaleIssue(certificate)?.field, "language-value");
  certificate.value = "6,5";
  certificate.scaleMin = "0";
  certificate.scaleMax = "9";
  assert.equal(certificateScaleIssue(certificate), null);
  certificate.scaleMax = "0";
  assert.equal(certificateScaleIssue(certificate)?.field, "language-scaleMax");
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
