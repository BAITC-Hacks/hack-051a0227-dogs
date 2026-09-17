import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { domains } from "../../src/lib/catalog";
import {
  assessmentStories,
  preparedStory,
} from "../../src/lib/scoring-scenarios.server";
import { prepareTwin, twinCases } from "../../src/lib/twin-cases.server";
import {
  compareTwin,
  twinSuitability,
  type PreparedTwin,
  type TwinAuditView,
} from "../../src/lib/twin-contract";
import {
  assessmentFacts,
  digest,
  scoringInput,
} from "../../src/lib/scoring-input.server";
import {
  validateScoringResult,
  type ScoringInput,
  type ScoringResult,
} from "../../src/lib/scoring-contract";
import { LocalAssessmentProvider } from "../../src/lib/scoring-provider.server";
import {
  processScoringRun,
  requireCurrentScoring,
  scoringView,
} from "../../src/lib/scoring-service.server";
import { emptyFields } from "../../src/lib/validation";
import { cleanupRun } from "../cleanup";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function sample(): ScoringInput {
  const story = assessmentStories.rich;
  return {
    applicationId: "own",
    applicationVersion: { id: "submitted", revision: 1 },
    materialVersion: "materials",
    facts: assessmentFacts(story, "Цифровые продукты"),
    sources: [
      {
        id: "experience",
        version: "v1",
        title: "Опыт и личная роль",
        kind: "Анкета",
        text: `${story.experience}\n\nЛичная роль: ${story.personalRole}`,
        episodeId: "library",
        assessable: true,
        corrections: [],
        material: null,
      },
      {
        id: "motivation",
        version: "v1",
        title: "Мотивация",
        kind: "Анкета",
        text: story.motivation,
        episodeId: null,
        assessable: true,
        corrections: [],
        material: null,
      },
    ],
    language: null,
    clarifications: [],
    criteria: {
      version: "1",
      rubricVersion: 1,
      guidance: "Действие в одном эпизоде или нескольких разных эпизодах.",
      levels: [
        { label: "Есть проявление", meaning: "Один эпизод" },
        { label: "Устойчивое проявление", meaning: "Разные эпизоды" },
      ],
      numeric: null,
      ratingDomains: [
        domains[0],
        domains[1],
        domains[2],
        domains[3],
        domains[5],
        domains[6],
      ],
      operations: ["facts", "domain_rating", "questions", "feedback"],
    },
  };
}
function compare(
  pair: PreparedTwin,
  b: ScoringResult = pair.prepared.B.result,
) {
  return compareTwin(
    pair,
    {
      status: "COMPLETED",
      inputHash: pair.variants.A.inputHash,
      result: pair.prepared.A.result,
    },
    { status: "COMPLETED", inputHash: pair.variants.B.inputHash, result: b },
  );
}
test("Fairness Twin: восемь пар, положительные и отрицательные контрольные результаты", () => {
  const expected = {
    style: "MATCH",
    background: "MATCH",
    duplicate: "MATCH",
    role: "DIFFERENT",
    language: "MATCH",
    "lost-fact": "INCOMPARABLE",
    criteria: "INCOMPARABLE",
    divergence: "DIFFERENT",
  };
  for (const item of twinCases) {
    const pair = prepareTwin(sample(), item.key),
      result = compare(pair);
    assert.equal(
      result.state,
      expected[item.key],
      item.key + ": " + JSON.stringify(result),
    );
    assert.equal(pair.prepared.A.result.domains.length, 9);
    assert.equal(pair.prepared.B.result.domains.length, 9);
    for (const side of ["A", "B"] as const) {
      assert.equal(
        digest(pair.variants[side].input),
        pair.prepared[side].inputHash,
      );
      validateScoringResult(
        pair.prepared[side].result,
        pair.variants[side].input,
      );
    }
  }
});
test("Fairness Twin: разные цитаты, связанные источники и один эпизод", () => {
  const style = prepareTwin(sample(), "style");
  assert.notEqual(
    style.prepared.A.result.evidence[0].quote,
    style.prepared.B.result.evidence[0].quote,
  );
  assert.notEqual(style.variants.A.inputHash, style.variants.B.inputHash);
  const duplicate = prepareTwin(sample(), "duplicate"),
    compared = compare(duplicate);
  assert.ok(
    compared.domains.every((d) => d.episodes[0] === 1 && d.episodes[1] === 1),
  );
  assert.ok(
    compared.domains.every((d) => d.grounds[0] === 2 && d.grounds[1] === 3),
  );
  const invalid = structuredClone(duplicate.prepared.B.result);
  invalid.domains[5].rating = { label: "Устойчивое проявление", value: null };
  assert.throws(
    () => validateScoringResult(invalid, duplicate.variants.B.input),
    /REPEATED_EPISODE/,
  );
  assert.equal(compare(duplicate, invalid).state, "INCOMPARABLE");
});
test("Fairness Twin: отсутствие оценки, старый хеш, чужая цитата и несовместимая обработка не дают совпадения", () => {
  let pair = prepareTwin(sample(), "style");
  pair.prepared.A.result.domains[5].rating = null;
  pair.prepared.B.result.domains[5].rating = null;
  assert.equal(compare(pair).state, "INCOMPARABLE");
  pair = prepareTwin(sample(), "style");
  const otherQuote = structuredClone(pair.prepared.B.result);
  otherQuote.evidence[0].quote = pair.prepared.A.result.evidence[0].quote;
  assert.equal(compare(pair, otherQuote).state, "INCOMPARABLE");
  pair.variants.B.provider = "external";
  assert.ok(twinSuitability(pair).length);
  assert.equal(compare(pair).state, "INCOMPARABLE");
  pair = prepareTwin(sample(), "style");
  pair.variants.B.rulesVersion = "other-rules";
  assert.equal(compare(pair).state, "INCOMPARABLE");
  pair = prepareTwin(sample(), "style");
  pair.variants.B.inputHash = "wrong";
  assert.equal(
    compareTwin(
      pair,
      {
        status: "COMPLETED",
        result: pair.prepared.A.result,
        inputHash: pair.prepared.A.inputHash,
      },
      {
        status: "COMPLETED",
        result: pair.prepared.B.result,
        inputHash: pair.prepared.B.inputHash,
      },
    ).state,
    "INCOMPARABLE",
  );
  assert.equal(compareTwin(pair).state, "INCOMPLETE");
  assert.equal(
    compareTwin(pair, {
      status: "COMPLETED",
      result: pair.prepared.A.result,
      inputHash: pair.prepared.A.inputHash,
    }).state,
    "INCOMPLETE",
  );
});
test("Fairness Twin: одинаковый уровень не скрывает отличающиеся объяснения, основания или вопросы", () => {
  const pair = prepareTwin(sample(), "style");
  for (const change of [
    (r: ScoringResult) => {
      r.domains[5].interpretation =
        "Другое неподтверждённое объяснение результата.";
    },
    (r: ScoringResult) => {
      r.domains[5].sufficiency = "Частично";
    },
    (r: ScoringResult) => {
      r.domains[5].evidenceIds = ["action"];
    },
    (r: ScoringResult) => {
      r.questions[0].text = "Другой вопрос при прежнем идентификаторе.";
    },
    (r: ScoringResult) => {
      r.questions[0].id = "different-question";
    },
    (r: ScoringResult) => {
      r.recommendation.action = "CLARIFICATION";
    },
  ]) {
    const altered = structuredClone(pair.prepared.B.result);
    change(altered);
    assert.equal(compare(pair, altered).state, "DIFFERENT");
  }
  const missingFact = structuredClone(pair);
  missingFact.variants.B.facts[3].value = "другой результат";
  assert.equal(compare(missingFact).state, "INCOMPARABLE");
});
test("Fairness Twin: архитектурная изоляция бэкграунда и независимость опыта от языка", () => {
  const background = prepareTwin(sample(), "background");
  assert.notDeepEqual(
    background.variants.A.background,
    background.variants.B.background,
  );
  assert.deepEqual(background.variants.A.input, background.variants.B.input);
  for (const v of Object.values(background.variants)) {
    assert.ok(!JSON.stringify(v.input).includes(v.background!.school));
    assert.ok(!JSON.stringify(v.input).includes(v.background!.region));
    assert.deepEqual(
      Object.keys(
        assessmentFacts(
          {
            ...sample().facts,
            income: 123,
            SupportContext: "excluded",
            school: "excluded",
            region: "excluded",
          },
          "P",
        ),
      ).sort(),
      ["program", "motivation", "experience", "personalRole"].sort(),
    );
  }
  const language = prepareTwin(sample(), "language");
  assert.notDeepEqual(
    language.variants.A.input.language,
    language.variants.B.input.language,
  );
  assert.deepEqual(
    language.prepared.A.result.domains[5],
    language.prepared.B.result.domains[5],
  );
  const leaked = structuredClone(background);
  leaked.variants.B.input.facts.personalRole += " Школа у реки";
  assert.equal(compare(leaked).state, "INCOMPARABLE");
});
test("Fairness Twin: оба варианта используют свой локальный ответ без сетевого запроса", async () => {
  const previous = globalThis.fetch,
    env = process.env.ASSESSMENT_ENVIRONMENT;
  process.env.ASSESSMENT_ENVIRONMENT = "isolated-local";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("No external network");
  };
  try {
    const pair = prepareTwin(sample(), "role");
    const results = [];
    for (const side of ["A", "B"] as const) {
      const v = pair.variants[side],
        answer = pair.prepared[side];
      results.push(
        validateScoringResult(
          await new LocalAssessmentProvider("ASSESSMENT_QA", {
            ...answer,
            scenarioVersion: v.scenarioVersion,
          }).assess(v.input, {
            inputHash: v.inputHash,
            scenarioVersion: v.scenarioVersion,
          }),
          v.input,
        ),
      );
    }
    assert.notDeepEqual(results[0], results[1]);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
    if (env === undefined) delete process.env.ASSESSMENT_ENVIRONMENT;
    else process.env.ASSESSMENT_ENVIRONMENT = env;
  }
});

