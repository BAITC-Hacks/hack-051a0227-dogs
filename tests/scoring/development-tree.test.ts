import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { skillBranches, skillDomains, skillNodes } from "../../src/lib/skill-tree-catalog";
import { mapDevelopmentProfile } from "../../src/lib/skill-tree.server";
import { cleanupRun } from "../cleanup";
import { grantQaAccess } from "../qa-access";

const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const db = new PrismaClient();
class Session {
  cookie = "";
  async call(type: string, data: Record<string, unknown> = {}, status = 200) {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: this.cookie },
      body: JSON.stringify({ type, ...data }),
    });
    if (r.headers.get("set-cookie")) this.cookie = r.headers.get("set-cookie")!.split(";")[0];
    const payload = await r.json();
    assert.equal(r.status, status, `${type}: ${JSON.stringify(payload)}`);
    return payload.data;
  }
}

test("Четыре направления содержат 32 учебных шага и одну World mission", () => {
  assert.deepEqual(skillDomains.map((d) => d.id), ["LEADERSHIP", "TEAMWORK", "COMMUNICATION", "ENGLISH"]);
  assert.equal(skillNodes.length, 33);
  assert.equal(new Set(skillNodes.map((n) => n.id)).size, 33);
  assert.deepEqual(new Set(skillNodes.map((n) => n.type)), new Set([
    "VIDEO", "READING", "QUIZ", "BRANCHING_SCENARIO", "REFLECTION",
    "TEXT_RESPONSE", "AUDIO_RESPONSE", "SORTING", "DIALOGUE", "SUBMISSION", "WORLD_MISSION",
  ]));
  for (const domain of skillDomains) {
    const nodes = skillNodes.filter((n) => n.domain === domain.id);
    assert.equal(nodes.length, domain.id === "LEADERSHIP" ? 9 : 8);
    assert.deepEqual(new Set(nodes.map((n) => n.branch)), new Set(skillBranches[domain.id]));
    for (const node of nodes) for (const required of node.prerequisites)
      assert.ok(skillNodes.some((n) => n.id === required && n.domain === domain.id && n.tier < node.tier), `${node.id}: ${required}`);
  }
  assert.equal(mapDevelopmentProfile({}).priorities.LEADERSHIP, "unknown");
  assert.equal(mapDevelopmentProfile({}).priorities.ENGLISH, "unknown");
});

test("Личное дерево: права, зависимости, один U за узел и отсутствие записи в admission", { timeout: 120000 }, async () => {
  const email = `skill-${randomUUID()}@qa.local`;
  const candidate = new Session(), staff = new Session();
  let userId = "";
  try {
    await candidate.call("register", { email, name: "Кандидат дерева", password: "SkillTree2026!" });
    userId = (await db.user.update({ where: { email }, data: { origin: "QA" } })).id;
    await candidate.call("skill.view", {}, 403);
    await grantQaAccess(db, email);
    const first = await candidate.call("skill.view") as { balance: number; nodes: { id: string; state: string }[] };
    assert.equal(first.balance, 0);
    assert.equal(first.nodes.find((n) => n.id === "l-choice")?.state, "available");
    assert.equal(first.nodes.find((n) => n.id === "l-delegate")?.state, "locked");
    await candidate.call("skill.complete", { nodeId: "l-delegate", response: { order: ["critical", "assign", "check"] }, requestKey: randomUUID() }, 409);
    const firstKey = randomUUID();
    const firstResponse = { choice: "steady", followup: "fallback" };
    const completed = await candidate.call("skill.complete", { nodeId: "l-choice", response: firstResponse, requestKey: firstKey }) as { earned: number };
    assert.equal(completed.earned, 30);
    await candidate.call("skill.complete", { nodeId: "l-choice", response: firstResponse, requestKey: firstKey });
    const retried = await candidate.call("skill.complete", { nodeId: "l-choice", response: firstResponse, requestKey: randomUUID() }) as { earned: number };
    assert.equal(retried.earned, 0);
    const sorted = await candidate.call("skill.complete", { nodeId: "l-delegate", response: { order: ["critical", "assign", "check"] }, requestKey: randomUUID() }) as { earned: number };
    assert.equal(sorted.earned, 20);
    const latest = await candidate.call("skill.view") as { balance: number; nodes: { id: string; state: string }[] };
    assert.equal(latest.balance, 50);
    assert.equal(latest.nodes.find((n) => n.id === "l-open")?.state, "available");
    assert.equal((await db.uPointEntry.findMany({ where: { userId } })).length, 2);
    assert.equal(await db.scoringRun.count({ where: { application: { userId } } }), 0);
    assert.equal(await db.assessment.count({ where: { application: { userId } } }), 0);
    await staff.call("login", { identifier: "admissions@invision.local", password: "LeaderDesk2026!" });
    await staff.call("skill.view", {}, 403);
    await candidate.call("logout");
    await candidate.call("skill.view", {}, 401);
  } finally {
    if (userId) await cleanupRun(db, [email]);
    await db.$disconnect();
  }
});
