import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuality } from "../quality/check";
import {
  workflowTime,
  workflowSummary,
  type WorkflowRow,
} from "../../src/lib/workflow-contract";
test(
  "Контроль качества: 12 случаев, отдельные показатели, повреждённые результаты и изолированные сессии",
  { timeout: 120000 },
  async () => {
    process.env.ASSESSMENT_ENVIRONMENT = "isolated-local";
    process.env.ASSESSMENT_PROVIDER = "local";
    process.env.PROFILE_PROVIDER = "local";
    const report = await checkQuality();
    assert.equal(report.cases.length, 12);
    assert.equal(report.externalCalls, 0);
    assert.equal(
      report.metrics.find((m) => m.property === "semantic_support")!
        .denominator,
      0,
    );
    assert.equal(
      report.metrics.find((m) => m.property === "semantic_support")!.result,
      "UNMEASURED",
    );
    assert.equal(
      report.metrics.find((m) => m.property === "negative_controls")!.numerator,
      4,
    );
    assert.deepEqual(
      report.checks.filter((c) => !c.passed),
      [],
    );
  },
);
test("Рабочая сессия: точный расчёт явных пауз и исключение технических проходов", () => {
  const clock = {
    startedAt: "2026-09-18T10:00:00Z",
    pausedAt: "2026-09-18T10:02:00Z",
    pausedMs: 30000,
    completedAt: null,
  };
  assert.deepEqual(workflowTime(clock, Date.parse("2026-09-18T10:03:00Z")), {
    elapsedMs: 180000,
    pausedMs: 90000,
    withoutPausesMs: 90000,
  });
  const rows = [
    { technical: true, status: "COMPLETED" },
    { technical: false, status: "PAUSED" },
  ] as WorkflowRow[];
  const summary = workflowSummary(rows);
  assert.equal(summary.completed, 0);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.technical, 1);
  const completed = {
    technical: false,
    status: "COMPLETED",
    participant: "P01",
    caseKey: "rich",
    caseVersion: "v1",
    materialVersion: "m1",
    mode: "MATERIALS",
    familiar: false,
    elapsedMs: 60000,
    withoutPausesMs: 45000,
    annotations: [
      {
        checked: false,
        correctionCount: 0,
        missedEvidence: [],
        missedQuestions: [],
      },
    ],
  } as unknown as WorkflowRow;
  assert.equal(workflowSummary([completed]).modes[0].annotated, 0);
  completed.annotations[0].checked = true;
  assert.equal(workflowSummary([completed]).modes[0].annotated, 1);
});

test("Рабочая проверка: API закрыт кандидату, базовый режим не передаёт профиль, экспорт защищён", async () => {
  const { randomUUID } = await import("node:crypto");
  const { db } = await import("../../src/lib/db");
  const { tokenHash } = await import("../../src/lib/security");
  const { cleanupRun } = await import("../cleanup");
  const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000",
    emails: string[] = [];
  const actor = async (role: string) => {
    const email = `quality-api-${randomUUID()}@qa.local`;
    emails.push(email);
    const user = await db.user.create({ data: { email, role, origin: "QA" } }),
      token = randomUUID();
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    return `leader_session=${token}`;
  };
  const call = async (cookie: string, body: object, status = 200) => {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    assert.equal(r.status, status, JSON.stringify(result));
    return { r, result };
  };
  try {
    const staff = await actor("STAFF"),
      candidate = await actor("CANDIDATE"),
      other = await actor("STAFF");
    assert.equal((await fetch(origin + "/api/workflow/export")).status, 401);
    assert.equal(
      (
        await fetch(origin + "/api/workflow/export", {
          headers: { Cookie: candidate },
        })
      ).status,
      403,
    );
    const body = {
      type: "workflow.start",
      caseKey: "rich",
      mode: "MATERIALS",
      participant: `api-${randomUUID().slice(0, 8)}`,
      technical: true,
      familiar: false,
      familiarityNote: "Техническая проверка API",
      requestKey: randomUUID(),
    };
    await call(candidate, body, 403);
    const { r, result } = await call(staff, body);
    assert.match(r.headers.get("cache-control")!, /no-store/);
    assert.equal(result.data.profile, null);
    assert.equal(result.data.profileVersion, null);
    assert.ok(!JSON.stringify(result).includes('"summary"'));
    await call(other, { type: "workflow.load", id: result.data.id }, 404);
    await call(staff, { ...body, mode: "PROFILE" }, 409);
    const exported = await fetch(origin + "/api/workflow/export", {
      headers: { Cookie: staff },
    });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("cache-control")!, /no-store/);
    const data = await exported.json();
    assert.ok(
      data.sessions.some(
        (s: { id: string; technical: boolean }) =>
          s.id === result.data.id && s.technical,
      ),
    );
    const denied = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Origin: "http://untrusted.invalid",
        "Content-Type": "application/json",
        Cookie: staff,
      },
      body: JSON.stringify(body),
    });
    assert.equal(denied.status, 403);
  } finally {
    await cleanupRun(db, emails);
  }
});