const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
class Session {
  cookie = "";
  async call(type: string, data: Record<string, unknown> = {}, status = 200) {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: this.cookie,
      },
      body: JSON.stringify({ type, ...data }),
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    const body = await r.json();
    assert.equal(r.status, status, `${type}: ${JSON.stringify(body)}`);
    return body.data;
  }
}
test(
  "Fairness Twin: API, изоляция официального профиля, история, роли и сохранённый разбор",
  { timeout: 120000 },
  async (t) => {
    const db = new PrismaClient(),
      staff = new Session(),
      candidate = new Session(),
      other = new Session();
    const emails: string[] = [],
      appIds: string[] = [];
    const previous = process.env.ASSESSMENT_ENVIRONMENT,
      provider = process.env.ASSESSMENT_PROVIDER;
    process.env.ASSESSMENT_ENVIRONMENT = "isolated-local";
    process.env.ASSESSMENT_PROVIDER = "local";
    const wait = async (auditId: string) => {
      for (let i = 0; i < 100; i++) {
        const v: TwinAuditView = await staff.call("twin.status", {
          applicationId: appIds[0],
          auditId,
        });
        if (v.runs.every((r) => ["COMPLETED", "FAILED"].includes(r.status)))
          return v;
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error("Twin processing timeout");
    };
    try {
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      for (const session of [candidate, other]) {
        const email = `twin-${randomUUID()}@qa.local`;
        emails.push(email);
        await session.call("register", {
          name: "Ника Контрольная",
          email,
          password: "TwinChecks2026!",
        });
        await db.user.update({ where: { email }, data: { origin: "QA" } });
        const a = await session.call("application.save", {
          revision: 0,
          programSlug: "digital-products",
          fields: {
            ...emptyFields,
            ...assessmentStories.rich,
            email,
            city: "Алматы",
            processing: true,
            most: "0",
            least: "2",
            documentNote: "Документ обсуждается отдельно.",
            videoUrl: "https://example.org/twin-video",
          },
        });
        appIds.push(a.id);
        await db.application.update({
          where: { id: a.id },
          data: { origin: "ASSESSMENT_QA" },
        });
        await session.call("application.submit", {
          revision: a.revision,
          confirm: true,
        });
      }
      const applicationId = appIds[0],
        input = await scoringInput(db, applicationId);
      await db.scoringFixture.create({
        data: {
          applicationId,
          inputHash: digest(input),
          scenarioVersion: "rich-twin-official-v1",
          result: json(preparedStory(input, "rich")),
        },
      });
      const official = await staff.call("scoring.launch", { applicationId });
      await processScoringRun(official.id);
      const fingerprint = async () =>
        digest({
          app: await db.application.findUnique({
            where: { id: applicationId },
          }),
          input: await scoringInput(db, applicationId),
          versions: await db.applicationVersion.findMany({
            where: { applicationId },
          }),
          assessments: await db.assessment.findMany({
            where: { applicationId },
          }),
          decisions: await db.decision.findMany({ where: { applicationId } }),
          feedback: await db.feedbackPublication.findMany({
            where: { applicationId },
          }),
          official: await db.scoringRun.findMany({
            where: { applicationId, context: "OFFICIAL" },
          }),
        });
      // Complete the initial official after() before measuring its immutable baseline.
      for (let i = 0; i < 50; i++) {
        const r = await db.scoringRun.findUniqueOrThrow({
          where: { id: official.id },
        });
        if (r.status === "COMPLETED") break;
        await new Promise((r) => setTimeout(r, 20));
      }
      const before = await fingerprint(),
        count = await db.application.count({
          where: { user: { email: { in: emails } } },
        });
      let first: TwinAuditView;
      await t.test(
        "повтор запуска, два анализа, собственные хеши и сохранённое сравнение",
        async () => {
          const preview = await staff.call("twin.preview", {
            applicationId,
            caseKey: "style",
          });
          assert.ok(!JSON.stringify(preview).includes('"prepared"'));
          const request = {
            applicationId,
            caseKey: "style",
            previewHash: preview.previewHash,
            requestKey: randomUUID(),
          };
          const calls = await Promise.all(
            Array.from({ length: 4 }, () => staff.call("twin.launch", request)),
          );
          assert.ok(calls.every((c) => c.id === calls[0].id));
          first = await wait(calls[0].id);
          assert.equal(first.comparison.state, "MATCH");
          assert.equal(first.runs.length, 2);
          assert.equal(
            await db.twinAudit.count({ where: { applicationId } }),
            1,
          );
          assert.equal(
            await db.scoringRun.count({ where: { auditId: first.id } }),
            2,
          );
          const stored = await db.twinAudit.findUniqueOrThrow({
            where: { id: first.id },
          });
          assert.equal((stored.comparison as { state: string }).state, "MATCH");
          assert.equal(digest(stored.definition), stored.definitionHash);
          for (const r of first.runs) {
            const row = await db.scoringRun.findUniqueOrThrow({
              where: { id: r.id },
            });
            assert.equal(row.context, "AUDIT");
            assert.equal(digest(row.input), row.inputHash);
            assert.equal(row.provider, "local");
            assert.ok(!JSON.stringify(row).includes('"usage"'));
          }
        },
      );
      await t.test(
        "официальный профиль, решения, очередь и публикации не меняются",
        async () => {
          assert.equal(await fingerprint(), before);
          assert.equal(
            await db.application.count({
              where: { user: { email: { in: emails } } },
            }),
            count,
          );
          assert.deepEqual(
            (await scoringView(applicationId)).runs.map((r) => r.id),
            [official.id],
          );
          await assert.rejects(
            requireCurrentScoring(db, applicationId, first!.runs[0].id),
            /недоступен/,
          );
          await candidate.call("twin.list", { applicationId }, 403);
          await other.call(
            "twin.status",
            { applicationId, auditId: first!.id },
            403,
          );
          await staff.call(
            "twin.status",
            { applicationId: appIds[1], auditId: first!.id },
            404,
          );
          await staff.call(
            "twin.review",
            {
              applicationId: appIds[1],
              auditId: first!.id,
              version: first!.version,
              requestKey: randomUUID(),
              baseReviewId: null,
              verdict: "REVIEWED",
              note: "Не относится к этой заявке.",
            },
            404,
          );
          const html = await (
            await fetch(origin + "/my", {
              headers: { Cookie: candidate.cookie },
            })
          ).text();
          assert.ok(!html.includes("library-pairs-v1"));
          assert.ok(!html.includes("baseInputHash"));
          const res = await fetch(
            origin +
              `/admissions/candidates/${applicationId}/stability?audit=${first!.id}`,
            { headers: { Cookie: candidate.cookie }, redirect: "manual" },
          );
          const denied = await res.text();
          assert.ok(res.status === 307 || denied.includes("NEXT_REDIRECT"));
          assert.ok(!denied.includes("library-pairs-v1"));
          assert.ok(
            !denied.includes(
              first!.definition.variants.B.input.facts.experience,
            ),
          );
        },
      );
      await t.test(
        "разбор отдельно, идемпотентность и история после повторной проверки",
        async () => {
          const data = {
            applicationId,
            auditId: first!.id,
            version: first!.version,
            baseReviewId: null,
            requestKey: randomUUID(),
            verdict: "REVIEWED",
            note: "Сопоставлены факты, один эпизод и обе собственные цитаты. Проверка касается только этой пары.",
          };
          const review = await staff.call("twin.review", data);
          assert.equal((await staff.call("twin.review", data)).id, review.id);
          const read: TwinAuditView = await staff.call("twin.status", {
            applicationId,
            auditId: first!.id,
          });
          assert.equal(read.reviews[0].note, data.note);
          const row = await db.twinReview.findUniqueOrThrow({
            where: { id: review.id },
          });
          assert.ok(row.authorId);
          assert.equal(
            (row.viewedVersions as { version: string }).version,
            first!.version,
          );
          await staff.call(
            "twin.review",
            { ...data, requestKey: randomUUID() },
            409,
          );
          const preview = await staff.call("twin.preview", {
            applicationId,
            caseKey: "style",
          });
          const repeat = await staff.call("twin.launch", {
            applicationId,
            caseKey: "style",
            previewHash: preview.previewHash,
            requestKey: randomUUID(),
          });
          assert.notEqual(repeat.id, first!.id);
          await wait(repeat.id);
          assert.equal(
            await db.twinReview.count({ where: { auditId: first!.id } }),
            1,
          );
          assert.equal(await fingerprint(), before);
        },
      );
      await t.test(
        "намеренное расхождение и непригодная пара не становятся успешными",
        async () => {
          for (const [caseKey, state] of [
            ["divergence", "DIFFERENT"],
            ["lost-fact", "INCOMPARABLE"],
            ["criteria", "INCOMPARABLE"],
            ["role", "DIFFERENT"],
            ["duplicate", "MATCH"],
            ["language", "MATCH"],
            ["background", "MATCH"],
          ]) {
            const p = await staff.call("twin.preview", {
              applicationId,
              caseKey,
            });
            const a = await staff.call("twin.launch", {
              applicationId,
              caseKey,
              previewHash: p.previewHash,
              requestKey: randomUUID(),
            });
            assert.equal((await wait(a.id)).comparison.state, state, caseKey);
          }
          assert.equal(await fingerprint(), before);
        },
      );
      await t.test(
        "активная пара возобновляется без конфликтующих задач; старый предпросмотр отклоняется",
        async () => {
          const p = await staff.call("twin.preview", {
            applicationId,
            caseKey: "style",
          });
          await db.scoringRun.updateMany({
            where: { auditId: first!.id },
            data: {
              status: "RUNNING",
              leaseUntil: new Date(Date.now() + 60000),
            },
          });
          const reused = await staff.call("twin.launch", {
            applicationId,
            caseKey: "style",
            previewHash: p.previewHash,
            requestKey: randomUUID(),
          });
          assert.equal(reused.id, first!.id);
          await db.scoringRun.updateMany({
            where: { auditId: first!.id },
            data: { leaseUntil: new Date(0) },
          });
          await Promise.all(first!.runs.map((r) => processScoringRun(r.id)));
          assert.equal((await wait(first!.id)).comparison.state, "MATCH");
          await staff.call(
            "twin.launch",
            {
              applicationId,
              caseKey: "style",
              previewHash: "old-hash",
              requestKey: randomUUID(),
            },
            409,
          );
        },
      );
      await t.test(
        "чужой готовый ответ, повреждённый вход и неподтверждённая цитата отклоняются обработчиком",
        async () => {
          const audit = await db.twinAudit.findUniqueOrThrow({
            where: { id: first!.id },
          });
          const stored = audit.definition as unknown as PreparedTwin,
            right = first!.runs.find((r) => r.variant === "B")!;
          const corrupt = structuredClone(stored);
          corrupt.prepared.B.inputHash = "foreign-input";
          await db.twinAudit.update({
            where: { id: audit.id },
            data: {
              definition: json(corrupt),
              definitionHash: digest(corrupt),
            },
          });
          await db.scoringRun.update({
            where: { id: right.id },
            data: { status: "QUEUED", result: Prisma.DbNull },
          });
          await processScoringRun(right.id);
          assert.equal(
            (await db.scoringRun.findUniqueOrThrow({ where: { id: right.id } }))
              .errorCode,
            "AUDIT_INPUT_UNSUPPORTED",
          );
          assert.equal((await wait(first!.id)).comparison.state, "INCOMPLETE");
          const quote = structuredClone(stored);
          quote.prepared.B.result.evidence[0].quote =
            "Чужой несуществующий результат";
          await db.twinAudit.update({
            where: { id: audit.id },
            data: { definition: json(quote), definitionHash: digest(quote) },
          });
          await db.scoringRun.update({
            where: { id: right.id },
            data: { status: "QUEUED" },
          });
          await processScoringRun(right.id);
          assert.equal(
            (await db.scoringRun.findUniqueOrThrow({ where: { id: right.id } }))
              .errorCode,
            "UNBOUND_QUOTE",
          );
          await db.twinAudit.update({
            where: { id: audit.id },
            data: { definition: json(stored), definitionHash: digest(stored) },
          });
          await db.scoringRun.update({
            where: { id: right.id },
            data: {
              status: "QUEUED",
              input: json({
                ...stored.variants.B.input,
                materialVersion: "tampered",
              }),
            },
          });
          await processScoringRun(right.id);
          assert.equal(
            (await db.scoringRun.findUniqueOrThrow({ where: { id: right.id } }))
              .errorCode,
            "INPUT_HASH_MISMATCH",
          );
          assert.equal(await fingerprint(), before);
        },
      );
    } finally {
      await db.application.updateMany({
        where: { id: { in: appIds } },
        data: { origin: "QA" },
      });
      await cleanupRun(db, emails);
      await db.$disconnect();
      if (previous === undefined) delete process.env.ASSESSMENT_ENVIRONMENT;
      else process.env.ASSESSMENT_ENVIRONMENT = previous;
      if (provider === undefined) delete process.env.ASSESSMENT_PROVIDER;
      else process.env.ASSESSMENT_PROVIDER = provider;
    }
  },
);
