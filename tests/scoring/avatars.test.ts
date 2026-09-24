import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import {
  prepareAvatar,
  saveAvatar,
  readAvatar,
  avatarLimit,
} from "../../src/lib/avatar.server";
import { db as sharedDb } from "../../src/lib/db";
import { avatarUrl } from "../../src/lib/avatar";
import { tokenHash } from "../../src/lib/security";
import { collectProfile } from "../../src/lib/profile-context.server";
const crop = { x: 0.5, y: 0.5, zoom: 1 };
test("Аватар: декодирование, размер, фактический тип, кадр и удаление метаданных", async () => {
  const original = await sharp({
    create: { width: 640, height: 320, channels: 3, background: "#cced35" },
  })
    .withMetadata({
      exif: { IFD0: { Artist: "PRIVATE ORIGINAL", Copyright: "NEVER SHARE" } },
    })
    .jpeg()
    .toBuffer();
  const image = await prepareAvatar(original, "image/jpeg", {
    x: 1,
    y: 0,
    zoom: 2,
  });
  for (const [bytes, size] of [
    [image.small, 96],
    [image.display, 384],
  ] as const) {
    const m = await sharp(bytes).metadata();
    assert.equal(m.width, size);
    assert.equal(m.height, size);
    assert.equal(m.format, "webp");
    assert.equal(m.exif, undefined);
    assert.equal(m.xmp, undefined);
    assert.equal(m.icc, undefined);
    assert.ok(!bytes.includes(Buffer.from("PRIVATE ORIGINAL")));
  }
  await assert.rejects(prepareAvatar(original, "image/png", crop));
  await assert.rejects(
    prepareAvatar(Buffer.from("<svg/>"), "image/svg+xml", crop),
  );
  await assert.rejects(
    prepareAvatar(Buffer.from("broken"), "image/jpeg", crop),
  );
  await assert.rejects(
    prepareAvatar(Buffer.alloc(avatarLimit + 1), "image/jpeg", crop),
  );
  await assert.rejects(
    prepareAvatar(original, "image/jpeg", { ...crop, zoom: 99 }),
  );
  const tiny = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await assert.rejects(prepareAvatar(tiny, "image/png", crop));
  assert.equal(avatarUrl({}), "/avatars/neutral.svg");
  assert.equal(
    avatarUrl({ avatarCharacter: "../../secret" }),
    "/avatars/neutral.svg",
  );
});
test(
  "Аватар: владелец, защищённый HTTP, замена/удаление, конфликт и отсутствие в AI-контексте",
  { timeout: 60000 },
  async () => {
    const db = new PrismaClient(),
      origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
    const uid = randomUUID(),
      otherId = randomUUID(),
      token = randomUUID();
    try {
      const user = await db.user.create({
        data: {
          id: uid,
          name: "Проверка фото",
          role: "CANDIDATE",
          origin: "QA",
        },
      });
      const other = await db.user.create({
        data: { id: otherId, role: "CANDIDATE", origin: "QA" },
      });
      await db.session.create({
        data: {
          userId: uid,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const original = await sharp({
        create: { width: 240, height: 320, channels: 3, background: "#abcdef" },
      })
        .png()
        .toBuffer();
      const contextBefore = await collectProfile(user, {});
      const form = new FormData();
      form.set(
        "photo",
        new Blob([new Uint8Array(original)], { type: "image/png" }),
        "face.png",
      );
      form.set("crop", JSON.stringify(crop));
      form.set("revision", "0");
      form.set("userId", otherId);
      const upload = await fetch(origin + "/api/avatar", {
        method: "POST",
        headers: { Origin: origin, Cookie: `leader_session=${token}` },
        body: form,
      });
      assert.equal(upload.status, 200, await upload.text());
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: otherId } }))
          .avatarPhoto,
        false,
      );
      assert.equal(await db.userAvatar.count({ where: { userId: uid } }), 1);
      const contextAfter = await collectProfile(
        await db.user.findUniqueOrThrow({ where: { id: uid } }),
        {},
      );
      assert.deepEqual(
        contextAfter,
        contextBefore,
        "Photos do not enter profile context",
      );
      const imageUrl = `${origin}/api/avatars/${uid}?v=1&size=small`;
      assert.equal((await fetch(imageUrl)).status, 401);
      const readable = await fetch(imageUrl, {
        headers: { Cookie: `leader_session=${token}` },
      });
      assert.equal(readable.status, 200);
      assert.match(readable.headers.get("cache-control")!, /no-store/);
      await assert.rejects(readAvatar(other, uid, 1, false), /недоступно/);
      const image = await prepareAvatar(original, "image/png", crop);
      await assert.rejects(saveAvatar(user, 0, image), /другой вкладке/);
      await saveAvatar(user, 1, image);
      await assert.rejects(readAvatar(user, uid, 1, false), /недоступно/);
      assert.ok((await readAvatar(user, uid, 2, true)).length);
      const deletion = await fetch(origin + "/api/avatar", {
        method: "DELETE",
        headers: {
          Origin: origin,
          Cookie: `leader_session=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: 2 }),
      });
      assert.equal(deletion.status, 200);
      assert.equal(await db.userAvatar.count({ where: { userId: uid } }), 0);
      await assert.rejects(readAvatar(user, uid, 2, false), /недоступно/);
      const badOrigin = await fetch(origin + "/api/avatar", {
        method: "DELETE",
        headers: {
          Origin: "https://other.example",
          Cookie: `leader_session=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: 3 }),
      });
      assert.equal(badOrigin.status, 403);
    } finally {
      await db.rateLimit.deleteMany({ where: { key: `avatar:${uid}` } });
      await db.user.deleteMany({ where: { id: { in: [uid, otherId] } } });
      await db.$disconnect();
      await sharedDb.$disconnect();
    }
  },
);
