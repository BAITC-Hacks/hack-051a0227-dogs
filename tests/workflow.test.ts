import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { cleanupRun } from "./cleanup";
import { initialState } from "../src/lib/projects";
import { emptyFields } from "../src/lib/validation";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
class BrowserSession {
  cookie = "";
  async call(type: string, data: Record<string, unknown> = {}, expected = 200) {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: this.cookie,
      },
      body: JSON.stringify({ type, ...data }),
    });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const result = await r.json();
    assert.equal(r.status, expected, JSON.stringify(result));
    return result.data;
  }
  async file(id: string, status = 200) {
    const r = await fetch(origin + "/api/files/" + id, {
      headers: { Cookie: this.cookie },
    });
    assert.equal(r.status, status);
    return r;
  }
  async upload(bytes: Buffer, kind: string, mime: string, expected = 200) {
    const form = new FormData();
    form.set("kind", kind);
    form.set(
      "file",
      new File(
        [new Uint8Array(bytes)],
        kind + "." + (mime === "audio/wav" ? "wav" : "pdf"),
        {
          type: mime,
        },
      ),
    );
    const r = await fetch(origin + "/api/files", {
      method: "POST",
      headers: { Origin: origin, Cookie: this.cookie },
      body: form,
    });
    const result = await r.json();
    assert.equal(r.status, expected, JSON.stringify(result));
    return result.data;
  }
}
test(
  "Сквозной серверный сценарий: гость, аккаунт, приватность, заявка, язык, сотрудник и версии",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient();
    const run = Date.now();
    const candidate = new BrowserSession();
    const stranger = new BrowserSession();
    const staff = new BrowserSession();
    try {
      const state = {
        ...structuredClone(initialState),
        screens: ["event", "profile", "confirm"],
        requiredPhone: false,
      };
      const work = await candidate.call("project.save", {
        slug: "digital-products",
        state,
      });
      assert.equal(work.revision, 1);
      const guestAttempt = await db.projectAttempt.findUniqueOrThrow({
        where: { id: work.id },
      });
      assert.equal(guestAttempt.revision, 1);
      const ownerId = guestAttempt.userId;
      await candidate.call("register", {
        name: "Проверка Сценария",
        email: `flow-${run}@qa.local`,
        password: "FlowCandidate2026!",
      });
      await db.user.update({ where: { id: ownerId }, data: { origin: "QA" } });
      const owned = await db.projectAttempt.findUniqueOrThrow({
        where: { id: work.id },
        include: { user: true, versions: true },
      });
      assert.equal(owned.user.email, `flow-${run}@qa.local`);
      assert.equal(owned.versions.length, 2);
      assert.equal(owned.userId, ownerId);
      await stranger.call("register", {
        name: "Другой Пользователь",
        email: `other-${run}@qa.local`,
        password: "OtherCandidate2026!",
      });
      await db.user.update({
        where: { email: `other-${run}@qa.local` },
        data: { origin: "QA" },
      });
      await stranger.call(
        "project.save",
        { slug: "digital-products", state, id: work.id, revision: 1 },
        404,
      );
      await candidate.call(
        "project.save",
        { slug: "digital-products", state, id: work.id, revision: 0 },
        409,
      );
      const fields = {
        ...emptyFields,
        name: "Проверка Сценария",
        email: `flow-${run}@qa.local`,
        city: "Алматы",
        experience:
          "Я провёл исследование школьного расписания и описал проблемы участников.",
        personalRole: "Я отвечал за интервью и группировку наблюдений.",
        motivation:
          "Хочу исследовать потребности людей и развивать цифровые продукты в команде.",
        videoUrl: "https://example.org/presentation",
        most: "0",
        least: "1",
        processing: true,
        research: false,
        audioConsent: true,
        documentNote: "Результат ЕНТ требует отдельного уточнения.",
      };
      const app = await candidate.call("application.save", {
        fields,
        programSlug: "digital-products",
        revision: 0,
      });
      await db.application.update({
        where: { id: app.id },
        data: { origin: "QA" },
      });
      await candidate.call(
        "work.transfer",
        { attemptId: work.id, revision: work.revision, consent: false },
        400,
      );
      await candidate.call("work.transfer", {
        attemptId: work.id,
        revision: work.revision,
        consent: true,
      });
      await stranger.call(
        "work.transfer",
        { attemptId: work.id, revision: work.revision, consent: true },
        400,
      );
      const pdf = await candidate.upload(
        Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"),
        "document",
        "application/pdf",
      );
      await candidate.file(pdf.id);
      await stranger.file(pdf.id, 404);
      await new BrowserSession().file(pdf.id, 401);
      await candidate.upload(
        Buffer.from("<html>wrong file</html>"),
        "document",
        "application/pdf",
        400,
      );
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      await staff.file(pdf.id, 404);
      const wav = Buffer.alloc(44 + 8000);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVE", 8);
      wav.write("fmt ", 12);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24);
      wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(8000, 40);
      const oral = await candidate.upload(wav, "oral", "audio/wav");
      const followup = await candidate.upload(wav, "followup", "audio/wav");
      const response = {
        comprehension: "later",
        oralId: oral.id,
        followupId: followup.id,
        writtenNote: "Техническая проверка аудиофайлов.",
      };
      const lang = await candidate.call("language.save", {
        state: response,
        revision: 0,
        finish: true,
      });
      assert.equal(lang.revision, 1);
      assert.match(lang.comprehensionFeedback, /Верно/);
      await candidate.call("audio.status", { applicationId: app.id });
      await staff.call("audio.status", { applicationId: app.id }, 404);
      await stranger.call("audio.status", { applicationId: app.id }, 404);
      // A terminal artifact tests HTTP authorization without ever scheduling a paid request.
      const checkRecord = await db.languageCheck.findUniqueOrThrow({
        where: { applicationId: app.id },
      });
      const audioArtifact = await db.audioJob.create({
        data: {
          applicationId: app.id,
          checkId: checkRecord.id,
          identity: "http-auth-" + run,
          mode: "LIVE",
          oralId: oral.id,
          followupId: followup.id,
          oralHash: "fixture",
          followupHash: "fixture",
          taskVersion: "workshop-language-v1",
          taskSnapshot: {},
          instructionVersion: "content-only-v1",
          consentRevision: 0,
          provider: "controlled-fixture",
          transcriptionModel: "fixture",
          textModel: "fixture",
          status: "CANCELLED",
        },
      });
      for (const [session, expectedStatus] of [
        [candidate, 200],
        [stranger, 404],
        [staff, 404],
        [new BrowserSession(), 401],
      ] as const) {
        const artifactResponse = await fetch(
          origin + "/api/audio/" + audioArtifact.id,
          { headers: { Cookie: session.cookie } },
        );
        assert.equal(artifactResponse.status, expectedStatus);
      }

      await candidate.call(
        "application.submit",
        { confirm: true, revision: 0 },
        409,
      );
      await candidate.call("application.submit", {
        confirm: true,
        revision: app.revision,
      });
      await staff.file(pdf.id);
      const snapshot = await db.applicationVersion.findFirstOrThrow({
        where: { applicationId: app.id, kind: "SUBMITTED" },
      });
      await candidate.call(
        "application.save",
        {
          fields: { ...fields, name: "Changed" },
          programSlug: "digital-products",
          revision: app.revision,
        },
        409,
      );
      await stranger.call(
        "message",
        { applicationId: app.id, body: "Прочитать чужую заявку" },
        404,
      );
      await candidate.call(
        "decision",
        {
          applicationId: app.id,
          revision: 2,
          action: "DECLINE",
          reason: "Несанкционированное решение.",
        },
        403,
      );
      const source = await db.source.findFirstOrThrow({
        where: { applicationId: app.id, kind: "Анкета" },
      });
      await staff.call("assessment", {
        materialVersion: (
          await staff.call("review.profile", { applicationId: app.id })
        ).materialVersion,
        applicationId: app.id,
        domain: "Командная работа",
        level: "Есть проявление",
        sufficiency: "Частично",
        contradiction: "Нужно уточнение роли",
        interpretation: "Кандидат описал конкретное действие в команде.",
        sourceIds: [source.id],
      });
      const before = await db.assessment.findMany({
        where: { applicationId: app.id },
      });
      await staff.call("language.review", {
        applicationId: app.id,
        revision: 1,
        result:
          "Запись требует содержательного устного ответа; техническая проверка не является оценкой языка.",
      });
      assert.deepEqual(
        await db.assessment.findMany({ where: { applicationId: app.id } }),
        before,
      );
      await candidate.call(
        "language.save",
        { state: response, revision: 1, finish: true },
        409,
      );
      await staff.call("decision", {
        materialVersion: (
          await staff.call("review.profile", { applicationId: app.id })
        ).materialVersion,
        applicationId: app.id,
        revision: 2,
        action: "CLARIFICATION",
        reason: "Уточните, какие вопросы вы задавали участникам исследования.",
      });
      await candidate.call("message", {
        applicationId: app.id,
        body: "Я спрашивал о сложностях с расписанием и способах узнавать изменения.",
      });
      await candidate.call("correction", {
        sourceId: source.id,
        explanation:
          "Было восемь подробных разговоров и четыре коротких уточнения.",
      });
      assert.equal(
        (await db.source.findUniqueOrThrow({ where: { id: source.id } }))
          .content,
        source.content,
      );
      await staff.call("decision", {
        materialVersion: (
          await staff.call("review.profile", { applicationId: app.id })
        ).materialVersion,
        applicationId: app.id,
        revision: 3,
        action: "INTERVIEW",
        reason: "Уточнение получено. Обсудим ход исследования на интервью.",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const interview = await db.interview.findFirstOrThrow({
        where: { applicationId: app.id },
      });
      const notes = {
        a1: "Школьное расписание",
        t: "Выявить сложности",
        o: "Восемь разговоров",
        l: "Уточнение выборки",
        a2: "Проверить на другой группе",
        observation: "Объяснил личную роль.",
        assessment:
          "Сотрудник рассмотрел источники; требуется ещё один пример исследовательского вопроса.",
      };
      await staff.call("interview.save", {
        id: interview.id,
        materialVersion: (
          await staff.call("review.profile", { applicationId: app.id })
        ).materialVersion,
        revision: 0,
        notes,
        finish: false,
      });
      assert.equal(
        (await db.interview.findUniqueOrThrow({ where: { id: interview.id } }))
          .status,
        "SCHEDULED",
      );
      assert.equal(
        await db.interviewVersion.count({
          where: { interviewId: interview.id },
        }),
        1,
      );
      const unchanged = await db.applicationVersion.findUniqueOrThrow({
        where: { id: snapshot.id },
      });
      assert.deepEqual(unchanged.snapshot, snapshot.snapshot);
      const updated = await db.application.findUniqueOrThrow({
        where: { id: app.id },
        include: {
          decisions: true,
          transfers: true,
          messages: true,
          language: { include: { history: true } },
        },
      });
      assert.equal(updated.stage, "INTERVIEW");
      assert.equal(updated.transfers.length, 1);
      assert.equal(updated.decisions.length, 2);
      assert.equal(updated.language?.history.length, 2);
      assert.ok(
        updated.messages.some(
          (m) => m.authorId === ownerId && m.kind === "MESSAGE",
        ),
      );
      const csrf = await fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          Origin: "https://foreign.example",
          "Content-Type": "application/json",
          Cookie: candidate.cookie,
        },
        body: JSON.stringify({ type: "logout" }),
      });
      assert.equal(csrf.status, 403);
    } finally {
      await cleanupRun(db, [`flow-${run}@qa.local`, `other-${run}@qa.local`]);
      await db.$disconnect();
    }
  },
);

