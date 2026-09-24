import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  missions,
  initialMission,
  missionFeedback,
  missionChecks,
  readMission,
  type Mission,
} from "../../src/lib/missions";
import { applyMission } from "../../src/lib/missions.server";
import { initialState } from "../../src/lib/projects";
import { workCompleted, meaningfullyChanged } from "../../src/lib/journey";
import { emptyFields } from "../../src/lib/validation";
import { describeWork } from "../../src/lib/presentation";
import { twinSummary, type TwinComparison } from "../../src/lib/twin-contract";
import { cleanupRun } from "../cleanup";
const state = (mission: Mission) => ({ ...initialState, mission });
function prepared(slug: string, updated = false) {
  const m = initialMission(slug);
  m.phase = updated ? "UPDATED" : "INITIAL";
  m.plan.explanation =
    "Выбираю небольшой объём и оставляю ограничение явным для команды.";
  m.plan.verification =
    "Сопоставлю результат проверки с заданными условиями и проверю оставшееся ограничение.";
  const d = missions[slug];
  d.tasks.forEach((t, i) => (m.plan.assignments[t.id] = d.team[i].id));
  if (slug === "digital-products") m.plan.choices.fallback = "queue";
  if (slug === "creative-engineering" && updated)
    Object.assign(m.plan.choices, {
      battery: "large",
      route: "detour",
      trips: "two",
    });
  if (slug === "digital-media") {
    m.plan.headline = "Что удалось передать на встрече обмена";
    m.plan.choices.number = "books";
  }
  if (slug === "sociology")
    Object.assign(m.plan.choices, {
      sample: "missing",
      hypothesis: updated ? "mixed" : "time",
    });
  if (slug === "public-policy" && updated) {
    m.plan.allocations = [2, 2, 1];
    m.plan.choices.adultMode = "independent";
  }
  return m;
}
for (const slug of Object.keys(missions)) {
  test(`${slug}: результат, неудача, новый факт и переработка имеют разные основания`, async () => {
    const start = initialMission(slug);
    assert.equal(workCompleted(slug, state(start)), false);
    const valid = prepared(slug);
    assert.ok(
      missionChecks(valid).every((c) => c.passed),
      JSON.stringify(missionChecks(valid)),
    );
    const tested = await applyMission(slug, state(valid), state(start), {
      kind: "test",
    });
    assert.equal(
      workCompleted(slug, state(tested)),
      false,
      "First conditions do not complete both phases",
    );
    const changed = await applyMission(slug, state(tested), state(tested), {
      kind: "reveal",
    });
    assert.deepEqual(changed.baseline, tested.plan);
    assert.equal(changed.tests[0].phase, "INITIAL");
    const good = prepared(slug, true);
    Object.assign(changed.plan, good.plan);
    const done = await applyMission(
      slug,
      state(changed),
      state({ ...changed, plan: tested.plan }),
      { kind: "test" },
    );
    assert.equal(
      workCompleted(slug, state(done)),
      true,
      JSON.stringify(missionFeedback(done)),
    );
    const failed = structuredClone(done);
    failed.plan.assignments = {};
    assert.notEqual(
      missionFeedback(failed).summary,
      missionFeedback(done).summary,
    );
    assert.equal(workCompleted(slug, state(failed)), false);
    const badTest = await applyMission(slug, state(failed), state(done), {
      kind: "test",
    });
    assert.match(missionFeedback(badTest).summary, /план команды/);
    assert.match(describeWork(slug, state(done)), /Учебная работа/);
    assert.ok(describeWork(slug, state(done)).includes(missions[slug].newFact));
    const before = await applyMission(slug, state(valid), state(tested), {
      kind: "ask",
      role: missions[slug].team[0].id,
    });
    const after = await applyMission(slug, state(done), state(done), {
      kind: "ask",
      role: missions[slug].team[0].id,
    });
    assert.notEqual(before.conversations[0].text, after.conversations[0].text);
    assert.equal(
      meaningfullyChanged(slug, state(tested), state(before)),
      false,
      "Talking is not a meaningful revision",
    );
    const forged = {
      ...initialMission(slug),
      phase: "UPDATED" as const,
      tests: done.tests,
      baseline: done.baseline,
    };
    const safe = await applyMission(
      slug,
      state(forged),
      state(start),
      undefined,
    );
    assert.equal(safe.phase, "INITIAL");
    assert.deepEqual(safe.tests, []);
  });
}
test("Fairness Twin: фрагменты и текст не называются изменением оценки", () => {
  const c: TwinComparison = {
    state: "DIFFERENT",
    reasons: [],
    domains: [
      {
        domain: "Опыт",
        changes: ["Использованные основания"],
        episodes: [1, 1],
        grounds: [1, 2],
      },
    ],
    actionChanged: false,
    textsChanged: false,
  };
  assert.equal(twinSummary(c), "Изменились основания. Оценки сохранились");
  c.domains[0].changes.push("Оценка области");
  assert.equal(twinSummary(c), "Изменились оценки областей");
  c.state = "INCOMPLETE";
  assert.equal(twinSummary(c), "Сравнение не завершено");
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
    if (r.headers.get("set-cookie"))
      this.cookie = r.headers.get("set-cookie")!.split(";")[0];
    const result = await r.json();
    assert.equal(r.status, status, JSON.stringify(result));
    return result.data;
  }
}
test(
  "Новые миссии: сохранение всех пяти, возобновление, защита команд, повтор, перенос и неизменяемая передача",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient(),
      guest = new Session(),
      stranger = new Session(),
      email = `missions-${Date.now()}@qa.local`;
    let owner = "";
    try {
      await guest.call("project.progress");
      let digital;
      for (const slug of Object.keys(missions)) {
        const start = prepared(slug),
          key = randomUUID();
        const request = {
          slug,
          state: state(start),
          revision: 0,
          missionCommand: { kind: "test" },
          requestKey: key,
        };
        const first = await guest.call("project.save", request);
        const attempt = await db.projectAttempt.findUniqueOrThrow({
          where: { id: first.id },
        });
        owner = attempt.userId;
        assert.equal(attempt.configVersion, 3);
        assert.equal(first.versions[0].completed, false);
        const repeated = await guest.call("project.save", request);
        assert.equal(first.id, repeated.id);
        assert.equal(repeated.versions.length, 2);
        const progress = await guest.call("project.progress");
        assert.deepEqual(
          progress.attempts.find((a: { id: string }) => a.id === first.id)
            .state,
          first.state,
        );
        const reveal = await guest.call("project.save", {
          id: first.id,
          slug,
          state: first.state,
          revision: 1,
          missionCommand: { kind: "reveal" },
          requestKey: randomUUID(),
        });
        const withPlan = readMission(reveal.state)!;
        withPlan.plan = prepared(slug, true).plan;
        const save = {
          id: first.id,
          slug,
          state: state(withPlan),
          revision: 2,
          missionCommand: { kind: "test" },
          requestKey: randomUUID(),
        };
        const results = await Promise.all([
          guest.call("project.save", save),
          guest.call("project.save", save),
        ]);
        assert.ok(results.every((r) => r.revision === 3));
        const done = results[0];
        assert.equal(done.versions[0].completed, true);
        await guest.call(
          "project.save",
          { ...save, requestKey: randomUUID() },
          409,
        );
        await stranger.call(
          "project.save",
          { ...save, requestKey: randomUUID() },
          404,
        );
        const rebound = await guest.call("project.save", request);
        assert.equal(
          rebound.revision,
          3,
          "Lost first response cannot overwrite latest work",
        );
        if (slug === "digital-products") digital = done;
      }
      const before = (await guest.call("project.progress")).milestones;
      await guest.call("register", {
        email,
        name: "Новая История Миссий",
        password: "MissionPath2026!",
      });
      await db.user.update({ where: { id: owner }, data: { origin: "QA" } });
      assert.deepEqual(
        (await guest.call("project.progress")).milestones,
        before,
      );
      assert.equal(
        new Set(before.map((m: { key: string }) => m.key)).size,
        before.length,
      );
      assert.deepEqual(
        (await db.user.findUniqueOrThrow({ where: { id: owner } })).interests,
        [],
      );
      const app = await guest.call("application.save", {
        programSlug: "digital-products",
        fields: emptyFields,
      });
      await db.application.update({
        where: { id: app.id },
        data: { origin: "QA" },
      });
      const transfer = await guest.call("work.transfer", {
        attemptId: digital.id,
        revision: 3,
        consent: true,
      });
      assert.equal(transfer.snapshot.state.mission.version, 2);
      assert.match(transfer.snapshot.conditions, /Учебная миссия/);
      const snapshot = JSON.stringify(transfer.snapshot);
      const next = readMission(digital.state)!;
      next.plan.choices.handoff = "meeting";
      await guest.call("project.save", {
        id: digital.id,
        slug: "digital-products",
        revision: 3,
        state: state(next),
        requestKey: randomUUID(),
      });
      const explained = await guest.call("profile.ask", {
        topic: "changes",
        scope: { attemptId: digital.id, revision: 4 },
        question: "Что изменилось?",
        requestKey: randomUUID(),
      });
      assert.ok(
        explained.answer.claims.some((c: { text: string }) =>
          c.text.includes("Способ передачи. Было:"),
        ),
      );
      assert.ok(
        explained.answer.claims.some((c: { text: string }) =>
          c.text.includes("Было:\n"),
        ),
      );
      assert.equal(
        JSON.stringify(
          (
            await db.workTransfer.findUniqueOrThrow({
              where: { id: transfer.id },
            })
          ).snapshot,
        ),
        snapshot,
      );
      assert.equal(
        await db.assessment.count({ where: { applicationId: app.id } }),
        0,
      );
      assert.equal(
        await db.decision.count({ where: { applicationId: app.id } }),
        0,
      );
      const parent = digital.versions.find(
        (v: { revision: number }) => v.revision === 3,
      );
      const context = await guest.call("project.context", {
        versionId: parent.id,
      });
      assert.ok(context.id);
      await guest.call(
        "project.save",
        {
          id: digital.id,
          slug: "digital-products",
          revision: 4,
          state: initialState,
        },
        409,
      );
    } finally {
      await cleanupRun(db, [email]);
      if (owner) {
        const u = await db.user.findUnique({ where: { id: owner } });
        if (u?.role === "GUEST") {
          await db.projectAttempt.deleteMany({ where: { userId: owner } });
          await db.user.delete({ where: { id: owner } });
        }
      }
      await db.$disconnect();
    }
  },
);

