import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { db as profileDb } from "../../src/lib/db";
import { initialState } from "../../src/lib/projects";
import { emptyFields } from "../../src/lib/validation";
import { collectProfile } from "../../src/lib/profile-context.server";
import {
  LocalProfileProvider,
  validateProfileAnswer,
  configuredProfileProvider,
} from "../../src/lib/profile-provider.server";
import {
  profileTopics,
  resolveProfileTopic,
  type ProfileView,
  type ProfileTurnView,
} from "../../src/lib/profile-contract";
import type { ScoringView } from "../../src/lib/scoring-contract";
import { cleanupRun } from "../cleanup";
import { grantQaAccess } from "../qa-access";
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
    if (type.startsWith("profile.") && status === 200)
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
    return body.data;
  }
  ask(topic: keyof typeof profileTopics, scope: Record<string, unknown> = {}) {
    return this.call("profile.ask", {
      topic,
      scope,
      question: profileTopics[topic],
      requestKey: randomUUID(),
    }) as Promise<ProfileTurnView>;
  }
}
const valid = {
  ...initialState,
  screens: ["event", "profile", "confirm"],
  requiredPhone: false,
};
test("Профиль: команды точные, свободный вопрос не превращается в смысловой анализ", () => {
  assert.equal(resolveProfileTopic("Что изменилось?"), "changes");
  assert.equal(resolveProfileTopic("Покажи источник"), "grounds");
  assert.equal(resolveProfileTopic("Почему?", "direction"), "direction");
  assert.equal(resolveProfileTopic("Реши, достоин ли я зачисления"), null);
});
test(
  "Профиль и развитие: новые записи, источники, два режима и существующий цикл",
  { timeout: 120000 },
  async (t) => {
    const db = new PrismaClient(),
      candidate = new Session(),
      other = new Session(),
      staff = new Session();
    const emails = [
      `profile-${randomUUID()}@qa.local`,
      `profile-other-${randomUUID()}@qa.local`,
    ];
    let workId = "",
      applicationId = "",
      privateId = "";
    const scope = () => ({ attemptId: workId });
    const staffScope = () => ({
      applicationId,
      domain: "Реальный опыт" as const,
    });
    const load = () =>
      candidate.call("profile.load", {
        scope: scope(),
      }) as Promise<ProfileView>;
    const reviewBase = async () => ({
      applicationId,
      ...(await staff.call("review.profile", { applicationId })),
    });
    try {
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      await candidate.call("project.progress", {}, 401);
      await candidate.call("register", {
        name: "Новая Профильная",
        email: emails[0],
        password: "ProfileChecks2026!",
      });
      await grantQaAccess(db, emails[0]);
      await candidate.call("project.progress");
      const first = await candidate.call("project.save", {
        slug: "digital-products",
        state: initialState,
        requestKey: randomUUID(),
      });
      workId = first.id;
      let oldAnswer: ProfileTurnView;
      await t.test(
        "собственная работа: версии, реальное изменение и повтор запроса",
        async () => {
          oldAnswer = await candidate.ask("changes", scope());
          assert.match(
            JSON.stringify(oldAnswer.answer),
            /Содержательных изменений.*не обнаружено/,
          );
          const changed = await candidate.call("project.save", {
            id: workId,
            slug: "digital-products",
            revision: 1,
            state: valid,
            requestKey: randomUUID(),
          });
          assert.equal(changed.revision, 2);
          const key = randomUUID(),
            body = {
              scope: scope(),
              topic: "changes",
              question: "Что изменилось?",
              requestKey: key,
            };
          const answers = await Promise.all(
            [1, 2, 3].map(() => candidate.call("profile.ask", body)),
          );
          assert.equal(new Set(answers.map((a) => a.id)).size, 1);
          assert.match(JSON.stringify(answers[0]), /Порядок экранов|Порядок/);
          const history = await load();
          assert.equal(
            history.history.find((h) => h.id === oldAnswer.id)?.stale,
            true,
          );
          assert.equal(
            history.history.find((h) => h.id === oldAnswer.id)?.unavailable,
            false,
          );
          const ref = answers[0].answer.claims[0].refs[0];
          const source = await candidate.call("profile.source", {
            scope: scope(),
            answerId: answers[0].id,
            sourceKey: ref.key,
          });
          assert.ok(source.text.includes(ref.quote));
          assert.match(source.text, /Телефон: по желанию/);
        },
      );
      let contextStepId = "";
      await t.test(
        "личный шаг: сохранение, настоящий новый контекст и завершение по результату",
        async () => {
          const v = await load(),
            r = v.recommendations.find((r) => r.kind === "CONTEXT")!;
          assert.ok(r);
          const saved = await Promise.all(
            [1, 2].map(() =>
              candidate.call("profile.stepStart", {
                scope: scope(),
                key: r.key,
              }),
            ),
          );
          assert.equal(saved[0].id, saved[1].id);
          contextStepId = saved[0].id;
          // A wording/configuration upgrade retains the existing action and its history.
          await db.developmentStep.update({
            where: { id: contextStepId },
            data: {
              key: `legacy-${contextStepId}`,
              recommendation: {
                ...r,
                key: `legacy-${contextStepId}`,
                configVersion: "work-actions-drive-v1",
              },
            },
          });
          const resumed = await candidate.call("profile.stepStart", {
            scope: scope(),
            key: r.key,
          });
          assert.equal(resumed.id, contextStepId);
          assert.equal(
            (await load()).steps.find((step) => step.id === resumed.id)!
              .recommendation!.configVersion,
            "work-actions-drive-v1",
          );
          const next = await candidate.call("profile.stepContinue", {
            scope: scope(),
            id: contextStepId,
          });
          const id = new URL(next.href, origin).searchParams.get("attempt")!;
          assert.notEqual(id, workId);
          await candidate.call("project.save", {
            id,
            slug: "digital-products",
            revision: 0,
            requestKey: randomUUID(),
            state: {
              screens: ["equipment", "availability", "contact", "confirm"],
              requiredPhone: false,
              unavailable: "alternatives",
              reservationDetails: true,
            },
          });
          assert.equal(
            (await load()).steps.find((s) => s.id === contextStepId)?.status,
            "RESULT_SAVED",
          );
          await candidate.call(
            "profile.stepSave",
            {
              id: contextStepId,
              revision: 0,
              note: "Хочу сам назначить себе выполнение упражнения",
              complete: true,
            },
            400,
          );
          const explain = (await load()).recommendations.find(
            (r) => r.kind === "EXPLAIN",
          )!;
          const s = await candidate.call("profile.stepStart", {
            scope: scope(),
            key: explain.key,
          });
          await candidate.call("profile.stepSave", {
            id: s.id,
            revision: 0,
            note: "Сначала показываю варианты, чтобы посетитель выбрал до ввода контакта.",
            complete: true,
          });
          assert.equal(
            (await load()).steps.find((v) => v.id === s.id)?.status,
            "SELF_REPORTED",
          );
          await candidate.call(
            "profile.stepSave",
            {
              id: s.id,
              revision: 0,
              note: "Устаревшее изменение не должно стереть сохранённую запись.",
              complete: false,
            },
            409,
          );
        },
      );
      await other.call("register", {
        name: "Другой Пользователь",
        email: emails[1],
        password: "ProfileChecks2026!",
      });
      await grantQaAccess(db, emails[1]);
      await t.test(
        "разные аккаунты не читают чужую историю и план",
        async () => {
          assert.ok((await load()).history.some((h) => h.id === oldAnswer.id));
          assert.ok((await load()).steps.some((s) => s.id === contextStepId));
          await other.call(
            "profile.load",
            { scope: { attemptId: workId } },
            404,
          );
        },
      );
      const priv = await candidate.call("project.save", {
        slug: "digital-media",
        state: {
          ...initialState,
          caption:
            "PRIVATE_UNTRANSFERRED_MEDIA_731. Встреча перенесена. Мой личный текст.",
        },
        requestKey: randomUUID(),
      });
      privateId = priv.id;
      const app = await candidate.call("application.save", {
        revision: 0,
        programSlug: "digital-products",
        fields: {
          ...emptyFields,
          name: "Новая Профильная",
          email: emails[0],
          city: "Алматы",
          citizenship: "Казахстан",
          motivation:
            "Хочу исследовать интерфейсы, сравнивать решения и проверять доступность сервисов.",
          experience:
            "Я собрала вопросы для встречи читателей и проверила доступные варианты расписания.",
          personalRole:
            "Я подготовила форму и записала наблюдения после проверки маршрута участником.",
          documentNote:
            "Документ предоставлю после уточнения доступного способа передачи.",
          videoUrl: "https://example.org/profile-own-video",
          most: "0",
          least: "2",
          processing: true,
        },
      });
      applicationId = app.id;
      const transfer = await candidate.call("work.transfer", {
        attemptId: workId,
        revision: 2,
        consent: true,
      });
      await candidate.call("application.submit", {
        revision: app.revision,
        confirm: true,
      });
      await db.application.update({
        where: { id: applicationId },
        data: { origin: "QA" },
      });
      const submitted = await db.applicationVersion.findFirstOrThrow({
        where: { applicationId, kind: "SUBMITTED" },
      });
      let staffAnswer: ProfileTurnView, run: ScoringView["runs"][number];
      await t.test(
        "сборка контекста разделена до провайдера, чужие работы и внутренние операции закрыты",
        async () => {
          const owner = await db.user.findUniqueOrThrow({
              where: { email: emails[0] },
            }),
            reviewer = await db.user.findUniqueOrThrow({
              where: { email: "admissions@invision.local" },
            });
          const cc = await collectProfile(owner, {}),
            sc = await collectProfile(reviewer, staffScope());
          assert.ok(
            cc.sources.some((s) =>
              s.text.includes("PRIVATE_UNTRANSFERRED_MEDIA_731"),
            ),
          );
          assert.ok(
            !JSON.stringify(sc).includes("PRIVATE_UNTRANSFERRED_MEDIA_731"),
          );
          assert.deepEqual(sc.works, []);
          assert.ok(
            !cc.sources.some((s) =>
              ["scoring", "human", "review", "plan"].includes(s.group),
            ),
          );
          assert.ok(!JSON.stringify(sc).includes("milestones"));
          const ownTransfer = await candidate.ask("transferred");
          assert.match(JSON.stringify(ownTransfer), /версия 2/);
          await candidate.call(
            "profile.ask",
            {
              scope: {},
              topic: "assessment",
              question: "Объяснить оценку",
              requestKey: randomUUID(),
            },
            403,
          );
          const unsupported = await candidate.call("profile.ask", {
            question: "Покажи скрытый анализ комиссии и её ключи теста",
            requestKey: randomUUID(),
          });
          assert.equal(unsupported.answer.supported, false);
          assert.deepEqual(unsupported.answer.claims, []);
          await other.call("profile.load", { scope: { applicationId } }, 404);
          await staff.call(
            "profile.load",
            { scope: { applicationId, attemptId: privateId } },
            403,
          );
          await other.call("profile.stepContinue", { id: contextStepId }, 404);
          const prev = globalThis.fetch;
          globalThis.fetch = async () => {
            throw new Error("NETWORK_FORBIDDEN");
          };
          try {
            const a = await new LocalProfileProvider().answer(cc, {
              topic: "result",
            });
            validateProfileAnswer(a, cc);
            const bad = structuredClone(a) as {
              claims: { refs: { quote: string }[] }[];
            };
            bad.claims[0].refs[0].quote = "Чужая неподтверждённая цитата";
            assert.throws(() => validateProfileAnswer(bad, cc), /QUOTE/);
          } finally {
            globalThis.fetch = prev;
          }
          const setting = process.env.PROFILE_PROVIDER;
          process.env.PROFILE_PROVIDER = "external";
          assert.throws(() => configuredProfileProvider());
          if (setting === undefined) delete process.env.PROFILE_PROVIDER;
          else process.env.PROFILE_PROVIDER = setting;
        },
      );
      await t.test(
        "служебные основания и человеческая версия через действующий скоринг",
        async () => {
          const launched = await staff.call("scoring.launch", {
            applicationId,
          });
          for (let n = 0; n < 40; n++) {
            const v: ScoringView = await staff.call("scoring.status", {
              applicationId,
            });
            run = v.runs.find((r) => r.id === launched.id)!;
            if (run.status === "COMPLETED") break;
            await new Promise((r) => setTimeout(r, 30));
          }
          assert.equal(run.status, "COMPLETED");
          assert.equal(run.result!.state, "REQUIRES_REVIEW");
          await staff.call("scoring.review", {
            applicationId,
            runId: run.id,
            requestKey: randomUUID(),
            baseReviewId: null,
            rejectedEvidenceIds: [],
            reason:
              "INTERNAL_PROFILE_REVIEW_462: требуется проверить личное действие по источнику.",
            result: run.result,
          });
          staffAnswer = await staff.ask("assessment", staffScope());
          assert.match(
            JSON.stringify(staffAnswer),
            /INTERNAL_PROFILE_REVIEW_462/,
          );
          const candidateContext = await candidate.call("profile.load");
          assert.ok(
            !JSON.stringify(candidateContext).includes(
              "INTERNAL_PROFILE_REVIEW_462",
            ),
          );
          const ref = staffAnswer.answer!.claims[0].refs[0];
          await candidate.call(
            "profile.source",
            {
              scope: staffScope(),
              answerId: staffAnswer.id,
              sourceKey: ref.key,
            },
            404,
          );
          const original = await staff.call("profile.source", {
            scope: staffScope(),
            answerId: staffAnswer.id,
            sourceKey: ref.key,
          });
          assert.equal(original.version, ref.version);
          const draftAction = staffAnswer.answer!.actions.find(
            (a) => a.kind === "FEEDBACK",
          )!;
          const freshDraft = await staff.call("profile.perform", {
            scope: staffScope(),
            answerId: staffAnswer.id,
            actionKey: draftAction.key,
          });
          assert.equal(freshDraft.runId, run.id);
          assert.match(
            JSON.stringify(freshDraft.result),
            /INTERNAL_PROFILE_REVIEW_462/,
          );
        },
      );
      let decisionId = "",
        feedbackId = "";
      await t.test(
        "явное добавление в ATOLA без дублей и публикация прежним процессом",
        async () => {
          const a = await db.application.findUniqueOrThrow({
            where: { id: applicationId },
          });
          const d = await staff.call("decision", {
            ...(await reviewBase()),
            revision: a.revision,
            action: "INTERVIEW",
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            reason:
              "Обсудить личный вклад и результат учебной проверки на интервью.",
          });
          decisionId = d.id;
          const q = await staff.ask("gaps", staffScope());
          const add = q.answer!.actions.find((a) => a.kind === "ATOLA")!;
          assert.ok(add);
          await staff.call("profile.perform", {
            scope: staffScope(),
            answerId: q.id,
            actionKey: add.key,
          });
          const repeated = await staff.call("profile.perform", {
            scope: staffScope(),
            answerId: q.id,
            actionKey: add.key,
          });
          assert.equal(repeated.alreadyAdded, true);
          const interview = await db.interview.findFirstOrThrow({
            where: { applicationId },
          });
          assert.equal(
            (interview.plan as { questions: unknown[] }).questions.length,
            1,
          );
          assert.equal(interview.status, "SCHEDULED");
          assert.equal(interview.result, null);
          const source = await db.source.findFirstOrThrow({
            where: { applicationId, title: "Опыт и личная роль" },
          });
          const f = await staff.call("feedback.save", {
            ...(await reviewBase()),
            decisionId,
            observation:
              "В вашем описании есть проверка формы и выбор маршрута участника.",
            suggestion:
              "Поясните, какую альтернативу вы проверили и что изменили после наблюдения.",
            nextAction:
              "Подготовьте пояснение для обсуждения и сохраните его в своём личном плане.",
            sourceIds: [source.id],
          });
          feedbackId = f.id;
          const before = await candidate.ask("feedback");
          assert.equal(before.answer!.claims.length, 0);
          await staff.call("feedback.preview", {
            ...(await reviewBase()),
            id: f.id,
          });
          await staff.call("feedback.publish", {
            ...(await reviewBase()),
            id: f.id,
            confirm: true,
          });
          const pub = await candidate.ask("feedback");
          assert.match(JSON.stringify(pub), /Поясните, какую альтернативу/);
          const focused: ProfileView = await candidate.call("profile.load", {
            scope: { feedbackId: f.id },
          });
          assert.equal(focused.works.length, 0);
          assert.ok(
            focused.recommendations.every(
              (r) => r.source.key === `publication:${f.id}`,
            ),
          );
          assert.ok(
            pub.answer!.claims[0].refs.some(
              (r) => r.key === `source:${source.id}`,
            ),
          );
          assert.ok(
            !JSON.stringify(pub).includes("INTERNAL_PROFILE_REVIEW_462"),
          );
          const v: ProfileView = await candidate.call("profile.load");
          const rec = v.recommendations.find(
            (r) => r.origin === "Опубликованная обратная связь",
          )!;
          const step = await candidate.call("profile.stepStart", {
            key: rec.key,
          });
          const fingerprint = JSON.stringify(
            await db.application.findUnique({
              where: { id: applicationId },
              include: { assessments: true, decisions: true },
            }),
          );
          await candidate.call("profile.stepSave", {
            id: step.id,
            revision: 0,
            note: "Я выбрала показывать варианты до контакта. Альтернатива — сначала собрать адрес, но её стоит использовать только при уже выбранном времени.",
            complete: true,
          });
          assert.equal(
            JSON.stringify(
              await db.application.findUnique({
                where: { id: applicationId },
                include: { assessments: true, decisions: true },
              }),
            ),
            fingerprint,
          );
        },
      );
      await t.test(
        "уточнение делает старое объяснение историческим и блокирует старое действие",
        async () => {
          await candidate.call("message", {
            applicationId,
            body: "Я сама проверила форму без телефона и перенесла выбор времени перед контактом. Редактор подготовил текст приглашения.",
          });
          const changed = await staff.ask("clarification", staffScope());
          assert.match(JSON.stringify(changed), /Историческая версия/);
          assert.match(JSON.stringify(changed), /сама проверила/);
          assert.ok(
            !changed.answer!.actions.some((a) => a.kind === "FEEDBACK"),
          );
          assert.deepEqual(
            (
              await db.applicationVersion.findUniqueOrThrow({
                where: { id: submitted.id },
              })
            ).snapshot,
            submitted.snapshot,
          );
          assert.equal(
            await db.decision.count({ where: { applicationId } }),
            1,
          );
          assert.equal(
            (
              await staff.call("profile.load", { scope: staffScope() })
            ).history.find((h: ProfileTurnView) => h.id === staffAnswer.id)
              ?.stale,
            true,
          );
        },
      );
      await t.test(
        "отзыв передачи и удаление источника закрывают историю, цитаты и личный план",
        async () => {
          const passed = await staff.ask("transferred", staffScope());
          const ref = passed.answer!.claims[0].refs[0];
          await db.workTransfer.delete({ where: { id: transfer.id } });
          const after: ProfileView = await staff.call("profile.load", {
            scope: staffScope(),
          });
          assert.equal(
            after.history.find((h) => h.id === passed.id)?.unavailable,
            true,
          );
          await staff.call(
            "profile.source",
            { scope: staffScope(), answerId: passed.id, sourceKey: ref.key },
            404,
          );
          const privateAnswer = await candidate.ask("result", {
            attemptId: privateId,
          });
          await db.projectAttempt.delete({ where: { id: privateId } });
          await candidate.call(
            "profile.load",
            { scope: { attemptId: privateId } },
            404,
          );
          await candidate.call(
            "profile.source",
            {
              scope: { attemptId: privateId },
              answerId: privateAnswer.id,
              sourceKey: privateAnswer.answer!.claims[0].refs[0].key,
            },
            404,
          );
          const publication = await candidate.ask("feedback");
          await db.feedbackPublication.update({
            where: { id: feedbackId },
            data: { publishedAt: null },
          });
          const history: ProfileView = await candidate.call("profile.load");
          assert.equal(
            history.history.find((h) => h.id === publication.id)?.unavailable,
            true,
          );
          assert.ok(
            history.steps.some(
              (s) => s.status === "UNAVAILABLE" && s.note === "",
            ),
          );
          const metadata = await db.profileAnswer.findUniqueOrThrow({
            where: { id: oldAnswer.id },
          });
          assert.equal(metadata.provider, "local");
          assert.equal(metadata.instructionVersion, "profile-facts-v1");
          assert.equal(metadata.inputHash.length, 64);
        },
      );
    } finally {
      await cleanupRun(db, emails);
      await db.$disconnect();
      await profileDb.$disconnect();
    }
  },
);
