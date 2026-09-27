import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { cleanupRun } from "./cleanup";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3110";
class Client {
  cookies = new Map<string, string>();
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async action(
    type: string,
    data: Record<string, unknown> = {},
    expected = 200,
  ) {
    const response = await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: this.header(),
      },
      body: JSON.stringify({ type, ...data }),
    });
    for (const entry of response.headers.getSetCookie()) {
      const [key, value] = entry.split(";", 1)[0].split("=");
      if (/max-age=0/i.test(entry) || !value) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      `${type}: ${JSON.stringify(payload)}`,
    );
    return payload.data;
  }
  async route(path: string) {
    return fetch(`${origin}${path}`, {
      headers: { Cookie: this.header() },
      redirect: "manual",
    });
  }
  async redirected(path: string) {
    const response = await this.route(path);
    return `${response.headers.get("location") ?? ""} ${await response.text()}`;
  }
}

test(
  "Этап 2: гостевой лендинг, черновик, выданный доступ, отзыв и идентификаторы входа",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient();
    const email = `access-${randomUUID()}@qa.local`;
    const password = "AccessCandidate2026!";
    const guest = new Client(),
      candidate = new Client(),
      staff = new Client(),
      byPhone = new Client(),
      byId = new Client();
    try {
      assert.equal((await guest.route("/")).status, 200);
      assert.match(await (await guest.route("/")).text(), /Твоё поступление/);
      assert.match(
        await guest.redirected("/world"),
        /\/login\?next=(?:%2F|\/)world/,
      );
      await candidate.action("register", {
        email,
        name: "Кандидат Проверки",
        password,
      });
      const user = await db.user.update({
        where: { email },
        data: { origin: "QA" },
      });
      assert.equal(user.emailVerifiedAt, null);
      assert.equal(
        await candidate.action(
          "project.save",
          { slug: "digital-products", state: {} },
          403,
        ),
        undefined,
      );
      assert.match(
        await candidate.redirected("/world"),
        /NEXT_REDIRECT;replace;\/apply/,
      );
      assert.match(
        await candidate.redirected("/my?view=route"),
        /NEXT_REDIRECT;replace;\/apply/,
      );
      assert.match(await candidate.redirected("/"), /\/apply/);
      await candidate.action(
        "access.grant",
        {
          userId: user.id,
          confirmName: user.name,
          reason: "Попытка самостоятельной выдачи доступа",
        },
        403,
      );
      await staff.action("login", {
        identifier: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      await staff.action("access.grant", {
        userId: user.id,
        confirmName: user.name,
        reason: "Университет подтвердил учебный доступ кандидата",
      });
      assert.match(await candidate.redirected("/"), /\/my/);
      assert.equal((await candidate.route("/world")).status, 200);
      await staff.action("access.phone.verify", {
        userId: user.id,
        confirmName: user.name,
        phone: "+7 (701) 234-56-78",
        reason: "Контакт проверен сотрудником по документированному обращению",
      });
      const idLogin = await byId.action("login", {
        identifier: user.id,
        password,
        returnTo: "https://untrusted.example/world",
      });
      assert.equal(idLogin.destination, "/my");
      const phoneLogin = await byPhone.action("login", {
        identifier: "+77012345678",
        password,
        returnTo: "/world",
      });
      assert.equal(phoneLogin.destination, "/world");
      await new Client().action(
        "login",
        { identifier: user.id, password: "WrongPassword2026!" },
        401,
      );
      await new Client().action(
        "login",
        { identifier: "absent@example.org", password: "WrongPassword2026!" },
        401,
      );
      await staff.action("access.revoke", {
        grantId: (
          await db.candidateAccessGrant.findFirstOrThrow({
            where: { userId: user.id },
          })
        ).id,
      });
      assert.match(await candidate.redirected("/"), /\/apply/);
      assert.match(await byPhone.redirected("/world"), /\/apply/);
      await staff.action("access.phone.revoke", {
        userId: user.id,
        confirmName: user.name,
        reason: "Контактная привязка отозвана по запросу владельца",
      });
      await new Client().action(
        "login",
        { identifier: "+77012345678", password },
        401,
      );
      assert.equal((await byId.route("/apply")).status, 200);
    } finally {
      await db.webAuthnChallenge.deleteMany({
        where: { userId: (await db.user.findUnique({ where: { email } }))?.id },
      });
      await cleanupRun(db, [email]);
      await db.$disconnect();
    }
  },
);

test(
  "Passkey: запрос ограничен сессией, целью и временем, повтор и подмена credential закрыты",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient();
    const email = `passkey-${randomUUID()}@qa.local`;
    const password = "PasskeyCandidate2026!";
    const candidate = new Client(),
      other = new Client();
    try {
      await candidate.action("register", {
        email,
        name: "Проверка Ключа",
        password,
      });
      const user = await db.user.update({
        where: { email },
        data: { origin: "QA" },
      });
      await candidate.action(
        "passkey.register.begin",
        { password: "WrongPassword2026!" },
        401,
      );
      const options = await candidate.action("passkey.register.begin", {
        password,
      });
      assert.ok(options.challenge);
      assert.equal(
        await db.webAuthnChallenge.count({
          where: { userId: user.id, consumedAt: null },
        }),
        1,
      );
      other.cookies.set(
        "leader_webauthn",
        candidate.cookies.get("leader_webauthn")!,
      );
      await other.action(
        "passkey.register.finish",
        { name: "Чужой ключ", response: { id: "fake" } },
        401,
      );
      await candidate.action(
        "passkey.register.finish",
        { name: "Этот ноутбук", response: { id: "fake" } },
        400,
      );
      assert.equal(
        await db.webAuthnChallenge.count({
          where: { userId: user.id, consumedAt: { not: null } },
        }),
        1,
      );
      const challengeId = (
        await db.webAuthnChallenge.findFirstOrThrow({
          where: { userId: user.id },
        })
      ).id;
      candidate.cookies.set("leader_webauthn", challengeId);
      await candidate.action(
        "passkey.register.finish",
        { name: "Повтор", response: { id: "fake" } },
        409,
      );
      const login = await other.action("passkey.login.begin");
      assert.ok(login.challenge);
      await other.action(
        "passkey.login.finish",
        { response: { id: "foreign" } },
        401,
      );
      other.cookies.set(
        "leader_webauthn",
        (
          await db.webAuthnChallenge.findFirstOrThrow({
            where: { purpose: "LOGIN", challenge: login.challenge },
          })
        ).id,
      );
      await other.action(
        "passkey.login.finish",
        { response: { id: "foreign" } },
        409,
      );
      assert.equal(await db.passkey.count({ where: { userId: user.id } }), 0);
    } finally {
      const user = await db.user.findUnique({ where: { email } });
      if (user)
        await db.webAuthnChallenge.deleteMany({ where: { userId: user.id } });
      await cleanupRun(db, [email]);
      await db.$disconnect();
    }
  },
);
