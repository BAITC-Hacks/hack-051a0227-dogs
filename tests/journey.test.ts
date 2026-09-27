import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { initialState } from "../src/lib/projects";
import { equipmentInitial } from "../src/lib/equipment";
import {
  sameWorkState,
  workCompleted,
  meaningfullyChanged,
  projectMilestones,
} from "../src/lib/journey";
import { emptyFields, applicationRequirements } from "../src/lib/validation";
import { cleanupRun } from "./cleanup";
import { grantQaAccess } from "./qa-access";
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
const valid = () => ({
  ...structuredClone(initialState),
  screens: ["event", "profile", "confirm"],
  requiredPhone: false,
});
test("Условия достижений: пустое действие, форматирование и заголовок не являются результатом", () => {
  for (const slug of [
    "digital-products",
    "digital-media",
    "creative-engineering",
    "sociology",
    "public-policy",
  ])
    assert.equal(workCompleted(slug, initialState), false);
  assert.equal(workCompleted("digital-products", valid()), true);
  assert.equal(sameWorkState({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }), true);
  assert.equal(sameWorkState({ b: [2, 3] }, { b: [3, 2] }), false);
  assert.equal(
    meaningfullyChanged("digital-media", initialState, {
      ...initialState,
      headline: "Совсем другое название",
    }),
    false,
  );
  assert.equal(
    meaningfullyChanged(
      "sociology",
      { ...initialState, note: "Встреча состоялась." },
      { ...initialState, note: " Встреча   состоялась! " },
    ),
    false,
  );
  assert.equal(
    meaningfullyChanged("digital-products", initialState, valid()),
    true,
  );
  assert.equal(
    workCompleted("digital-products", equipmentInitial, "EQUIPMENT"),
    false,
  );
  assert.ok(
    !applicationRequirements(emptyFields, []).some((x) =>
      /мастерск|исследователь/i.test(x.title),
    ),
  );
});
test(
  "Маршрут: серверные факты, идемпотентность, новый контекст, перенос гостя, права и удаление",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient(),
      guest = new Session(),
      other = new Session(),
      merge = new Session();
    const suffix = Date.now(),
      email = `journey-${suffix}@qa.local`,
      otherEmail = `journey-other-${suffix}@qa.local`;
    const guestIds: string[] = [];
    try {
      await guest.call("project.progress", {}, 401);
      await guest.call(
        "project.save",
        { slug: "digital-products", state: valid() },
        401,
      );
      await guest.call("register", {
        email,
        name: "Проверка Маршрута",
        password: "JourneyCandidate2026!",
      });
      const owner = await grantQaAccess(db, email);
      assert.deepEqual((await guest.call("project.progress")).milestones, []);
      const key = randomUUID();
      const draft = await guest.call("project.save", {
        slug: "digital-products",
        state: initialState,
        requestKey: key,
        earned: true,
      });
      assert.equal(
        (await db.projectAttempt.findUniqueOrThrow({ where: { id: draft.id } }))
          .userId,
        owner,
      );
      assert.equal(draft.milestones.length, 0);
      const repeated = await guest.call("project.save", {
        slug: "digital-products",
        state: initialState,
        requestKey: key,
      });
      assert.equal(repeated.id, draft.id);
      assert.equal(repeated.revision, 1);
      const nextKey = randomUUID();
      const saves = await Promise.all(
        [1, 2].map(() =>
          guest.call("project.save", {
            id: draft.id,
            slug: "digital-products",
            state: valid(),
            revision: 1,
            requestKey: nextKey,
          }),
        ),
      );
      assert.ok(saves.every((x) => x.revision === 2));
      assert.equal(saves[0].versions.length, 3);
      assert.deepEqual(
        saves[0].milestones.map((m: { key: string }) => m.key).sort(),
        ["first", "revision"],
      );
      await guest.call(
        "project.save",
        {
          id: draft.id,
          slug: "digital-products",
          state: { ...valid(), requiredPhone: true },
          revision: 1,
        },
        409,
      );
      const parent = saves[0].versions[0];
      const context = await guest.call("project.context", {
        versionId: parent.id,
      });
      assert.equal(
        (await guest.call("project.context", { versionId: parent.id })).id,
        context.id,
      );
      await guest.call("project.hint", { id: context.id, hint: "occupied" });
      assert.deepEqual(
        (await guest.call("project.hint", { id: context.id, hint: "occupied" }))
          .hintsUsed,
        ["occupied"],
      );
      const booking = {
        screens: ["equipment", "availability", "contact", "confirm"],
        requiredPhone: false,
        unavailable: "alternatives",
        reservationDetails: true,
      };
      const contextSaved = await guest.call("project.save", {
        id: context.id,
        slug: "digital-products",
        revision: 0,
        state: booking,
        requestKey: randomUUID(),
      });
      assert.deepEqual(contextSaved.versions[0].hintsUsed, ["occupied"]);
      assert.ok(
        contextSaved.milestones.some(
          (m: { key: string }) => m.key === "context",
        ),
      );
      assert.ok(
        !contextSaved.milestones.some(
          (m: { key: string }) => m.key === "perspective",
        ),
      );
      assert.deepEqual(
        (
          await db.attemptVersion.findUniqueOrThrow({
            where: { id: parent.id },
          })
        ).feedback,
        parent.feedback,
      );
      assert.equal(
        (
          await db.projectAttempt.findUniqueOrThrow({
            where: { id: context.id },
          })
        ).userId,
        owner,
      );
      assert.deepEqual(
        (await guest.call("project.progress")).milestones,
        contextSaved.milestones,
      );
      assert.deepEqual(
        (await db.user.findUniqueOrThrow({ where: { id: owner } })).interests,
        [],
      );
      await guest.call("application.save", {
        programSlug: "digital-products",
        fields: emptyFields,
      });
      const app = await db.application.findUniqueOrThrow({
        where: { userId: owner },
      });
      await db.application.update({
        where: { id: app.id },
        data: { origin: "QA" },
      });
      await guest.call("interest", {
        slug: "creative-engineering",
        enabled: true,
      });
      assert.equal(
        (await db.application.findUniqueOrThrow({ where: { id: app.id } }))
          .programSlug,
        "digital-products",
      );
      const engineering = {
        ...structuredClone(initialState),
        modules: [
          { kind: "desk", cell: 0 },
          { kind: "power", cell: 1 },
          { kind: "screen", cell: 2 },
        ],
      };
      const second = await guest.call("project.save", {
        slug: "creative-engineering",
        state: engineering,
      });
      assert.equal(second.milestones.length, 4);
      const transfer = await guest.call("work.transfer", {
        attemptId: draft.id,
        revision: 2,
        consent: true,
      });
      assert.ok(!JSON.stringify(transfer.snapshot).includes("milestone"));
      const original = JSON.stringify(transfer.snapshot);
      await guest.call("attempt.interest", { id: draft.id, value: "MORE" });
      await guest.call("project.save", {
        id: draft.id,
        slug: "digital-products",
        revision: 2,
        state: { ...valid(), requiredPhone: true },
      });
      assert.equal(
        JSON.stringify(
          (
            await db.workTransfer.findUniqueOrThrow({
              where: { id: transfer.id },
            })
          ).snapshot,
        ),
        original,
      );
      assert.equal(
        (await db.projectAttempt.findUniqueOrThrow({ where: { id: draft.id } }))
          .interest,
        "UNDECIDED",
      );
      const recovered = await guest.call("project.save", {
        id: draft.id,
        slug: "digital-products",
        revision: 3,
        basedOnRevision: 1,
        state: valid(),
        requestKey: randomUUID(),
      });
      assert.equal(recovered.revision, 4);
      assert.equal(recovered.versions[0].basedOnRevision, 1);
      assert.equal(recovered.versions.length, 5);
      await guest.call(
        "work.transfer",
        { attemptId: draft.id, revision: 0, consent: true },
        400,
      );
      await other.call("register", {
        email: otherEmail,
        name: "Другой Кандидат",
        password: "JourneyCandidate2026!",
      });
      await grantQaAccess(db, otherEmail);
      assert.equal((await other.call("project.progress")).attempts.length, 0);
      await other.call(
        "project.save",
        { id: draft.id, slug: "digital-products", state: valid(), revision: 3 },
        404,
      );
      await other.call("project.context", { versionId: parent.id }, 404);
      await other.call(
        "project.hint",
        { id: context.id, hint: "receipt" },
        404,
      );
      const foreign = await fetch(
        origin + `/projects/digital-products?attempt=${draft.id}`,
        { headers: { Cookie: other.cookie } },
      );
      const foreignPage = await foreign.text();
      assert.match(foreignPage, /Эту страницу не удалось найти/);
      assert.ok(!foreignPage.includes("Твоя сохранённая работа"));
      await other.call(
        "decision",
        {
          applicationId: app.id,
          stage: "FINAL_REVIEW",
          reason: "Не разрешено",
        },
        403,
      );
      const legacyUser = await db.user.create({ data: { origin: "QA" } });
      const mergedOwner = legacyUser.id;
      guestIds.push(mergedOwner);
      const token = randomUUID();
      await db.session.create({
        data: {
          tokenHash: createHash("sha256").update(token).digest("hex"),
          userId: mergedOwner,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      merge.cookie = `leader_session=${token}`;
      const mergedWork = await db.projectAttempt.create({
        data: {
          userId: mergedOwner,
          slug: "digital-products",
          state: valid(),
          revision: 1,
          versions: {
            create: {
              revision: 1,
              state: valid(),
              feedback: {},
              completed: true,
              ruleVersion: 3,
            },
          },
        },
        include: { versions: true },
      });
      const mergedContext = await db.projectAttempt.create({
        data: {
          userId: mergedOwner,
          slug: "digital-products",
          context: "EQUIPMENT",
          parentVersionId: mergedWork.versions[0].id,
          state: equipmentInitial,
        },
      });
      await merge.call("login", { email, password: "JourneyCandidate2026!" });
      assert.equal(
        (
          await db.projectAttempt.findUniqueOrThrow({
            where: { id: mergedContext.id },
          })
        ).userId,
        owner,
      );
      const afterMerge = await merge.call("project.progress");
      assert.equal(afterMerge.milestones.length, 4);
      assert.equal(
        new Set(afterMerge.milestones.map((m: { key: string }) => m.key)).size,
        4,
      );
      await db.projectAttempt.delete({ where: { id: mergedWork.id } });
      assert.equal(
        await db.projectAttempt.count({ where: { id: mergedContext.id } }),
        0,
      );
      await db.workTransfer.deleteMany({ where: { applicationId: app.id } });
      await db.projectAttempt.delete({ where: { id: draft.id } });
      assert.equal(
        await db.projectAttempt.count({ where: { id: context.id } }),
        0,
      );
      const remaining = await db.projectAttempt.findMany({
        where: { userId: owner },
        include: { versions: true },
      });
      const marks = projectMilestones(remaining);
      assert.ok(
        marks.every((m) => remaining.some((a) => a.id === m.attemptId)),
      );
      assert.ok(!marks.some((m) => m.key === "context"));
    } finally {
      await cleanupRun(db, [email, otherEmail]);
      for (const id of guestIds) {
        const u = await db.user.findUnique({ where: { id } });
        if (u?.role === "GUEST") {
          await db.projectAttempt.deleteMany({ where: { userId: id } });
          await db.user.delete({ where: { id } });
        }
      }
      await db.$disconnect();
    }
  },
);
