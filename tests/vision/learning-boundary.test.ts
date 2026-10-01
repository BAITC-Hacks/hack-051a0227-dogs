import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { initialState } from "../../src/lib/projects";
import { askScene, sceneContext } from "../../src/lib/vision-scene.server";
import { missions } from "../../src/lib/missions";
import { initialMission } from "../../src/lib/missions";
import { workFeedback } from "../../src/lib/journey";
import { json } from "../../src/lib/learning-resources.server";
import { visionContext } from "../../src/lib/vision-context.server";
import { visionAsk } from "../../src/lib/vision-service.server";
import { runVision } from "../../src/lib/vision-provider.server";
import { profileView } from "../../src/lib/profile-service.server";
import { treeView } from "../../src/lib/development-tree.server";
import { emptyFields } from "../../src/lib/validation";
import { emptyIntake } from "../../src/lib/intake-contract";

test("Vision answers a draft applicant's submission blockers from current rules without an external call", async () => {
  const user = await db.user.create({
    data: {
      role: "CANDIDATE",
      origin: "QA",
      name: "Тестовая Кандидатка",
      email: `intake-vision-${randomUUID()}@qa.local`,
    },
  });
  try {
    await db.application.create({
      data: {
        userId: user.id,
        programSlug: "digital-products",
        fields: json({
          ...emptyFields,
          name: user.name,
          email: user.email,
          citizenship: "Казахстан",
          intake: emptyIntake,
        }),
      },
    });
    const events: { type: string; value: unknown }[] = [];
    const row = await visionAsk(
      user,
      {
        scope: {},
        question: "Почему я не могу отправить заявку?",
        requestKey: randomUUID(),
      },
      new AbortController().signal,
      async (type, value) => {
        events.push({ type, value });
      },
      async () => {
        throw new Error("External provider must not run for intake rules");
      },
    );
    assert.equal(row.provider, "intake-rules");
    assert.ok(
      events.some(
        (event) =>
          event.type === "answer" &&
          JSON.stringify(event.value).includes("Нужно исправить"),
      ),
    );
    assert.equal(events.at(-1)?.type, "done");
  } finally {
    await db.profileAnswer.deleteMany({ where: { userId: user.id } });
    await db.application.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

test("Vision text: allowlisted context without a consent switch, explicit revocation and owner isolation", async () => {
  const user = await db.user.create({
    data: {
      role: "CANDIDATE",
      origin: "QA",
      name: "PRIVATE_NAME",
      email: `private-${randomUUID()}@qa.local`,
      interests: ["sociology"],
    },
  });
  const other = await db.user.create({
    data: { role: "CANDIDATE", origin: "QA" },
  });
  const staff = await db.user.findFirstOrThrow({ where: { role: "STAFF" } });
  await db.candidateAccessGrant.create({
    data: {
      userId: user.id,
      issuedById: staff.id,
      scope: "FULL_CABINET",
      reason: "Изолированная проверка доступа к учебному контексту",
    },
  });
  const before = await db.openAICall.count();
  try {
    const mission = initialMission("digital-products");
    mission.plan.explanation = "PRIVATE_AUTHOR_TEXT";
    const state = { ...initialState, mission };
    const w = await db.projectAttempt.create({
      data: {
        userId: user.id,
        slug: "digital-products",
        configVersion: 3,
        revision: 1,
        state: json(state),
        versions: {
          create: {
            revision: 1,
            state: json(state),
            feedback: json(workFeedback("digital-products", state)),
            ruleVersion: 3,
          },
        },
      },
    });
    await db.application.create({
      data: {
        userId: user.id,
        programSlug: "creative-engineering",
        fields: json({
          ...emptyFields,
          motivation: "PRIVATE_APPLICATION_TEXT",
        }),
      },
    });
    const view = await treeView(user);
    assert.equal(view.programSlug, "creative-engineering");
    assert.equal(view.publications.length, 0);
    const scope = { attemptId: w.id },
      c = await visionContext(user, scope, false);
    assert.ok(!JSON.stringify(c.sources).includes("PRIVATE_"));
    assert.ok(
      c.sources.every(
        (s) =>
          s.key.startsWith("learning:") ||
          ["program", "resource"].includes(s.group),
      ),
    );
    await assert.rejects(visionContext(other, scope, false));
    let calls = 0;
    const runner: Parameters<typeof visionAsk>[4] = async (input) =>
      runVision(input, async (options) => {
        calls++;
        const body = JSON.parse(options.body as string);
        assert.ok(!JSON.stringify(body.input).includes("PRIVATE_"));
        assert.ok(!JSON.stringify(body.input).includes(user.email!));
        assert.equal(options.task, "text");
        const source = input.context.sources[0];
        return {
          value: {
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      text: "Разбор выбранной практики",
                      claims: [
                        {
                          text: "В работе доступны условия проверки.",
                          refs: [{ key: source.key, quote: source.text }],
                        },
                      ],
                      actionKeys: [],
                      proposalKey: null,
                    }),
                  },
                ],
              },
            ],
          },
          requestId: undefined,
          usage: undefined,
        };
      });
    const q = {
      scope,
      question: `PRIVATE_NAME ${user.email} Как проверить маршрут?`,
      operation: "complex",
      requestKey: randomUUID(),
    };
    const answer = await visionAsk(
      user,
      q,
      new AbortController().signal,
      async () => {},
      runner,
    );
    await visionAsk(
      user,
      q,
      new AbortController().signal,
      async () => {},
      runner,
    );
    assert.equal(calls, 1);
    assert.ok(
      (await profileView(user, scope)).history.some(
        (h) => h.id === answer.id && !h.unavailable,
      ),
    );
    await visionAsk(
      user,
      { ...q, previousId: answer.id, requestKey: randomUUID() },
      new AbortController().signal,
      async () => {},
      runner,
    );
    const role = missions["digital-products"].team[0].id;
    const scene = await sceneContext(user, w.id, 1, role);
    await askScene(
      user,
      {
        attemptId: w.id,
        revision: 1,
        role,
        question: q.question,
        requestKey: randomUUID(),
      },
      new AbortController().signal,
      async (options) => {
        await options.permission.authorize();
        assert.ok(
          !JSON.parse(options.body as string).input.includes("PRIVATE_"),
        );
        return {
          value: {
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      text: "Сведения участника",
                      quote: scene.facts.knowledge,
                    }),
                  },
                ],
              },
            ],
          },
          usage: undefined,
          requestId: undefined,
        };
      },
    );
    const revoked = await db.user.update({
      where: { id: user.id },
      data: {
        visionConsent: {
          granted: false,
          revision: 1,
          at: new Date().toISOString(),
        },
      },
    });
    await assert.rejects(visionContext(revoked, scope, false));
    assert.ok(
      (await profileView(revoked, scope)).history.every((h) => h.unavailable),
    );
    assert.equal(await db.openAICall.count(), before);
  } finally {
    await db.profileAnswer.deleteMany({ where: { userId: user.id } });
    await db.application.deleteMany({ where: { userId: user.id } });
    await db.projectAttempt.deleteMany({ where: { userId: user.id } });
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await db.$disconnect();
  }
});