test("Пять миссий допускают альтернативные решения, а перегрузка поручений меняет ответ команды", async () => {
  for (const slug of Object.keys(missions)) {
    const m = prepared(slug, true);
    if (slug === "digital-products")
      Object.assign(m.plan.choices, {
        feature: "requests",
        fallback: "alternatives",
        handoff: "meeting",
      });
    if (slug === "creative-engineering")
      Object.assign(m.plan.choices, { chassis: "cargo", trips: "one" });
    if (slug === "digital-media") {
      m.plan.choices.number = "unique";
      m.plan.sequence.reverse();
    }
    if (slug === "sociology")
      Object.assign(m.plan.choices, {
        hypothesis: "roles",
        sample: "compare",
        method: "pilot",
      });
    if (slug === "public-policy") {
      m.plan.choices.priority = "depth";
      m.plan.allocations = [0, 3, 2];
    }
    assert.ok(
      missionChecks(m).every((c) => c.passed),
      slug,
    );
  }
  const m = prepared("creative-engineering"),
    d = missions[m.slug];
  m.plan.assignments[d.tasks[1].id] = d.team[0].id;
  const response = await applyMission(
    m.slug,
    state(m),
    state(initialMission(m.slug)),
    { kind: "assign", role: d.team[0].id },
  );
  assert.match(response.conversations[0].text, /Всё не помещается/);
  assert.equal(
    missionChecks(response).find((c) => c.label === "План команды")?.passed,
    false,
  );
});
