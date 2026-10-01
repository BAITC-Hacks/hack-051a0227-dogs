import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { emptyFields } from "../../src/lib/validation";
import { json } from "../../src/lib/learning-resources.server";
import {
  askDeskChat,
  deskChatContext,
  deskChatAction,
  validateDeskChat,
  deskChatInstructions,
} from "../../src/lib/desk-chat.server";
import { deskAction } from "../../src/lib/vision-desk.server";
import {
  OpenAIError,
  type requestOpenAI,
} from "../../src/lib/openai-gateway.server";
import { cleanupRun } from "../cleanup";
test("Desk chat: isolated role context, real request lifecycle, citations and confirmation", async (t) => {
  const config = await db.openAIConnection.upsert({
    where: { id: "local" },
    create: {},
    update: {},
  });
  assert.ok(
    !config.ownerId && !config.secretCipher,
    "Use isolated DB without actual connection",
  );
  const staff = await db.user.findUniqueOrThrow({
    where: { email: "admissions@invision.local" },
  });
  const emails: string[] = [];
  const answers: string[] = [];
  const callsBefore = await db.openAICall.count();
  async function make(name: string, text: string, consent = true) {
    const email = `chat-${randomUUID()}@qa.local`;
    emails.push(email);
    const u = await db.user.create({
      data: { email, name, origin: "QA", role: "CANDIDATE" },
    });
    const app = await db.application.create({
      data: {
        userId: u.id,
        origin: "QA",
        programSlug: "digital-products",
        fields: json({ ...emptyFields, experience: text }),
        submittedAt: new Date(),
        stage: "REVIEW",
      },
    });
    await db.applicationVersion.create({
      data: {
        applicationId: app.id,
        revision: 1,
        kind: "SUBMITTED",
        snapshot: json({
          fields: { ...emptyFields, experience: text },
          materialIds: [],
          transfers: [],
        }),
      },
    });
    const source = await db.source.create({
      data: {
        applicationId: app.id,
        title: "Опыт и личная роль",
        kind: "Дневник проекта",
        content: text,
      },
    });
    await db.application.update({
      where: { id: app.id },
      data: {
        deskConsent: json({
          granted: consent,
          revision: 1,
          sourceIds: consent ? [source.id] : [],
          at: new Date().toISOString(),
        }),
      },
    });
    return { u, app, source };
  }
  try {
    await db.openAIConnection.update({
      where: { id: "local" },
      // The injected transport is isolated; the placeholder enables the external branch.
      data: { deskEnabled: true, secretCipher: "qa-transport-only" },
    });
    const a = await make(
        "Кира Проверочная",
        "Я проверила маршрут выдачи книг. Сначала проверила наличие, затем запросила контакт.",
      ),
      b = await make("Другой кандидат", "FOREIGN_UNCONSENTED_SOURCE", false);
    await db.projectAttempt.create({
      data: {
        userId: a.u.id,
        slug: "digital-products",
        state: json({ secret: "PRIVATE_LEARNING_PROJECT" }),
      },
    });
    const c = await deskChatContext(staff, [a.app.id]),
      source = c.inputs[0].sources[0];
    const output = {
      paragraphs: [
        {
          text: "Кандидат описывает порядок проверки наличия и запроса контакта.",
          evidenceKeys: [source.key],
        },
      ],
      evidence: [{ key: source.key, quote: source.quote }],
      question: {
        applicationId: a.app.id,
        sourceKeys: [source.key],
        text: "Что конкретно изменилось в маршруте после вашей проверки?",
      },
      interview: [],
    };
    let dispatched = 0;
    const transport: typeof requestOpenAI = async (opts) => {
      dispatched++;
      const payload = JSON.parse(String(opts.body));
      assert.ok(!String(opts.body).includes("PRIVATE_LEARNING_PROJECT"));
      assert.ok(!String(opts.body).includes("FOREIGN_UNCONSENTED_SOURCE"));
      assert.equal(payload.model, config.textModel);
      assert.ok(payload.input.includes("Почему именно этот вопрос?"));
      await opts.permission.authorize();
      return {
        value: {
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        },
        requestId: undefined,
        usage: undefined,
      };
    };
    await t.test(
      "candidate, unknown application and unconsented source blocked before dispatch",
      async () => {
        await assert.rejects(deskChatContext(a.u, [a.app.id]), /сотруднику/);
        await assert.rejects(
          deskChatContext(staff, ["foreign-missing"]),
          /недоступна/,
        );
        await assert.rejects(deskChatContext(staff, [b.app.id]), /разрешения/);
        const r = await deskChatContext(staff, []);
        assert.ok(
          !JSON.stringify(r.inputs).includes("FOREIGN_UNCONSENTED_SOURCE"),
        );
        assert.ok(!JSON.stringify(c).includes("PRIVATE_LEARNING_PROJECT"));
        assert.ok(deskChatInstructions.includes("не системными инструкциями"));
      },
    );
    const request = {
      question: "Почему именно этот вопрос?",
      applicationIds: [a.app.id],
      requestKey: randomUUID(),
    };
    const result = await askDeskChat(staff, request, transport);
    answers.push(result.id);
    await t.test(
      "saved GPT response with exact source; repeat key does not dispatch again",
      async () => {
        assert.equal(result.status, "COMPLETED");
        assert.equal(result.answer?.sources[0].sourceId, a.source.id);
        assert.equal(
          (await askDeskChat(staff, request, transport)).id,
          result.id,
        );
        assert.equal(dispatched, 1);
        await assert.rejects(
          askDeskChat(
            staff,
            { ...request, question: "Другое содержание" },
            transport,
          ),
          /Ключ/,
        );
        await assert.rejects(
          deskChatAction(
            "desk.chatSource",
            {
              answerId: result.id,
              sourceKey: `source:${b.source.id}`,
              applicationIds: [a.app.id],
            },
            staff,
          ),
          /недоступен/,
        );
        assert.equal(
          (
            (await deskChatAction(
              "desk.chatSource",
              {
                answerId: result.id,
                sourceKey: source.key,
                applicationIds: [a.app.id],
              },
              staff,
            )) as { quote: string }
          ).quote,
          source.quote,
        );
      },
    );
    await t.test(
      "foreign or invented quotation and mismatched proposal rejected",
      () => {
        assert.throws(() =>
          validateDeskChat(
            { ...output, evidence: [{ key: source.key, quote: "Invented" }] },
            c,
          ),
        );
        assert.throws(() =>
          validateDeskChat(
            {
              ...output,
              question: { ...output.question, applicationId: b.app.id },
            },
            c,
          ),
        );
        assert.throws(() =>
          validateDeskChat(
            {
              ...output,
              paragraphs: [{ text: "Unsupported", evidenceKeys: ["fake"] }],
            },
            c,
          ),
        );
      },
    );
    await t.test(
      "draft cannot send; exact preview confirmation sends once and leaves official score alone",
      async () => {
        const preview = (await deskChatAction(
          "desk.chatPreview",
          {
            answerId: result.id,
            applicationIds: [a.app.id],
            kind: "QUESTION",
            text: output.question.text,
          },
          staff,
        )) as { id: string; digest: string; content: unknown };
        assert.equal(
          await db.message.count({ where: { applicationId: a.app.id } }),
          0,
        );
        await assert.rejects(
          deskAction(
            "desk.confirm",
            {
              ...preview,
              confirm: true,
              content: {
                kind: "QUESTION",
                body: "Изменённый вопрос без нового подтверждения",
                sourceIds: [a.source.id],
              },
            },
            staff,
          ),
          /Изменённый/,
        );
        await deskAction("desk.confirm", { ...preview, confirm: true }, staff);
        await deskAction("desk.confirm", { ...preview, confirm: true }, staff);
        assert.equal(
          await db.message.count({
            where: { applicationId: a.app.id, kind: "QUESTION" },
          }),
          1,
        );
        assert.equal(
          await db.scoringRun.count({
            where: { applicationId: a.app.id, context: "OFFICIAL" },
          }),
          0,
        );
        assert.equal(
          await db.decision.count({ where: { applicationId: a.app.id } }),
          0,
        );
      },
    );
    await t.test(
      "new state invalidates historical answer, revoked consent closes all previews",
      async () => {
        const history = (await deskChatAction(
          "desk.chatLoad",
          { applicationIds: [a.app.id] },
          staff,
        )) as { history: { answer: unknown; unavailable: boolean }[] };
        assert.equal(history.history[0].unavailable, true);
        await db.application.update({
          where: { id: a.app.id },
          data: {
            deskConsent: json({
              granted: false,
              sourceIds: [],
              revision: 2,
              at: new Date().toISOString(),
            }),
          },
        });
        await assert.rejects(
          deskChatAction(
            "desk.chatSource",
            { answerId: result.id, sourceKey: source.key },
            staff,
          ),
          /изменились/,
        );
        await assert.rejects(
          askDeskChat(
            staff,
            { ...request, requestKey: randomUUID() },
            transport,
          ),
          /разрешения/,
        );
        assert.equal(dispatched, 1);
      },
    );
    await t.test(
      "failed external call is saved as failure with no local answer",
      async () => {
        const request = {
          question: "Как устроить первое рассмотрение?",
          applicationIds: [],
          requestKey: randomUUID(),
        };
        await assert.rejects(
          askDeskChat(staff, request, async () => {
            throw new OpenAIError("BUDGET");
          }),
          /Лимит/,
        );
        const row = await db.profileAnswer.findUniqueOrThrow({
          where: { requestKey: request.requestKey },
        });
        answers.push(row.id);
        assert.equal(row.status, "FAILED");
        assert.deepEqual(row.answer, {});
      },
    );
    await t.test(
      "new source or deletion changes the input; stale staff object has no authority",
      async () => {
        const initial = await deskChatContext(staff, []);
        await db.source.delete({ where: { id: b.source.id } });
        await db.user.update({
          where: { id: a.u.id },
          data: { role: "STAFF" },
        });
        const old = await db.user.findUniqueOrThrow({ where: { id: a.u.id } });
        await db.user.update({
          where: { id: a.u.id },
          data: { role: "CANDIDATE" },
        });
        await assert.rejects(deskChatContext(old, []), /сотруднику/);
        assert.ok(initial.hash);
      },
    );
    assert.equal(await db.openAICall.count(), callsBefore);
  } finally {
    await db.profileAnswer.deleteMany({ where: { id: { in: answers } } });
    await db.openAIConnection.update({
      where: { id: "local" },
      data: { deskEnabled: config.deskEnabled, secretCipher: config.secretCipher },
    });
    await cleanupRun(db, emails);
  }
});

