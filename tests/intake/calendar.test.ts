import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  GoogleCalendarAdapter,
  calendarEventId,
} from "../../src/lib/google-calendar.server";
import {
  selectionAction,
  processCalendarOperation,
} from "../../src/lib/selection-actions.server";
import { materialContext } from "../../src/lib/review-service.server";
import { emptyFields } from "../../src/lib/validation";
import { json } from "../../src/lib/learning-resources.server";
import { cleanupRun } from "../cleanup";
import type { CalendarEvent } from "../../src/lib/calendar-contract";
test("Google contract: lost response reconciles exact event, bounded pending conference, no duplicate invitations, reschedule and cancel", async () => {
  const email = `calendar-${randomUUID()}@qa.local`,
    staffEmail = `calendar-staff-${randomUUID()}@qa.local`;
  const user = await db.user.create({
      data: { email, role: "CANDIDATE", origin: "QA" },
    }),
    staff = await db.user.create({
      data: { email: staffEmail, role: "STAFF", origin: "QA" },
    });
  const app = await db.application.create({
    data: {
      userId: user.id,
      origin: "QA",
      programSlug: "sociology",
      submittedAt: new Date(),
      stage: "REVIEW",
      revision: 1,
      fields: json({ ...emptyFields, name: "Заявка календаря", email }),
      versions: {
        create: {
          revision: 1,
          kind: "SUBMITTED",
          snapshot: json({
            fields: emptyFields,
            materialIds: [],
            transfers: [],
          }),
        },
      },
    },
  });
  const conn = await db.googleConnection.create({
    data: {
      userId: staff.id,
      calendarId: "test-calendar",
      calendarName: "Controlled",
      secretId: randomUUID(),
      secretCipher: "not-a-token",
      secretStorage: "TEST",
      scopes: "",
    },
  });
  let event: CalendarEvent | null = null,
    creates = 0,
    invites = 0,
    lost = true,
    pending = true;
  const transport: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.hostname, "www.googleapis.com");
    if (u.pathname.endsWith("freeBusy"))
      return Response.json({
        calendars: {
          "test-calendar": { busy: [] },
          [email]: { errors: [{ reason: "notFound" }] },
          [staffEmail]: { busy: [] },
        },
      });
    if (init?.method === "POST") {
      creates++;
      assert.equal(u.searchParams.get("conferenceDataVersion"), "1");
      const b = JSON.parse(String(init.body));
      assert.ok(!b.attendees);
      event = {
        ...b,
        etag: "v1",
        conferenceData: {
          createRequest: { status: { statusCode: "pending" } },
        },
      };
      if (lost) {
        lost = false;
        throw new Error("lost after creation");
      }
      return Response.json(event);
    }
    if (init?.method === "PATCH") {
      const b = JSON.parse(String(init.body));
      invites++;
      event = { ...event!, ...b, etag: "v2" };
      assert.equal(u.searchParams.get("sendUpdates"), "all");
      return Response.json(event);
    }
    if (init?.method === "DELETE") {
      event = null;
      return new Response(null, { status: 204 });
    }
    if (!event) return Response.json({}, { status: 404 });
    if (!pending)
      event = {
        ...event,
        conferenceData: {
          createRequest: { status: { statusCode: "success" } },
          entryPoints: [
            {
              entryPointType: "video",
              uri: "https://meet.google.com/aaa-bbbb-ccc",
            },
          ],
        },
      };
    return Response.json(event);
  };
  const adapter = new GoogleCalendarAdapter(
    "controlled-token",
    "test-calendar",
    transport,
  );
  const v = {
    localStart: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 16),
    timezone: "Asia/Almaty",
    durationMinutes: 30,
    interviewerIds: [staff.id],
    recipients: [email],
    mode: "GOOGLE",
    manualUrl: "",
    publish: true,
    reason: "Обсудить личный вклад по представленному проекту.",
  };
  try {
    const context = await materialContext(db, app.id);
    const preview = (await selectionAction(
      "calendar.preview",
      {
        applicationId: app.id,
        revision: 1,
        materialVersion: context.version,
        input: v,
      },
      staff,
      async () => adapter,
    )) as { id: string; payload: { availability: { state: string }[] } };
    assert.ok(preview.payload.availability.some((i) => i.state === "UNKNOWN"));
    assert.equal(
      await db.interview.count({ where: { applicationId: app.id } }),
      0,
    );
    const scheduled = (await selectionAction(
      "calendar.confirm",
      { previewId: preview.id, confirm: true },
      staff,
    )) as { id: string; operationId: string };
    assert.deepEqual(
      await selectionAction(
        "calendar.confirm",
        { previewId: preview.id, confirm: true },
        staff,
      ),
      scheduled,
    );
    await processCalendarOperation(scheduled.operationId, adapter);
    assert.equal(creates, 1);
    assert.equal(invites, 0);
    assert.equal(
      (
        await db.calendarOperation.findUniqueOrThrow({
          where: { id: scheduled.operationId },
        })
      ).status,
      "FAILED",
    );
    await selectionAction(
      "calendar.retry",
      { id: scheduled.operationId },
      staff,
    );
    await processCalendarOperation(scheduled.operationId, adapter);
    assert.equal(
      (await db.interview.findUniqueOrThrow({ where: { id: scheduled.id } }))
        .calendarStatus,
      "PENDING",
    );
    assert.equal(
      await db.message.count({ where: { applicationId: app.id } }),
      0,
    );
    pending = false;
    await db.calendarOperation.update({
      where: { id: scheduled.operationId },
      data: { leaseUntil: new Date(0) },
    });
    await processCalendarOperation(scheduled.operationId, adapter);
    assert.equal(creates, 1);
    assert.equal(invites, 1);
    assert.equal(
      await db.message.count({
        where: { applicationId: app.id, kind: "INTERVIEW" },
      }),
      1,
    );
    const meeting = await db.interview.findUniqueOrThrow({
      where: { id: scheduled.id },
    });
    assert.equal(meeting.meetUrl, "https://meet.google.com/aaa-bbbb-ccc");
    let current = await db.application.findUniqueOrThrow({
      where: { id: app.id },
    });
    const moved = (await selectionAction(
      "calendar.preview",
      {
        applicationId: app.id,
        revision: current.revision,
        materialVersion: (await materialContext(db, app.id)).version,
        interviewId: meeting.id,
        input: {
          ...v,
          localStart: new Date(Date.now() + 6 * 86400000)
            .toISOString()
            .slice(0, 16),
        },
      },
      staff,
      async () => adapter,
    )) as { id: string };
    const move = (await selectionAction(
      "calendar.confirm",
      { previewId: moved.id, confirm: true },
      staff,
    )) as { operationId: string };
    assert.equal(
      (await db.interview.findUniqueOrThrow({ where: { id: meeting.id } }))
        .invitationPublishedAt,
      null,
      "Previous publication must not expose an unconfirmed new time",
    );
    await processCalendarOperation(move.operationId, adapter);
    assert.equal(creates, 1);
    assert.equal(invites, 2);
    assert.ok(
      await db.message.findFirst({
        where: {
          applicationId: app.id,
          body: { startsWith: "Время интервью изменено:" },
        },
      }),
    );
    assert.equal(
      (await db.interview.findUniqueOrThrow({ where: { id: meeting.id } }))
        .calendarEventId,
      calendarEventId(preview.id),
    );
    current = await db.application.findUniqueOrThrow({ where: { id: app.id } });
    const cancelling = (await selectionAction(
      "calendar.preview",
      {
        applicationId: app.id,
        revision: current.revision,
        materialVersion: (await materialContext(db, app.id)).version,
        interviewId: meeting.id,
        input: v,
        cancel: true,
      },
      staff,
      async () => adapter,
    )) as { id: string };
    const cancelled = (await selectionAction(
      "calendar.confirm",
      { previewId: cancelling.id, confirm: true },
      staff,
    )) as { operationId: string };
    await processCalendarOperation(cancelled.operationId, adapter);
    assert.equal(event, null);
    assert.equal(
      (await db.interview.findUniqueOrThrow({ where: { id: meeting.id } }))
        .status,
      "CANCELLED",
    );
    assert.ok(
      (await db.interviewVersion.count({
        where: { interviewId: meeting.id },
      })) >= 3,
    );
    assert.notEqual(calendarEventId("one"), calendarEventId("two"));
  } finally {
    await db.googleConnection.delete({ where: { id: conn.id } });
    await cleanupRun(db, [email, staffEmail]);
  }
});
