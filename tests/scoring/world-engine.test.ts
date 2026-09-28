import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  applyWorldEvent,
  initialWorldState,
  objective,
  points,
  safePosition,
} from "../../src/lib/world/model";
import { dialogueFor } from "../../src/lib/world/dialogues";
import { grantQaAccess } from "../qa-access";
import { cleanupRun } from "../cleanup";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const db = new PrismaClient();
class Session {
  cookie = "";
  async call(type: string, data: Record<string, unknown> = {}, expected = 200) {
    const response = await fetch(
      origin + "/api/" + (type.startsWith("world.") ? "world" : "action"),
      {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: this.cookie,
        },
        body: JSON.stringify({ type, ...data }),
      },
    );
    if (response.headers.get("set-cookie"))
      this.cookie = response.headers.get("set-cookie")!.split(";")[0];
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload.data;
  }
}
test("Квест проходит через осмотр, встречи, предмет, три варианта и завершение без скрытой оценки", () => {
  for (const choice of ["repair", "delegate", "relocate"] as const) {
    let s = initialWorldState();
    assert.equal(objective(s), "Найди координатора Санию на площади");
    assert.throws(() => applyWorldEvent(s, "crate"));
    for (const kind of [
      "coordinator",
      "board",
      "aruzhan",
      "timur",
      "crate",
      "display",
    ] as const)
      s = applyWorldEvent(s, kind);
    assert.deepEqual(s.items, ["materials"]);
    assert.throws(() => applyWorldEvent(s, "deliver"));
    s = applyWorldEvent(s, "choose", choice);
    assert.equal(s.flags.choice, choice);
    s = applyWorldEvent(s, "deliver");
    assert.deepEqual(s.items, []);
    s = applyWorldEvent(s, "finish");
    assert.equal(s.flags.completed, true);
    assert.equal(objective(s), "Исследуй Campus Square");
  }
  assert.deepEqual(safePosition("square", 42 * 32, 26 * 32), {
    x: 25 * 32 + 16,
    y: 27 * 32 + 16,
  });
  assert.deepEqual(safePosition("square", -1, 500), {
    x: 25 * 32 + 16,
    y: 27 * 32 + 16,
  });
  assert.match(
    dialogueFor("timur", "Тимур", {
      ...initialWorldState(),
      flags: { ...initialWorldState().flags, choice: "repair" },
    }).pages[0],
    /вернули экран/,
  );
});
test(
  "World API: полный доступ, ревизия, однократный U и граница комиссии",
  { timeout: 120000 },
  async () => {
    const email = "world-" + randomUUID() + "@qa.local",
      candidate = new Session(),
      staff = new Session();
    let userId = "";
    try {
      await candidate.call("register", {
        email,
        name: "Игрок QA",
        password: "WorldTest2026!",
      });
      userId = (
        await db.user.update({ where: { email }, data: { origin: "QA" } })
      ).id;
      await candidate.call("world.get", {}, 403);
      await grantQaAccess(db, email);
      const first = (await candidate.call("world.get")) as {
        state: ReturnType<typeof initialWorldState>;
        revision: number;
        points: number;
      };
      assert.equal(first.state.scene, "square");
      assert.equal(first.points, 0);
      await candidate.call(
        "world.move",
        { revision: first.revision, scene: "square", x: 99999, y: 99999 },
        400,
      );
      await candidate.call(
        "world.move",
        {
          revision: first.revision,
          scene: "square",
          x: first.state.x,
          y: first.state.y,
        },
        200,
      );
      await candidate.call(
        "world.move",
        {
          revision: first.revision,
          scene: "square",
          x: first.state.x,
          y: first.state.y,
        },
        409,
      );
      const finish = initialWorldState();
      finish.flags = {
        coordinator: true,
        board: true,
        talks: ["amir", "dana"],
        crate: true,
        display: true,
        choice: "delegate",
        delivered: true,
        completed: false,
        cafeVisited: false,
      };
      finish.x = points.finish.x;
      finish.y = points.finish.y;
      const current = await db.worldSave.update({
        where: { userId },
        data: {
          state: finish as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      const key = randomUUID();
      const done = (await candidate.call("world.event", {
        revision: current.revision,
        kind: "finish",
        eventKey: key,
      })) as { state: typeof finish; revision: number };
      assert.equal(done.state.flags.completed, true);
      await candidate.call("world.event", {
        revision: done.revision,
        kind: "finish",
        eventKey: key,
      });
      await candidate.call("world.event", {
        revision: done.revision,
        kind: "finish",
        eventKey: randomUUID(),
      });
      assert.equal(
        await db.uPointEntry.count({ where: { userId, source: "WORLD" } }),
        1,
      );
      assert.equal(
        ((await candidate.call("world.get")) as { points: number }).points,
        60,
      );
      const tree = (await candidate.call("skill.view")) as {
        nodes: { id: string; state: string }[];
        balance: number;
      };
      assert.equal(
        tree.nodes.find((n) => n.id === "world-before-opening")?.state,
        "completed",
      );
      assert.equal(tree.balance, 60);
      await candidate.call(
        "skill.complete",
        {
          nodeId: "world-before-opening",
          response: {},
          requestKey: randomUUID(),
        },
        409,
      );
      assert.equal(
        await db.scoringRun.count({ where: { application: { userId } } }),
        0,
      );
      assert.equal(
        await db.assessment.count({ where: { application: { userId } } }),
        0,
      );
      await staff.call("login", {
        identifier: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      await staff.call("world.get", {}, 403);
      await candidate.call("logout");
      await candidate.call("world.get", {}, 401);
    } finally {
      if (userId) await cleanupRun(db, [email]);
      await db.$disconnect();
    }
  },
);