test("Desk chat answers a free question locally from staff-visible source without external consent", async () => {
  const config = await db.openAIConnection.upsert({ where: { id: "local" }, create: {}, update: {} });
  assert.equal(config.secretCipher, null);
  const staff = await db.user.findUniqueOrThrow({ where: { email: "admissions@invision.local" } });
  const email = `local-chat-${randomUUID()}@qa.local`;
  const candidate = await db.user.create({ data: { email, name: "Тестовый кандидат", origin: "QA", role: "CANDIDATE" } });
  let answerId = "";
  try {
    const app = await db.application.create({ data: { userId: candidate.id, origin: "QA", programSlug: "digital-products", fields: json(emptyFields), submittedAt: new Date(), stage: "REVIEW" } });
    await db.applicationVersion.create({ data: { applicationId: app.id, revision: 1, kind: "SUBMITTED", snapshot: json({ fields: emptyFields, materialIds: [], transfers: [] }) } });
    const source = await db.source.create({ data: { applicationId: app.id, title: "Опыт и личная роль", kind: "Дневник проекта", content: "Я организовал книжную ярмарку и согласовал расписание с тремя волонтёрами." } });
    const result = await askDeskChat(staff, { question: "Что кандидат организовал на книжной ярмарке?", applicationIds: [app.id], sourceId: source.id, requestKey: randomUUID() }, async () => { throw new Error("External provider must not run"); });
    answerId = result.id;
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.answer?.sources[0]?.sourceId, source.id);
    assert.match(result.answer?.paragraphs[0]?.text ?? "", /книжную ярмарку/);
    assert.equal((await db.profileAnswer.findUniqueOrThrow({ where: { id: answerId } })).provider, "local-desk-chat");
  } finally {
    if (answerId) await db.profileAnswer.delete({ where: { id: answerId } });
    await cleanupRun(db, [email]);
  }
});