test("Материал черновика: чужой доступ, удаление, повтор и неизменяемость после отправки", async () => {
  const db = new PrismaClient();
  const run = Date.now();
  const emails = [`delete-${run}@qa.local`, `delete-other-${run}@qa.local`];
  const owner = new BrowserSession(),
    other = new BrowserSession(),
    staff = new BrowserSession();
  try {
    for (const [index, session] of [owner, other].entries()) {
      await session.call("register", {
        name: "Проверка Материала",
        email: emails[index],
        password: "MaterialCheck2026!",
      });
      await db.user.update({
        where: { email: emails[index] },
        data: { origin: "QA" },
      });
    }
    const app = await owner.call("application.save", {
      revision: 0,
      programSlug: "digital-products",
      fields: {
        ...emptyFields,
        name: "Проверка Материала",
        email: emails[0],
        city: "Алматы",
        experience:
          "Я составил маршрут выставки и проверил его с тремя участниками.",
        personalRole: "Я подготовил маршрут и записал замечания.",
        motivation:
          "Хочу изучать исследование пользователей и проверять решения на программе.",
        videoUrl: "https://example.org/material-test",
        most: "0",
        least: "1",
        processing: true,
      },
    });
    await db.application.update({
      where: { id: app.id },
      data: { origin: "QA" },
    });
    const bytes = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
    );
    const material = await owner.upload(bytes, "document", "application/pdf");
    await other.call(
      "material.delete",
      { id: material.id, role: "STAFF" },
      404,
    );
    await staff.call("login", {
      email: "admissions@invision.local",
      password: "LeaderDesk2026!",
    });
    await staff.call("material.delete", { id: material.id }, 403);
    await owner.call("material.delete", { id: material.id });
    await owner.file(material.id, 404);
    await owner.call("material.delete", { id: material.id }, 404);
    const retained = await owner.upload(bytes, "document", "application/pdf");
    await owner.call("application.submit", {
      revision: app.revision,
      confirm: true,
    });
    await owner.call("material.delete", { id: retained.id }, 409);
    await owner.file(retained.id);
    await owner.call("logout");
    await owner.file(retained.id, 401);
    assert.equal(await db.material.count({ where: { id: retained.id } }), 1);
  } finally {
    await cleanupRun(db, emails);
    await db.$disconnect();
  }
});
