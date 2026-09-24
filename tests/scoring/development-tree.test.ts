import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { initialMission, missions, type Mission } from "../../src/lib/missions";
import { initialState } from "../../src/lib/projects";
import { treeNodes, nodeEvidence } from "../../src/lib/development-tree";
import { treeView } from "../../src/lib/development-tree.server";
import {
  resourceSchema,
  initialCatalog,
} from "../../src/lib/learning-resources";
import { catalogKey } from "../../src/lib/learning-resources.server";
import { collectProfile } from "../../src/lib/profile-context.server";
import { equipmentInitial } from "../../src/lib/equipment";
import type { Work } from "../../src/lib/journey";
import { cleanupRun } from "../cleanup";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const db = new PrismaClient();
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
function plan(slug: string) {
  const m = initialMission(slug);
  m.plan.explanation =
    "Оставляю наблюдаемое ограничение явным и выбираю небольшую проверку.";
  m.plan.verification =
    "Сравню результат со сформулированным условием упражнения, а затем сохраню вывод.";
  missions[slug].tasks.forEach(
    (t, i) => (m.plan.assignments[t.id] = missions[slug].team[i].id),
  );
  if (slug === "digital-products") m.plan.choices.fallback = "queue";
  if (slug === "sociology")
    Object.assign(m.plan.choices, { sample: "missing", hypothesis: "mixed" });
  return m;
}
test("Дерево: пустое действие не подтверждает практику, ресурсы имеют проверяемые поля", () => {
  assert.equal(treeNodes.length, 15);
  assert.equal(new Set(treeNodes.map((n) => n.branch)).size, 5);
  for (const n of treeNodes) {
    const state = { ...initialState, mission: initialMission(n.slug) };
    const w = {
      slug: n.slug,
      context: "WORKSHOP",
      versions: [{ revision: 1, state, completed: false, ruleVersion: 3 }],
    } as unknown as Work;
    assert.equal(nodeEvidence(n, w), undefined, n.id);
  }
  for (const r of initialCatalog.records)
    assert.equal(resourceSchema.safeParse(r.versions[0]).success, true, r.id);
  assert.equal(
    resourceSchema.safeParse({
      ...initialCatalog.records[0].versions[0],
      url: "https://invision-other.example/course",
    }).success,
    false,
  );
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://127.0.0.1/file",
    "https://user:pass@example.com",
  ])
    assert.equal(
      resourceSchema.safeParse({
        ...initialCatalog.records[3].versions[0],
        url,
      }).success,
      false,
    );
  assert.equal(
    resourceSchema.safeParse({
      ...initialCatalog.records[3].versions[0],
      type: "VIDEO",
      embedding: "YOUTUBE",
      embedUrl: "https://evil.example/embed/id",
    }).success,
    false,
  );
});
test("Две ветки, приватность, версии каталога и перенос гостя", async (t) => {
  const run = randomUUID(),
    email = `tree-${run}@qa.local`,
    secondEmail = `tree-other-${run}@qa.local`;
  const guest = new Session(),
    other = new Session(),
    staff = new Session();
  const previousCatalog = await db.setting.findUnique({
    where: { key: catalogKey },
  });
  const callsBefore = await db.openAICall.count();
  let ownerId = "",
    digitalId = "",
    digitalRev = 0;
  let digital: Mission;
  async function view() {
    return guest.call("tree.view") as Promise<
      Awaited<ReturnType<typeof treeView>>
    >;
  }
  async function node(id: string) {
    return (await view()).nodes.find((n) => n.id === id)!;
  }
  async function start(id: string) {
    await guest.call("tree.start", { nodeId: id });
    return node(id);
  }
  async function save(
    id: string,
    slug: string,
    m: Mission,
    revision: number,
    command?: unknown,
  ) {
    return guest.call("project.save", {
      id,
      slug,
      state: { ...initialState, mission: m },
      revision,
      requestKey: randomUUID(),
      missionCommand: command,
    });
  }
  try {
    await t.test(
      "Просмотр и самоотметка отделены от практики, старт идемпотентен",
      async () => {
        const initial = await view();
        assert.ok(initial.nodes.every((n) => n.status === "AVAILABLE"));
        await Promise.all([
          guest.call("tree.start", { nodeId: "listen" }),
          guest.call("tree.start", { nodeId: "listen" }),
        ]);
        let n = await node("listen");
        assert.equal(n.status, "STARTED");
        await guest.call(
          "tree.study",
          {
            nodeId: n.id,
            revision: n.step!.revision,
            note: "Хочу услышать ограничения двух участников.",
          },
          409,
        );
        const opened = await guest.call("tree.open", {
          nodeId: n.id,
          revision: n.step!.revision,
        });
        assert.equal(opened.href, initialCatalog.records[3].versions[0].url);
        n = await node("listen");
        assert.equal(n.status, "STARTED");
        await guest.call("tree.study", {
          nodeId: n.id,
          revision: n.step!.revision,
          note: "Хочу услышать ограничения двух участников.",
        });
        await guest.call(
          "tree.study",
          {
            nodeId: n.id,
            revision: n.step!.revision,
            note: "Этот конфликт не должен потерять сохранённый текст.",
          },
          409,
        );
        n = await node("listen");
        assert.equal(n.status, "STUDIED");
        assert.ok(n.evidence == null);
        await guest.call("register", {
          email,
          password: "TreePractice2026!",
          name: "Тест маршрута",
        });
        const owner = await db.user.update({
          where: { email },
          data: { origin: "QA" },
        });
        ownerId = owner.id;
        assert.equal(
          await db.developmentStep.count({
            where: { userId: ownerId, treeNode: "listen" },
          }),
          1,
        );
        assert.equal((await node("listen")).status, "STUDIED");
      },
    );
    await t.test(
      "Работа с людьми: ответы, посильные поручения, реакция после изменения",
      async () => {
        const a = await guest.call("tree.practice", { nodeId: "listen" });
        digitalId = new URL(a.href, origin).searchParams.get("attempt")!;
        const repeated = await guest.call("tree.practice", {
          nodeId: "listen",
        });
        assert.equal(a.href, repeated.href);
        digital = plan("digital-products");
        digitalRev = 1;
        for (const role of missions["digital-products"].team.slice(0, 2)) {
          const r = await save(
            digitalId,
            "digital-products",
            digital,
            digitalRev,
            { kind: "ask", role: role.id },
          );
          digital = r.state.mission;
          digitalRev = r.revision;
        }
        assert.equal((await node("listen")).status, "PRACTICED");
        await start("delegate");
        await guest.call("tree.practice", {
          nodeId: "delegate",
          attemptId: digitalId,
        });
        assert.equal((await node("delegate")).status, "PRACTICED");
        await start("respond");
        await guest.call("tree.practice", {
          nodeId: "respond",
          attemptId: digitalId,
        });
        assert.equal((await node("respond")).status, "STARTED");
        for (const cmd of [
          { kind: "test" },
          { kind: "reveal" },
          { kind: "ask", role: missions["digital-products"].team[0].id },
          { kind: "test" },
        ]) {
          const r = await save(
            digitalId,
            "digital-products",
            digital,
            digitalRev,
            cmd,
          );
          digital = r.state.mission;
          digitalRev = r.revision;
        }
        assert.equal((await node("respond")).status, "PRACTICED");
        assert.ok(
          (await view()).nodes
            .filter((n) => n.branch === "people")
            .every((n) => n.evidence?.href.includes(digitalId)),
        );
      },
    );
    await t.test(
      "Проверка идей: собственная гипотеза, проверка, отдельный контекст",
      async () => {
        await start("hypothesis");
        const r = await guest.call("tree.practice", { nodeId: "hypothesis" });
        const id = new URL(r.href, origin).searchParams.get("attempt")!;
        await save(id, "sociology", plan("sociology"), 1);
        assert.equal((await node("hypothesis")).status, "PRACTICED");
        await start("test");
        await guest.call("tree.practice", {
          nodeId: "test",
          attemptId: digitalId,
        });
        assert.equal((await node("test")).status, "PRACTICED");
        await start("context");
        const c = await guest.call("tree.practice", {
          nodeId: "context",
          attemptId: digitalId,
        });
        const cid = new URL(c.href, origin).searchParams.get("attempt")!;
        const state = {
          ...equipmentInitial,
          screens: ["equipment", "availability", "contact", "confirm"],
          requiredPhone: false,
          unavailable: "alternatives",
          reservationDetails: true,
        };
        await guest.call("project.save", {
          id: cid,
          slug: "digital-products",
          state,
          revision: 0,
          requestKey: randomUUID(),
        });
        assert.equal((await node("context")).status, "APPLIED");
        assert.equal(
          (
            await db.projectAttempt.findUniqueOrThrow({
              where: { id: digitalId },
            })
          ).revision,
          digitalRev,
        );
      },
    );
    await t.test(
      "Рекомендации используют каталог и свою работу; не меняют приём",
      async () => {
        const explanation = await guest.call("tree.explain", {
          nodeId: "respond",
        });
        assert.ok(explanation.text.includes("После изучения"));
        assert.ok(explanation.sourceIds[0].includes("practice-tree-v1"));
        assert.equal(
          await db.application.count({ where: { userId: ownerId } }),
          0,
        );
        const owner = await db.user.findUniqueOrThrow({
          where: { id: ownerId },
        });
        assert.equal(owner.interests.length, 0);
        const profile = await collectProfile(owner, {});
        assert.ok(
          !JSON.stringify(profile).includes("Хочу услышать ограничения"),
        );
      },
    );
    await t.test(
      "Чужая работа, личное дерево сотруднику и публикация кандидатом запрещены",
      async () => {
        await other.call("register", {
          email: secondEmail,
          password: "TreePractice2026!",
          name: "Другой",
        });
        await db.user.update({
          where: { email: secondEmail },
          data: { origin: "QA" },
        });
        await other.call("tree.start", { nodeId: "listen" });
        await other.call(
          "tree.practice",
          { nodeId: "listen", attemptId: digitalId },
          404,
        );
        await other.call(
          "resource.save",
          {
            resource: initialCatalog.records[0].versions[0],
            revision: 1,
            verified: true,
          },
          403,
        );
        await staff.call("login", {
          email: "admissions@invision.local",
          password: "LeaderDesk2026!",
        });
        await staff.call("tree.view", { userId: ownerId }, 403);
        assert.ok(
          !(await other.call("tree.view", { userId: ownerId })).nodes.some(
            (n: { work?: unknown }) => n.work,
          ),
        );
      },
    );
    await t.test(
      "Изменение/недоступность ресурса сохраняют историю, без обязательного тупика",
      async () => {
        const n = await node("listen");
        const catalog = previousCatalog?.value as unknown as
          typeof initialCatalog | undefined;
        const c = catalog ?? initialCatalog;
        const old = c.records
          .find((r) => r.id === "leadership")!
          .versions.at(-1)!;
        await staff.call("resource.save", {
          id: "leadership",
          revision: c.revision,
          resource: {
            ...old,
            description:
              "Обновлённое проверенное описание руководства и его учебного применения.",
          },
          verified: true,
        });
        let next = await node("listen");
        assert.equal(next.resource?.version, n.resource?.version);
        assert.equal(next.resourceUpdated, true);
        await guest.call("tree.resource", {
          nodeId: "listen",
          revision: next.step!.revision,
        });
        next = await node("listen");
        assert.equal(next.step!.state.studiedAt, undefined);
        assert.ok(
          next.step!.state.events.some((e) => e.kind === "STUDY_SELF_REPORTED"),
        );
        await staff.call("resource.save", {
          id: "leadership",
          revision: c.revision + 1,
          resource: { ...old, type: "VIDEO", available: false },
          verified: true,
        });
        next = await node("listen");
        assert.equal(next.resource, null);
        assert.equal(next.status, "PRACTICED");
        await guest.call(
          "tree.open",
          { nodeId: "listen", revision: next.step!.revision },
          409,
        );
        const explanation = await guest.call("tree.explain", {
          nodeId: "listen",
        });
        assert.equal(explanation.resource, null);
        assert.ok(!explanation.text.includes(old.url));
        assert.ok(
          (
            await guest.call("tree.practice", { nodeId: "listen" })
          ).href.includes(digitalId),
        );
      },
    );
    await t.test(
      "Удалённая работа не читается через маршрут, при смене пользователя нет буфера",
      async () => {
        await db.projectAttempt.deleteMany({ where: { userId: ownerId } });
        const next = await node("listen");
        assert.ok(next.work == null);
        assert.ok(next.evidence == null);
        assert.equal(next.workUnavailable, true);
        await guest.call("tree.practice", { nodeId: "listen" }, 409);
        await guest.call("logout");
        await guest.call("login", {
          email: secondEmail,
          password: "TreePractice2026!",
        });
        const v = await view();
        assert.ok(!JSON.stringify(v).includes("Хочу услышать ограничения"));
      },
    );
    await t.test(
      "Вход в существующий аккаунт сохраняет время шага и обе истории",
      async () => {
        const incoming = new Session();
        await incoming.call("tree.start", { nodeId: "listen" });
        const before = (await incoming.call("tree.view")).nodes.find(
          (n: { id: string }) => n.id === "listen",
        ).step;
        await incoming.call("login", {
          email: secondEmail,
          password: "TreePractice2026!",
        });
        const after = (await incoming.call("tree.view")).nodes.find(
          (n: { id: string }) => n.id === "listen",
        ).step;
        assert.equal(after.id, before.id);
        assert.equal(after.updatedAt, before.updatedAt);
        assert.equal(
          await db.developmentStep.count({
            where: { user: { email: secondEmail }, treeNode: "listen" },
          }),
          2,
        );
        await incoming.call("login", {
          email: secondEmail,
          password: "TreePractice2026!",
        });
        assert.equal(
          await db.developmentStep.count({
            where: { user: { email: secondEmail }, treeNode: "listen" },
          }),
          2,
        );
      },
    );
    assert.equal(
      await db.openAICall.count(),
      callsBefore,
      "Tree never dispatches paid calls",
    );
  } finally {
    if (previousCatalog)
      await db.setting.update({
        where: { key: catalogKey },
        data: { value: previousCatalog.value! },
      });
    else await db.setting.deleteMany({ where: { key: catalogKey } });
    await cleanupRun(db, [email, secondEmail]);
    await db.$disconnect();
  }
});
