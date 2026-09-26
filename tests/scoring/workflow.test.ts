import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { emptyFields } from "../../src/lib/validation";
import { domains } from "../../src/lib/catalog";
import {
  assessmentStories,
  preparedStory,
  clarifiedAction,
  type StoryKey,
} from "../../src/lib/scoring-scenarios.server";
import { scoringInput, digest } from "../../src/lib/scoring-input.server";
import {
  validateScoringResult,
  type ScoringView,
} from "../../src/lib/scoring-contract";
import {
  ExternalAssessmentProvider,
  LocalAssessmentProvider,
  configuredAssessmentProvider,
  assertPreparedScope,
} from "../../src/lib/scoring-provider.server";
import { processScoringRun } from "../../src/lib/scoring-service.server";
import { cleanupRun } from "../cleanup";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
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
  async html(path: string) {
    return (
      await fetch(origin + path, { headers: { Cookie: this.cookie } })
    ).text();
  }
}
test(
  "AI-скоринг: новый сквозной путь, общий контракт, версии и права",
  { timeout: 120000 },
  async (t) => {
    const db = new PrismaClient(),
      staff = new Session(),
      stranger = new Session(),
      users: Session[] = [],
      appIds: string[] = [],
      emails: string[] = [];
    const oldEnv = process.env.ASSESSMENT_ENVIRONMENT,
      oldProvider = process.env.ASSESSMENT_PROVIDER;
    process.env.ASSESSMENT_ENVIRONMENT = "isolated-local";
    process.env.ASSESSMENT_PROVIDER = "local";
    const prepare = async (appId: string, key: StoryKey, clarified = false) => {
      const input = await scoringInput(db, appId);
      const result = preparedStory(input, key, clarified);
      await db.scoringFixture.create({
        data: {
          applicationId: appId,
          inputHash: digest(input),
          scenarioVersion: `${key}-${clarified ? "answer" : "base"}-test-v1`,
          result: json(result),
        },
      });
      return { input, result };
    };
    const launch = async (appId: string) => {
      const a = await staff.call("scoring.launch", { applicationId: appId });
      for (let i = 0; i < 50; i++) {
        const v: ScoringView = await staff.call("scoring.status", {
          applicationId: appId,
        });
        const run = v.runs.find((r) => r.id === a.id)!;
        if (run.status === "COMPLETED") return run;
        if (run.status === "FAILED") throw new Error("Scoring failed");
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("Scoring timeout");
    };
    try {
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      for (const key of ["unclear", "rich", "conflict"] as StoryKey[]) {
        const user = new Session(),
          story = assessmentStories[key],
          email = `scoring-${key}-${randomUUID()}@qa.local`;
        emails.push(email);
        users.push(user);
        await user.call("register", {
          name: story.name,
          email,
          password: "ScoringChecks2026!",
        });
        await db.user.update({ where: { email }, data: { origin: "QA" } });
        const a = await user.call("application.save", {
          revision: 0,
          programSlug: "digital-products",
          fields: {
            ...emptyFields,
            ...story,
            email,
            city: "Алматы",
            processing: true,
            most: "0",
            least: "2",
            documentNote: "Документ нужно уточнить отдельно.",
            videoUrl: "https://example.org/scoring-video",
          },
        });
        appIds.push(a.id);
        await db.application.update({
          where: { id: a.id },
          data: { origin: "ASSESSMENT_QA" },
        });
        await user.call("application.submit", {
          revision: a.revision,
          confirm: true,
        });
        await prepare(a.id, key);
      }
      const appId = appIds[0],
        candidate = users[0];
      const initial = await db.applicationVersion.findFirstOrThrow({
        where: { applicationId: appId, kind: "SUBMITTED" },
      });
      let run = await launch(appId);
      await t.test(
        "запуск, сохранение, идемпотентность, девять отдельных областей",
        async () => {
          assert.equal(run.result!.domains.length, 9);
          assert.equal(run.result!.domains[2].rating, null);
          assert.equal(run.result!.domains[2].sufficiency, "Частично");
          assert.equal(
            run.result!.domains[2].consistency,
            "Не обнаружено противоречий",
          );
          const repeated = await Promise.all(
            Array.from({ length: 4 }, () =>
              staff.call("scoring.launch", { applicationId: appId }),
            ),
          );
          assert.ok(repeated.every((r) => r.id === run.id));
          assert.equal(
            await db.scoringRun.count({ where: { applicationId: appId } }),
            1,
          );
          const saved = await db.scoringRun.findUniqueOrThrow({
            where: { id: run.id },
          });
          assert.equal(saved.provider, "local");
          assert.equal(saved.status, "COMPLETED");
          assert.ok(saved.completedAt);
          assert.equal(digest(saved.input), saved.inputHash);
          assert.ok(!JSON.stringify(saved).includes("usage"));
        },
      );
      await t.test(
        "разные истории; конкретные цитаты; отказ от случайных оценок и скрытых данных",
        async () => {
          const rich = await launch(appIds[1]),
            conflict = await launch(appIds[2]);
          assert.equal(
            rich.result!.domains[2].rating?.label,
            "Есть проявление",
          );
          assert.equal(conflict.result!.domains[2].rating, null);
          assert.equal(
            conflict.result!.domains[2].consistency,
            "Есть противоречие",
          );
          assert.equal(conflict.result!.contradictions.length, 1);
          assert.equal(rich.result!.recommendation.action, "INTERVIEW");
          assert.equal(conflict.result!.recommendation.action, "CHECK");
          const input = await scoringInput(db, appId);
          assert.deepEqual(
            preparedStory(input, "unclear"),
            preparedStory(input, "unclear"),
          );
          assert.ok(!JSON.stringify(input).includes("Выбор утверждений"));
          assert.ok(!JSON.stringify(input).includes("achievements"));
          for (const e of run.result!.evidence) {
            const s = input.sources.find((s) => s.id === e.sourceId)!;
            assert.equal(e.sourceVersion, s.version);
            assert.ok(s.text.includes(e.quote));
          }
          const invalid = structuredClone(run.result!);
          invalid.evidence[0].sourceId = (
            await scoringInput(db, appIds[1])
          ).sources[0].id;
          assert.throws(
            () => validateScoringResult(invalid, input),
            /FOREIGN_SOURCE/,
          );
          const quote = structuredClone(run.result!);
          quote.evidence[0].quote = "Такого утверждения нет в материале";
          assert.throws(
            () => validateScoringResult(quote, input),
            /UNBOUND_QUOTE/,
          );
        },
      );
      await t.test(
        "кандидат и посторонний не запускают и не читают AI-скоринг",
        async () => {
          await candidate.call("scoring.launch", { applicationId: appId }, 403);
          await candidate.call(
            "scoring.status",
            { applicationId: appIds[1] },
            403,
          );
          await stranger.call("scoring.status", { applicationId: appId }, 401);
          const html = await candidate.html("/my");
          assert.ok(!html.includes(run.result!.summary));
          assert.ok(!html.includes("inputHash"));
          assert.ok(!html.includes("scoringRuns"));
          assert.ok(
            !(
              await candidate.html("/admissions/candidates/" + appIds[1])
            ).includes(run.result!.summary),
          );
        },
      );
      await t.test(
        "единый контракт, ограниченные операции, числовая шкала, внешний транспорт без сети",
        async () => {
          const input = await scoringInput(db, appId),
            prepared = run.result!;
          let calls = 0;
          const external = new ExternalAssessmentProvider(async (i, c) => {
            calls++;
            assert.equal(c.inputHash, digest(i));
            return prepared;
          });
          assert.deepEqual(
            validateScoringResult(
              await external.assess(input, {
                inputHash: digest(input),
                scenarioVersion: "test",
              }),
              input,
            ),
            prepared,
          );
          assert.equal(calls, 1);
          await assert.rejects(
            new ExternalAssessmentProvider().assess(input, {
              inputHash: digest(input),
              scenarioVersion: "test",
            }),
            /EXTERNAL_TRANSPORT_DISABLED/,
          );
          process.env.ASSESSMENT_PROVIDER = "unknown";
          assert.throws(
            configuredAssessmentProvider,
            /ASSESSMENT_CONFIGURATION/,
          );
          process.env.ASSESSMENT_PROVIDER = "local";
          const denied = structuredClone(input);
          denied.criteria.ratingDomains = [];
          assert.throws(
            () => validateScoringResult(prepared, denied),
            /OPERATION_NOT_ALLOWED/,
          );
          const numeric = structuredClone(prepared);
          numeric.domains[0].rating!.value = 1;
          assert.throws(
            () => validateScoringResult(numeric, input),
            /NO_NUMERIC_SCALE/,
          );
          const local = new LocalAssessmentProvider("ASSESSMENT_QA", {
            inputHash: "different",
            scenarioVersion: "test",
            result: prepared,
          });
          const unknownRaw = await local.assess(input, {
            inputHash: digest(input),
            scenarioVersion: "test",
          });
          const unknown = validateScoringResult(unknownRaw, input);
          assert.equal(unknown.state, "REQUIRES_REVIEW");
          assert.ok(unknown.domains.every((d) => d.rating === null));
          assert.throws(
            () => assertPreparedScope("USER"),
            /PREPARED_SCOPE_BLOCKED/,
          );
          assert.throws(
            () => assertPreparedScope("SEED"),
            /PREPARED_SCOPE_BLOCKED/,
          );
          assert.throws(
            () => assertPreparedScope("SEED", "rich-base-test-v1"),
            /PREPARED_SCOPE_BLOCKED/,
          );
          assert.doesNotThrow(() =>
            assertPreparedScope("SEED", "showcase-scoring-v1"),
          );
          process.env.ASSESSMENT_ENVIRONMENT = "campaign";
          assert.throws(
            () => assertPreparedScope("ASSESSMENT_QA"),
            /PREPARED_SCOPE_BLOCKED/,
          );
          assert.throws(
            () => assertPreparedScope("SEED", "showcase-scoring-v1"),
            /PREPARED_SCOPE_BLOCKED/,
          );
          process.env.ASSESSMENT_ENVIRONMENT = "isolated-local";
          assert.equal(
            digest({ a: 1, b: { c: 2, d: 3 } }),
            digest({ b: { d: 3, c: 2 }, a: 1 }),
          );
        },
      );
      let humanId = "";
      await t.test(
        "изменение сотрудником, отклонение основания и неизменное исходное предложение",
        async () => {
          const edited = structuredClone(run.result!);
          edited.domains[0].rating = null;
          edited.domains[0].interpretation =
            "Связь с университетом пока общая. На встрече уточню ожидания от совместной работы.";
          const requestKey = randomUUID();
          const body = {
            applicationId: appId,
            runId: run.id,
            requestKey,
            baseReviewId: null,
            result: edited,
            rejectedEvidenceIds: [],
            reason:
              "Проверила личную роль и мотивацию. До уточнения оставляю оценку университета не установленной.",
          };
          const human = await staff.call("scoring.review", body);
          humanId = human.id;
          assert.equal((await staff.call("scoring.review", body)).id, human.id);
          assert.equal(
            await db.scoringReview.count({ where: { runId: run.id } }),
            1,
          );
          assert.equal(
            (await db.scoringRun.findUniqueOrThrow({ where: { id: run.id } }))
              .result && run.result!.domains[0].rating?.label,
            "Есть проявление",
          );
          await staff.call(
            "scoring.review",
            { ...body, requestKey: randomUUID() },
            409,
          );
          const rejected = structuredClone(edited);
          rejected.evidence = rejected.evidence.filter(
            (e) => e.id !== "motivation",
          );
          for (const d of rejected.domains) {
            d.evidenceIds = d.evidenceIds.filter((id) => id !== "motivation");
            if (!d.evidenceIds.length) {
              d.rating = null;
              d.sufficiency = "Недостаточно";
            }
          }
          const next = await staff.call("scoring.review", {
            ...body,
            requestKey: randomUUID(),
            baseReviewId: humanId,
            result: rejected,
            rejectedEvidenceIds: ["motivation"],
            reason:
              "Отклоняю основание мотивации: его недостаточно для предложенной интерпретации.",
          });
          humanId = next.id;
          assert.equal(
            await db.scoringReview.count({ where: { runId: run.id } }),
            2,
          );
          assert.equal(
            (
              await db.assessment.findFirstOrThrow({
                where: { applicationId: appId, domain: domains[1] },
                orderBy: { createdAt: "desc" },
              })
            ).level,
            "Не рассмотрено",
          );
        },
      );
      let feedbackId = "";
      const context = async () =>
        (await staff.call("review.profile", { applicationId: appId }))
          .materialVersion;
      await t.test(
        "рекомендация не меняет этап; публикация только после решения и предпросмотра",
        async () => {
          let app = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          assert.equal(app.stage, "REVIEW");
          assert.equal(
            await db.decision.count({ where: { applicationId: appId } }),
            0,
          );
          const materialVersion = await context();
          const decision = await staff.call("decision", {
            applicationId: appId,
            materialVersion,
            revision: app.revision,
            scoringRunId: run.id,
            action: "CLARIFICATION",
            reason:
              "Прошу выделить личное действие в обмене книгами и отделить роли команды.",
          });
          const feedback = await staff.call("feedback.save", {
            applicationId: appId,
            materialVersion,
            scoringRunId: run.id,
            decisionId: decision.id,
            ...run.result!.feedback,
          });
          feedbackId = feedback.id;
          assert.ok(
            !(await candidate.html("/my")).includes(
              run.result!.feedback.observation,
            ),
          );
          await staff.call(
            "feedback.publish",
            {
              applicationId: appId,
              materialVersion,
              id: feedbackId,
              confirm: true,
            },
            400,
          );
          await staff.call("feedback.preview", {
            applicationId: appId,
            materialVersion,
            id: feedbackId,
          });
          await staff.call("feedback.publish", {
            applicationId: appId,
            materialVersion,
            id: feedbackId,
            confirm: true,
          });
          assert.ok(
            (await candidate.html("/my")).includes(
              run.result!.feedback.observation,
            ),
          );
          app = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          assert.equal(app.stage, "CLARIFICATION");
        },
      );
      await t.test(
        "уточнение сохраняет snapshot и старый анализ; несовпадение хеша требует проверки",
        async () => {
          await candidate.call("message", {
            applicationId: appId,
            body: clarifiedAction,
          });
          const status: ScoringView = await staff.call("scoring.status", {
            applicationId: appId,
          });
          assert.equal(
            status.runs.find((r) => r.id === run.id)!.current,
            false,
          );
          await staff.call(
            "scoring.review",
            {
              applicationId: appId,
              runId: run.id,
              baseReviewId: humanId,
              requestKey: randomUUID(),
              reason:
                "Попытка подтвердить старый результат после нового ответа.",
              result: run.result,
              rejectedEvidenceIds: [],
            },
            409,
          );
          assert.deepEqual(
            (
              await db.applicationVersion.findUniqueOrThrow({
                where: { id: initial.id },
              })
            ).snapshot,
            initial.snapshot,
          );
          const unprepared = await launch(appId);
          assert.equal(unprepared.result!.state, "REQUIRES_REVIEW");
          assert.ok(unprepared.result!.domains.every((d) => d.rating === null));
          await prepare(appId, "unclear", true);
          run = await launch(appId);
          assert.equal(run.result!.recommendation.action, "INTERVIEW");
          assert.equal(run.result!.domains[2].rating?.label, "Есть проявление");
          assert.equal(
            await db.scoringRun.count({ where: { applicationId: appId } }),
            3,
          );
          const saved = await db.scoringRun.findUniqueOrThrow({
            where: { id: run.id },
          });
          assert.equal(saved.inputHash, digest(saved.input));
        },
      );
      await t.test(
        "вопросы AI в ATOLA не являются проведённой встречей; связь источника и версии",
        async () => {
          const materialVersion = await context(),
            app = await db.application.findUniqueOrThrow({
              where: { id: appId },
            });
          await staff.call("decision", {
            applicationId: appId,
            materialVersion,
            revision: app.revision,
            action: "INTERVIEW",
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            reason:
              "По новому ответу обсудим применение принципа проверки доступности.",
          });
          const interview = await db.interview.findFirstOrThrow({
              where: { applicationId: appId },
            }),
            q = run.result!.questions.find((q) => q.id === "new-context")!;
          await staff.call("interview.plan", {
            id: interview.id,
            applicationId: appId,
            materialVersion,
            revision: 0,
            plan: {
              questions: [
                {
                  id: randomUUID(),
                  section: q.section,
                  text: q.text,
                  sourceId: q.sourceId,
                  scoringRunId: run.id,
                  scoringQuestionId: q.id,
                },
              ],
              notes:
                "Обсудить перенос принципа после основного вопроса секции.",
            },
          });
          const saved = await db.interview.findUniqueOrThrow({
            where: { id: interview.id },
          });
          assert.equal(saved.status, "SCHEDULED");
          assert.equal(saved.result, null);
          assert.equal(
            await db.interviewVersion.count({
              where: { interviewId: interview.id, kind: "RESULT" },
            }),
            0,
          );
          await candidate.call("message", {
            applicationId: appId,
            body: "Дополнительное уточнение: встреча проходила после уроков, форму тестировали заранее.",
          });
          await staff.call(
            "interview.plan",
            {
              id: interview.id,
              applicationId: appId,
              materialVersion: await context(),
              revision: 1,
              plan: saved.plan,
            },
            409,
          );
        },
      );
      await t.test(
        "повреждённый вход и внешний адаптер завершаются ошибкой без подмены",
        async () => {
          const source = await db.scoringRun.findFirstOrThrow({
            where: { applicationId: appIds[1], status: "COMPLETED" },
          });
          const broken = await db.scoringRun.create({
            data: {
              applicationId: source.applicationId,
              identity: randomUUID(),
              inputHash: "wrong",
              input: source.input as Prisma.InputJsonValue,
              materialVersion: source.materialVersion,
              criteriaVersion: source.criteriaVersion,
              provider: "local",
              scenarioVersion: "structured-fields-v1",
              requestedBy: source.requestedBy,
            },
          });
          await processScoringRun(broken.id);
          assert.equal(
            (
              await db.scoringRun.findUniqueOrThrow({
                where: { id: broken.id },
              })
            ).errorCode,
            "INPUT_HASH_MISMATCH",
          );
          const ext = await db.scoringRun.create({
            data: {
              applicationId: source.applicationId,
              identity: randomUUID(),
              inputHash: source.inputHash,
              input: source.input as Prisma.InputJsonValue,
              materialVersion: source.materialVersion,
              criteriaVersion: source.criteriaVersion,
              provider: "external",
              scenarioVersion: "structured-fields-v1",
              requestedBy: source.requestedBy,
            },
          });
          process.env.ASSESSMENT_PROVIDER = "external";
          await processScoringRun(ext.id);
          process.env.ASSESSMENT_PROVIDER = "local";
          const failed = await db.scoringRun.findUniqueOrThrow({
            where: { id: ext.id },
          });
          assert.equal(failed.status, "FAILED");
          assert.equal(failed.result, null);
          assert.equal(failed.errorCode, "EXTERNAL_TRANSPORT_DISABLED");
        },
      );
      await t.test(
        "основание повторно проверяет роль, заявку и доступность исходного материала",
        async () => {
          const view: ScoringView = await staff.call("scoring.status", {
            applicationId: appIds[1],
          });
          const saved = view.runs.find((r) => r.result?.evidence.length)!;
          const e = saved.result!.evidence[0];
          const request = {
            applicationId: appIds[1],
            runId: saved.id,
            evidenceId: e.id,
          };
          assert.equal(
            (await staff.call("scoring.evidence", request)).quote,
            e.quote,
          );
          await users[1].call("scoring.evidence", request, 403);
          await staff.call(
            "scoring.evidence",
            { ...request, applicationId: appIds[2] },
            404,
          );
          const original = await db.source.findUniqueOrThrow({
            where: { id: e.sourceId },
          });
          await db.source.update({
            where: { id: e.sourceId },
            data: { content: `${original.content}\nИсправленная версия.` },
          });
          const afterRevision: ScoringView = await staff.call(
            "scoring.status",
            { applicationId: appIds[1] },
          );
          assert.equal(
            afterRevision.runs.find((r) => r.id === saved.id)?.result,
            null,
          );
          await db.source.update({
            where: { id: e.sourceId },
            data: { content: original.content },
          });
          await db.source.delete({ where: { id: e.sourceId } });
          await staff.call("scoring.evidence", request, 404);
          const afterDeletion: ScoringView = await staff.call(
            "scoring.status",
            { applicationId: appIds[1] },
          );
          const unavailable = afterDeletion.runs.find((r) => r.id === saved.id)!;
          assert.equal(unavailable.status, "UNAVAILABLE");
          assert.equal(unavailable.result, null);
          assert.equal(unavailable.showcaseScore, null);
        },
      );
    } finally {
      for (const id of appIds)
        await db.application.update({ where: { id }, data: { origin: "QA" } });
      await cleanupRun(db, emails);
      await db.$disconnect();
      if (oldEnv === undefined) delete process.env.ASSESSMENT_ENVIRONMENT;
      else process.env.ASSESSMENT_ENVIRONMENT = oldEnv;
      if (oldProvider === undefined) delete process.env.ASSESSMENT_PROVIDER;
      else process.env.ASSESSMENT_PROVIDER = oldProvider;
    }
  },
);
