import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { emptyFields } from "../src/lib/validation";
import { emptyIntake, defaultIntakeRules } from "../src/lib/intake-contract";
import { cleanupRun } from "./cleanup";
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3110";
class Session {
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
    if (r.headers.get("set-cookie"))
      this.cookie = r.headers.get("set-cookie")!.split(";")[0];
    const body = await r.json();
    assert.equal(r.status, expected, JSON.stringify(body));
    return body.data;
  }
  async upload(purpose: string, release = false, previousId = "") {
    const form = new FormData();
    form.set("kind", "document");
    form.set("purpose", purpose);
    form.set("release", String(release));
    form.set("previousId", previousId);
    form.set(
      "file",
      new File(
        ["%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"],
        "результаты.pdf",
        { type: "application/pdf" },
      ),
    );
    const r = await fetch(origin + "/api/files", {
      method: "POST",
      headers: { Origin: origin, Cookie: this.cookie },
      body: form,
    });
    const b = await r.json();
    assert.equal(r.status, 200, JSON.stringify(b));
    return b.data;
  }
}
test(
  "Intake end-to-end: autosave retry, preflight, immutable submission, material version, privacy, stage confirmation and manual invitation",
  { timeout: 120000 },
  async () => {
    const db = new PrismaClient(),
      candidate = new Session(),
      other = new Session(),
      staff = new Session(),
      email = `intake-${randomUUID()}@qa.local`,
      otherEmail = `intake-other-${randomUUID()}@qa.local`;
    try {
      await candidate.call("register", {
        name: "Лея Техническая",
        email,
        password: "IntakeCheck2026!",
      });
      await other.call("register", {
        name: "Другой Кандидат",
        email: otherEmail,
        password: "IntakeCheck2026!",
      });
      await db.user.updateMany({
        where: { email: { in: [email, otherEmail] } },
        data: { origin: "QA" },
      });
      const fields = {
        ...emptyFields,
        name: "Лея Техническая",
        email,
        city: "Бишкек",
        citizenship: "Кыргызстан",
        experience:
          "Я собрала каталог книг и проверила выдачу с тремя участниками.",
        personalRole: "Я сопоставила наличие книг с журналом выдачи.",
        motivation:
          "Хочу исследовать городские сервисы через реальные наблюдения.",
        processing: true,
        intake: structuredClone(emptyIntake),
      };
      fields.intake.entryType = "FOUNDATION";
      fields.intake.essay = {
        questionId: "foundation-goal",
        questionVersion: 1,
        language: "ru",
        text: "Сначала я считала число обращений результатом проекта. После проверки выяснилось, что часть обращений повторялась. Я выделила завершённые выдачи и сохранила журнал.",
        materialId: "",
      };
      fields.intake.education = {
        institution: "Школа Северная",
        system: "Среднее образование",
        graduationYear: "2026",
        status: "COMPLETED",
        materialId: "",
      };
      fields.intake.gpa = {
        ...fields.intake.gpa,
        state: "PROVIDED",
        value: "4,6",
        min: "",
        max: "5",
        scaleType: "Пятибалльная",
        period: "2025–2026",
      };
      fields.intake.aiConsent = true;
      let saved = await candidate.call("application.save", {
        fields,
        programSlug: "sociology",
        revision: 0,
        section: 2,
        field: "essay",
      });
      await db.application.update({
        where: { id: saved.id },
        data: { origin: "QA" },
      });
      const identical = await candidate.call("application.save", {
        fields,
        programSlug: "sociology",
        revision: 0,
        section: 2,
        field: "essay",
      });
      assert.equal(identical.revision, saved.revision);
      await candidate.call(
        "application.save",
        {
          fields: { ...fields, city: "Другое" },
          programSlug: "sociology",
          revision: 0,
        },
        409,
      );
      let check = await candidate.call("application.preflight");
      assert.ok(check.issues.find((i: { key: string }) => i.key === "gpa"));
      assert.ok(
        check.issues.find((i: { key: string }) => i.key === "videoUrl"),
      );
      fields.intake.gpa.min = "0";
      fields.videoUrl = "https://example.org/unverified-video";
      const identity = await candidate.upload("IDENTITY"),
        grades = await candidate.upload("GRADES"),
        language = await candidate.upload("LANGUAGE");
      fields.intake.gpa.materialId = grades.id;
      fields.intake.english = {
        method: "CERTIFICATE",
        certificate: {
          ...fields.intake.english.certificate,
          type: "IELTS",
          value: "6.5",
          scaleMin: "0",
          scaleMax: "9",
          date: "2026-08-15",
          materialId: language.id,
        },
      };
      await other.call(
        "application.save",
        {
          fields,
          programSlug: "sociology",
          revision: 0,
        },
        403,
      );
      assert.equal((await candidate.upload("GRADES")).id, grades.id);
      saved = await candidate.call("application.save", {
        fields,
        programSlug: "sociology",
        revision: saved.revision,
        section: 5,
      });
      check = await candidate.call("application.preflight");
      assert.ok(
        !check.issues.some((i: { group: string }) => i.group === "BLOCK"),
      );
      assert.ok(
        check.issues.some(
          (i: { key: string; group: string }) =>
            i.key === "video-review" && i.group === "PENDING",
        ),
      );
      await staff.call("login", {
        email: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      assert.equal(
        (
          await fetch(origin + "/api/files/" + grades.id, {
            headers: { Cookie: staff.cookie },
          })
        ).status,
        404,
      );
      const submit = {
        revision: saved.revision,
        confirm: true,
        rulesVersion: defaultIntakeRules.version,
      };
      await candidate.call("application.submit", submit);
      await candidate.call("application.submit", submit);
      assert.equal(
        await db.applicationVersion.count({
          where: { applicationId: saved.id, kind: "SUBMITTED" },
        }),
        1,
      );
      const snapshot = await db.applicationVersion.findFirstOrThrow({
        where: { applicationId: saved.id, kind: "SUBMITTED" },
      });
      const priorRules = await db.setting.findUnique({
        where: { key: "admissions-rules" },
      });
      try {
        const changed = structuredClone(defaultIntakeRules);
        changed.version = "qa-next-intake-rules";
        changed.routes[1].essay.required = true;
        changed.routes[1].essay.minWords = 500;
        await db.setting.upsert({
          where: { key: "admissions-rules" },
          create: { key: "admissions-rules", value: changed },
          update: { value: changed },
        });
        const frozen = await candidate.call("application.preflight");
        assert.equal(frozen.rules.version, defaultIntakeRules.version);
        assert.ok(
          !frozen.issues.some((i: { key: string }) => i.key === "essay-length"),
        );
      } finally {
        if (priorRules)
          await db.setting.update({
            where: { key: priorRules.key },
            data: { value: priorRules.value! },
          });
        else
          await db.setting.deleteMany({ where: { key: "admissions-rules" } });
      }
      const oauth = await fetch(
        origin + "/api/google/callback?code=qa-invalid&state=unknown",
        {
          headers: { Cookie: staff.cookie },
          redirect: "manual",
        },
      );
      assert.equal(oauth.status, 307);
      assert.ok(
        oauth.headers
          .get("location")
          ?.endsWith("/settings/calendar?error=connection"),
      );
      assert.equal(await db.googleConnection.count(), 0);
      assert.equal(
        await db.source.count({
          where: { applicationId: saved.id, materialId: identity.id },
        }),
        0,
      );
      assert.equal(
        (
          await fetch(origin + "/api/files/" + grades.id, {
            headers: { Cookie: other.cookie },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await fetch(origin + "/api/files/" + grades.id, {
            headers: { Cookie: staff.cookie },
          })
        ).status,
        200,
      );
      await candidate.call(
        "application.save",
        { fields, programSlug: "sociology", revision: saved.revision },
        409,
      );
      const replacement = await candidate.upload("GRADES", true, grades.id);
      assert.equal(replacement.version, 2);
      assert.deepEqual(
        (
          await db.applicationVersion.findUniqueOrThrow({
            where: { id: snapshot.id },
          })
        ).snapshot,
        snapshot.snapshot,
      );
      let app = await db.application.findUniqueOrThrow({
        where: { id: saved.id },
      });
      assert.equal(app.preparationEvent, 2);
      const profile = await staff.call("review.profile", {
        applicationId: app.id,
      });
      const p = await staff.call("stage.preview", {
        applicationId: app.id,
        revision: app.revision,
        materialVersion: profile.materialVersion,
        action: "APPROVE_STAGE",
        reason: "Проверены исходная шкала и описание личного вклада.",
      });
      assert.equal(
        await db.decision.count({ where: { applicationId: app.id } }),
        0,
      );
      await candidate.call(
        "stage.confirm",
        { previewId: p.id, confirm: true },
        403,
      );
      await staff.call("stage.confirm", { previewId: p.id, confirm: true });
      await staff.call("stage.confirm", { previewId: p.id, confirm: true });
      assert.equal(
        await db.decision.count({ where: { applicationId: app.id } }),
        1,
      );
      app = await db.application.findUniqueOrThrow({ where: { id: app.id } });
      assert.equal(app.stage, "APPROVED");
      const decline = await staff.call("stage.preview", {
        applicationId: app.id,
        revision: app.revision,
        materialVersion: profile.materialVersion,
        action: "DECLINE",
        reason:
          "Не представлены применимые подтверждения академической готовности.",
      });
      await candidate.call("message", {
        applicationId: app.id,
        body: "Уточнение: в журнале подтверждены 27 завершённых выдач.",
      });
      await staff.call(
        "stage.confirm",
        { previewId: decline.id, confirm: true },
        409,
      );
      const latest = await staff.call("review.profile", {
        applicationId: app.id,
      });
      const people = await staff.call("calendar.people");
      const date = new Date(Date.now() + 5 * 86400000)
        .toISOString()
        .slice(0, 16);
      const meeting = await staff.call("calendar.preview", {
        applicationId: app.id,
        revision: app.revision,
        materialVersion: latest.materialVersion,
        input: {
          localStart: date,
          timezone: "Asia/Almaty",
          durationMinutes: 30,
          interviewerIds: [people[0].id],
          recipients: [email],
          mode: "MANUAL",
          manualUrl: "https://example.org/authorized-room",
          publish: true,
          reason: "Обсудить уточнённые действия и результаты выдачи.",
        },
      });
      const i = await staff.call("calendar.confirm", {
        previewId: meeting.id,
        confirm: true,
      });
      assert.equal(
        (await db.interview.findUniqueOrThrow({ where: { id: i.id } }))
          .calendarStatus,
        "MANUAL",
      );
      assert.ok(
        await db.message.findFirst({
          where: {
            applicationId: app.id,
            kind: "INTERVIEW",
            body: { contains: "Asia/Almaty" },
          },
        }),
      );
      app = await db.application.findUniqueOrThrow({ where: { id: app.id } });
      const final = await staff.call("stage.preview", {
        applicationId: app.id,
        revision: app.revision,
        materialVersion: latest.materialVersion,
        action: "DECLINE",
        reason:
          "После разговора необходимые документы готовности не представлены.",
      });
      await staff.call("stage.confirm", { previewId: final.id, confirm: true });
      assert.equal(
        await db.decision.count({ where: { applicationId: app.id } }),
        3,
      );
      assert.equal(
        await db.assessment.count({ where: { applicationId: app.id } }),
        0,
      );
      assert.deepEqual(
        (
          await db.applicationVersion.findUniqueOrThrow({
            where: { id: snapshot.id },
          })
        ).snapshot,
        snapshot.snapshot,
      );
    } finally {
      await cleanupRun(db, [email, otherEmail]);
      await db.$disconnect();
    }
  },
);
