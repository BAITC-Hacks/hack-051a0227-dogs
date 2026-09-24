import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { emptyFields } from "../src/lib/validation";
import { domains } from "../src/lib/catalog";
import { sections } from "../src/lib/review-contract";
import { cleanupRun } from "./cleanup";
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
  async html(path: string) {
    return (
      await fetch(origin + path, { headers: { Cookie: this.cookie } })
    ).text();
  }
}
test(
  "рассмотрение новой заявки: источники, девять областей, интервью, приватный черновик и публикация",
  { timeout: 120000 },
  async (t) => {
    const db = new PrismaClient(),
      candidate = new Session(),
      stranger = new Session(),
      staff = new Session();
    const run = Date.now(),
      emails = [`review-${run}@qa.local`, `review-other-${run}@qa.local`];
    let appId = "",
      sourceId = "",
      snapshot: unknown,
      materialVersion = "",
      decisionId = "",
      draftId = "",
      interviewId = "";
    const context = async () => {
      materialVersion = (
        await staff.call("review.profile", { applicationId: appId })
      ).materialVersion;
      return materialVersion;
    };
    const base = () => ({ applicationId: appId, materialVersion });
    try {
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      for (const [index, s] of [candidate, stranger].entries()) {
        await s.call("register", {
          name: index ? "Другой Рассмотрение" : "Новая История Рассмотрения",
          email: emails[index],
          password: "ReviewScenario2026!",
        });
        await db.user.update({
          where: { email: emails[index] },
          data: { origin: "QA" },
        });
      }
      const fields = {
        ...emptyFields,
        name: "Новая История Рассмотрения",
        email: emails[0],
        city: "Алматы",
        experience:
          "Мы подготовили встречу читателей. Я собрал вопросы участников и предложил изменить расписание.",
        personalRole:
          "Я собрал вопросы участников и предложил изменить расписание.",
        motivation:
          "Хочу проектировать полезные сервисы и проверять решения через интервью с участниками.",
        processing: true,
        most: "0",
        least: "2",
        documentNote: "Документ нужно уточнить отдельно.",
        videoUrl: "https://example.org/review-video",
      };
      const app = await candidate.call("application.save", {
        fields,
        programSlug: "digital-products",
        revision: 0,
      });
      appId = app.id;
      await db.application.update({
        where: { id: appId },
        data: { origin: "QA" },
      });
      await staff.call("review.profile", { applicationId: appId }, 404);
      await candidate.call("application.submit", {
        revision: app.revision,
        confirm: true,
      });
      const version = await db.applicationVersion.findFirstOrThrow({
        where: { applicationId: appId, kind: "SUBMITTED" },
      });
      snapshot = version.snapshot;
      sourceId = (
        await db.source.findFirstOrThrow({
          where: { applicationId: appId, title: "Опыт и личная роль" },
        })
      ).id;
      await context();
      await t.test(
        "права, явный просмотр и отдельные состояния девяти областей",
        async () => {
          await candidate.call("review.profile", { applicationId: appId }, 403);
          await stranger.call(
            "review.domain",
            { ...base(), domain: domains[0] },
            403,
          );
          const otherApp = await stranger.call("application.save", {
            fields: {
              ...fields,
              name: "Другой Рассмотрение",
              email: emails[1],
            },
            programSlug: "digital-products",
            revision: 0,
          });
          await db.application.update({
            where: { id: otherApp.id },
            data: { origin: "QA" },
          });
          await stranger.call("application.submit", {
            revision: otherApp.revision,
            confirm: true,
          });
          const otherSource = await db.source.findFirstOrThrow({
            where: { applicationId: otherApp.id },
          });
          await staff.call(
            "review.source",
            { ...base(), sourceId: otherSource.id },
            404,
          );
          await candidate.call(
            "correction",
            {
              sourceId: otherSource.id,
              explanation: "Попытка исправить источник другой заявки.",
            },
            404,
          );
          const noSession = new Session();
          await noSession.call("review.profile", { applicationId: appId }, 401);
          await staff.call("review.source", { ...base(), sourceId });
          assert.equal(await db.sourceView.count({ where: { sourceId } }), 1);
          for (const domain of domains)
            await staff.call("review.domain", {
              ...base(),
              domain,
              sourceIds: [sourceId],
              sufficiency: "Недостаточно",
              consistency: "Не проверено",
              question: "Какое действие принадлежало лично кандидату?",
              gap: "PERSONAL_ACTION",
              observation: "Из рассказа пока неясна граница ответственности.",
            });
          assert.equal(
            await db.domainReview.count({ where: { applicationId: appId } }),
            9,
          );
          assert.equal(
            await db.assessment.count({ where: { applicationId: appId } }),
            0,
          );
          const r = await db.domainReview.findFirstOrThrow({
            where: { applicationId: appId, domain: domains[8] },
          });
          assert.equal(r.sufficiency, "Недостаточно");
        },
      );
      await t.test(
        "выделение эпизода не подменяет цитату; объединение сохраняет оригиналы",
        async () => {
          await staff.call(
            "review.episode",
            {
              ...base(),
              sourceId,
              quote: "Несуществующая фраза в рассказе",
              personalAction: "Личный вклад нужно проверить по источнику.",
              title: "Встреча",
            },
            400,
          );
          const n = await staff.call("review.episode", {
            ...base(),
            sourceId,
            quote: "Я собрал вопросы участников",
            personalAction: "Собрал вопросы перед изменением расписания.",
            title: "Дополнительное описание встречи",
          });
          await context();
          const original = await db.episode.findFirstOrThrow({
            where: { applicationId: appId, title: "Опыт из заявки" },
          });
          await staff.call("review.merge", {
            ...base(),
            fromId: n.episodeId,
            intoId: original.id,
            reason: "Это дополнительное описание той же встречи читателей.",
          });
          assert.equal(
            await db.episode.count({ where: { applicationId: appId } }),
            2,
          );
          assert.equal(
            (await db.episode.findUniqueOrThrow({ where: { id: n.episodeId } }))
              .mergedIntoId,
            original.id,
          );
          await context();
        },
      );
      await t.test(
        "внутреннее решение и черновик не раскрываются кандидату; публикация требует предпросмотра",
        async () => {
          const a = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          const reviewer = await db.user.findUniqueOrThrow({
            where: { email: "admissions@invision.local" },
          });
          await db.message.create({
            data: {
              applicationId: appId,
              authorId: reviewer.id,
              kind: "CONTINUE",
              body: "Рассмотрение продолжается.",
            },
          });
          const d = await staff.call("decision", {
            ...base(),
            revision: a.revision,
            action: "CLARIFICATION",
            reason:
              "INTERNAL_ONLY_REVIEW: требуется проверить личную роль без публикации служебной заметки.",
          });
          decisionId = d.id;
          const f = await staff.call("feedback.save", {
            ...base(),
            decisionId,
            observation:
              "Вы описали сбор вопросов перед изменением расписания.",
            suggestion: "Уточните, какое решение вы приняли самостоятельно.",
            nextAction:
              "Ответьте в переписке: какое действие вы выполнили лично?",
            sourceIds: [sourceId],
          });
          draftId = f.id;
          for (const path of ["/my", "/apply/status"]) {
            const html = await candidate.html(path);
            assert.ok(!html.includes("INTERNAL_ONLY_REVIEW"));
            assert.ok(
              !html.includes("Давай уточним"),
              "Legacy public history must not reveal the new unpublished stage",
            );
            assert.ok(
              !html.includes("какое решение вы приняли самостоятельно"),
            );
          }
          await candidate.call(
            "feedback.publish",
            { ...base(), id: draftId, confirm: true },
            403,
          );
          await staff.call(
            "feedback.publish",
            { ...base(), id: draftId, confirm: true },
            400,
          );
          const preview = await staff.call("feedback.preview", {
            ...base(),
            id: draftId,
          });
          assert.ok(preview.body.includes("Ответьте в переписке"));
          assert.ok(!preview.body.includes("INTERNAL_ONLY_REVIEW"));
          await Promise.all([
            staff.call("feedback.publish", {
              ...base(),
              id: draftId,
              confirm: true,
            }),
            staff.call("feedback.publish", {
              ...base(),
              id: draftId,
              confirm: true,
            }),
          ]);
          assert.equal(
            await db.message.count({
              where: { applicationId: appId, kind: "FEEDBACK" },
            }),
            1,
          );
          assert.ok(
            (await candidate.html("/apply/status")).includes(
              "какое решение вы приняли самостоятельно",
            ),
          );
          assert.ok(
            !(await stranger.html("/apply/status")).includes(
              "какое решение вы приняли самостоятельно",
            ),
          );
        },
      );
      await t.test(
        "новое уточнение меняет контекст, сохраняет snapshot и блокирует старый вывод",
        async () => {
          const before = materialVersion;
          const question = await staff.call("message", {
            applicationId: appId,
            body: "Что именно вы лично сделали для подготовки встречи?",
          });
          const answer = await candidate.call("message", {
            applicationId: appId,
            replyToId: question.id,
            body: "Я лично составил список вопросов и согласовал время с библиотекарем.",
          });
          assert.equal(answer.replyToId, question.id);
          assert.equal(
            (
              await db.source.findUniqueOrThrow({
                where: { messageId: answer.id },
              })
            ).content,
            answer.body,
          );
          await stranger.call(
            "message",
            {
              applicationId: appId,
              replyToId: question.id,
              body: "Чужой ответ",
            },
            404,
          );
          await candidate.call("correction", {
            sourceId,
            explanation:
              "Встреча была в четверг, исходное название проекта не меняется.",
          });
          assert.equal(
            await db.source.count({
              where: { applicationId: appId, kind: "Уточнение кандидата" },
            }),
            1,
          );
          await context();
          assert.notEqual(materialVersion, before);
          await staff.call(
            "review.domain",
            {
              ...base(),
              materialVersion: before,
              domain: domains[3],
              sourceIds: [sourceId],
              sufficiency: "Частично",
              consistency: "Не проверено",
              gap: "NONE",
              question: "",
              observation: "Новая информация требует сверки.",
            },
            409,
          );
          assert.deepEqual(
            (
              await db.applicationVersion.findUniqueOrThrow({
                where: { id: version.id },
              })
            ).snapshot,
            snapshot,
          );
          assert.equal(
            (await db.decision.findUniqueOrThrow({ where: { id: decisionId } }))
              .materialVersion,
            before,
          );
        },
      );
      await t.test(
        "подготовка и состоявшийся разговор раздельны, пять секций сохраняются",
        async () => {
          const a = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          await staff.call("decision", {
            ...base(),
            revision: a.revision,
            action: "INTERVIEW",
            reason:
              "Уточнение получено, обсудим применение вывода на интервью.",
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          });
          const interview = await db.interview.findFirstOrThrow({
            where: { applicationId: appId },
          });
          interviewId = interview.id;
          const current = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          await staff.call(
            "decision",
            {
              ...base(),
              revision: current.revision,
              action: "INTERVIEW",
              reason:
                "Проверка защиты от повторного приглашения на ту же встречу.",
              scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            },
            409,
          );
          assert.equal(
            await db.interview.count({ where: { applicationId: appId } }),
            1,
          );
          const review = await db.domainReview.findFirstOrThrow({
            where: { applicationId: appId },
          });
          const plan = {
            questions: [
              {
                id: "q1",
                section: "action",
                text: "Что вы сделали лично?",
                sourceId,
                reviewId: review.id,
              },
            ],
            notes: "PREPARATION_ONLY: проверить вклад в расписание.",
          };
          await staff.call("interview.plan", {
            ...base(),
            id: interviewId,
            revision: 0,
            plan,
          });
          const prepared = await db.interview.findUniqueOrThrow({
            where: { id: interviewId },
          });
          assert.equal(prepared.status, "SCHEDULED");
          assert.equal(prepared.result, null);
          await staff.call(
            "interview.save",
            {
              ...base(),
              id: interviewId,
              revision: 1,
              notes: {},
              finish: true,
            },
            400,
          );
          const result = {
            answers: Object.fromEntries(
              sections.map((s) => [
                s.key,
                "Не обсуждалось в этой контрольной встрече.",
              ]),
            ),
            observation:
              "Вымышленный участник описал конкретное согласование времени.",
            conclusion:
              "Контрольная беседа зафиксирована; для рассмотрения нужен пример применения вывода.",
          };
          await candidate.call(
            "interview.complete",
            {
              ...base(),
              id: interviewId,
              revision: 1,
              result,
              confirm: true,
              performedAt: new Date().toISOString(),
            },
            403,
          );
          await staff.call(
            "interview.complete",
            {
              ...base(),
              id: interviewId,
              revision: 1,
              result,
              confirm: false,
              performedAt: new Date().toISOString(),
            },
            400,
          );
          await staff.call("interview.complete", {
            ...base(),
            id: interviewId,
            revision: 1,
            result,
            confirm: true,
            performedAt: new Date().toISOString(),
          });
          const done = await db.interview.findUniqueOrThrow({
            where: { id: interviewId },
          });
          assert.equal(done.status, "COMPLETED");
          assert.deepEqual(done.plan, plan);
          assert.ok(!JSON.stringify(done.result).includes("PREPARATION_ONLY"));
          assert.equal(
            await db.interviewVersion.count({
              where: { interviewId, kind: "PLAN" },
            }),
            1,
          );
          assert.equal(
            await db.interviewVersion.count({
              where: { interviewId, kind: "RESULT" },
            }),
            1,
          );
          await context();
          const completedContext = materialVersion;
          await staff.call("interview.plan", {
            ...base(),
            id: interviewId,
            revision: 2,
            plan,
          });
          assert.equal(
            (
              await db.interview.findUniqueOrThrow({
                where: { id: interviewId },
              })
            ).status,
            "COMPLETED",
          );
          await context();
          assert.equal(
            materialVersion,
            completedContext,
            "Changing the plan must not change recorded interview evidence",
          );
        },
      );
      await t.test(
        "история решений, версии критериев, актуальность публикации и изоляция внутренних ответов",
        async () => {
          const a = await db.application.findUniqueOrThrow({
            where: { id: appId },
          });
          const d = await staff.call("decision", {
            ...base(),
            revision: a.revision,
            action: "FINAL_REVIEW",
            reason:
              "PRIVATE_FINAL: материалы и разговор рассмотрены сотрудником.",
          });
          assert.equal(
            await db.decision.count({ where: { applicationId: appId } }),
            3,
          );
          const f = await staff.call("feedback.save", {
            ...base(),
            decisionId: d.id,
            sourceIds: [sourceId],
            observation:
              "Рассказ дополнен личным действием по согласованию времени.",
            suggestion: "Опишите применение вывода в другой учебной ситуации.",
            nextAction: "Дополните ответ в существующей переписке с комиссией.",
          });
          await staff.call("feedback.preview", { ...base(), id: f.id });
          await candidate.call("message", {
            applicationId: appId,
            body: "Новый пример применения вывода добавлен после предпросмотра.",
          });
          await staff.call(
            "feedback.publish",
            { ...base(), id: f.id, confirm: true },
            409,
          );
          await context();
          await staff.call(
            "feedback.publish",
            { ...base(), id: f.id, confirm: true },
            409,
          );
          await staff.call("assessment", {
            ...base(),
            domain: domains[5],
            level: "Есть проявление",
            sufficiency: "Частично",
            contradiction: "",
            interpretation:
              "Описано личное действие; независимого подтверждения пока нет.",
            sourceIds: [sourceId],
          });
          const assessed = await db.assessment.findFirstOrThrow({
            where: { applicationId: appId },
          });
          assert.ok(assessed.rubricVersion > 0);
          assert.equal(assessed.materialVersion, materialVersion);
          const html = await candidate.html("/my");
          for (const privateText of [
            "PRIVATE_FINAL",
            "PREPARATION_ONLY",
            "независимого подтверждения пока нет",
            "вымышленный участник",
          ])
            assert.ok(!html.includes(privateText));
          await staff.call(
            "decision",
            {
              ...base(),
              revision: a.revision + 1,
              action: "ACCEPT",
              reason: "Непредусмотренное решение.",
            },
            400,
          );
          assert.equal(
            await db.audioJob.count({ where: { applicationId: appId } }),
            0,
          );
        },
      );
    } finally {
      await cleanupRun(db, emails);
      await db.$disconnect();
    }
  },
);
