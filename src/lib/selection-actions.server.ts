import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { materialContext } from "./review-service.server";
import {
  meetingSchema,
  wallTimeToISO,
  confirmedMeet,
  type MeetingInput,
} from "./calendar-contract";
import {
  adapterFor,
  calendarConnection,
  calendarEventId,
  GoogleCalendarError,
  type GoogleCalendarAdapter,
} from "./google-calendar.server";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(100);
type MeetingPayload = {
  input: MeetingInput;
  start: string;
  end: string;
  emails: string[];
  interviewers: { id: string; name: string; email: string }[];
  connectionId: string | null;
  connectionRevision: number;
  revision: number;
  materialVersion: string;
  interviewId?: string;
  interviewRevision?: number;
  availability: { id: string; state: string }[];
  cancel?: boolean;
  eventId?: string;
};
function staff(u: User) {
  if (u.role !== "STAFF")
    throw new AppError("Действие доступно сотруднику.", 403);
}
export async function selectionAction(
  type: string,
  b: Record<string, unknown>,
  user: User,
  adapterFactory = adapterFor,
) {
  staff(user);
  if (type === "calendar.people")
    return db.user.findMany({
      where: { role: "STAFF", email: { not: null } },
      select: { id: true, name: true, email: true },
    });
  if (type === "stage.preview" || type === "calendar.preview") {
    const applicationId = id.parse(b.applicationId),
      app = await assertApplication(applicationId, user),
      context = await materialContext(db, applicationId);
    if (
      !app.submittedAt ||
      app.revision !== b.revision ||
      context.version !== b.materialVersion
    )
      throw new AppError(
        "Заявка изменилась. Обнови карточку перед действием.",
        409,
      );
    if (app.stage === "DECIDED")
      throw new AppError("Сначала возобнови рассмотрение.", 409);
    let payload: unknown;
    if (type === "stage.preview") {
      const action = z.enum(["APPROVE_STAGE", "DECLINE"]).parse(b.action),
        reason = z.string().trim().min(10).max(4000).parse(b.reason);
      if (action === "APPROVE_STAGE" && app.stage === "APPROVED")
        throw new AppError("Этот этап уже одобрен.", 409);
      payload = {
        action,
        reason,
        revision: app.revision,
        materialVersion: context.version,
        fromStage: app.stage,
        toStage: action === "DECLINE" ? "DECIDED" : "APPROVED",
        snapshot: context.snapshot,
      };
    } else {
      const input = meetingSchema.parse(b.input);
      let start: string;
      try {
        start = wallTimeToISO(input.localStart, input.timezone);
      } catch {
        throw new AppError(
          "Это время не существует или неоднозначно в выбранном часовом поясе. Выбери другое время.",
        );
      }
      if (b.cancel !== true && Date.parse(start) < Date.now() + 60000)
        throw new AppError("Выбери время в будущем.");
      const end = new Date(
        Date.parse(start) + input.durationMinutes * 60000,
      ).toISOString();
      const interviewers = await db.user.findMany({
        where: {
          id: { in: input.interviewerIds },
          role: "STAFF",
          email: { not: null },
        },
        select: { id: true, name: true, email: true },
      });
      if (interviewers.length !== new Set(input.interviewerIds).size)
        throw new AppError("Интервьюер недоступен.", 403);
      const emails = [
        ...new Set([...input.recipients, ...interviewers.map((i) => i.email!)]),
      ];
      const meeting = b.interviewId
        ? await db.interview.findFirst({
            where: { id: id.parse(b.interviewId), applicationId },
          })
        : null;
      if (b.interviewId && !meeting)
        throw new AppError("Интервью недоступно.", 404);
      if (meeting && ["COMPLETED", "CANCELLED"].includes(meeting.status))
        throw new AppError("Эта встреча уже завершена.", 409);
      if (
        meeting &&
        meeting.calendarStatus === "READY" &&
        input.mode !== "GOOGLE"
      )
        throw new AppError("Связанную встречу нужно изменить в Google.");
      if (
        meeting &&
        (await db.calendarOperation.count({
          where: {
            interviewId: meeting.id,
            status: { in: ["QUEUED", "RUNNING", "PENDING"] },
          },
        }))
      )
        throw new AppError("Сначала заверши предыдущую операцию встречи.", 409);
      const connection =
        input.mode === "GOOGLE" ? await calendarConnection(user) : null;
      if (
        meeting?.calendarConnectionId &&
        meeting.calendarConnectionId !== connection?.id
      )
        throw new AppError(
          "Встречу изменяет сотрудник, подключивший её календарь.",
          403,
        );
      let availability: { id: string; state: string }[] = emails.map((id) => ({
        id,
        state: "UNKNOWN",
      }));
      if (connection) {
        const adapter = await adapterFactory(connection);
        try {
          availability = await adapter.availability(start, end, emails);
        } catch {
          availability = emails.map((id) => ({ id, state: "UNKNOWN" }));
        }
      }
      if (input.mode === "MANUAL") {
        let url: URL;
        try {
          url = new URL(input.manualUrl);
        } catch {
          throw new AppError("Укажи ссылку на встречу.");
        }
        if (url.protocol !== "https:" || url.username || url.password)
          throw new AppError(
            "Нужна https-ссылка без реквизитов доступа в адресе.",
          );
      }
      if (
        process.env.GOOGLE_CALENDAR_TEST_ONLY === "true" &&
        input.mode === "GOOGLE"
      ) {
        const allowed = (process.env.GOOGLE_TEST_ATTENDEES ?? "")
          .split(",")
          .map((v) => v.trim().toLowerCase());
        if (
          connection?.calendarId !== process.env.GOOGLE_TEST_CALENDAR_ID ||
          emails.some((e) => !allowed.includes(e.toLowerCase()))
        )
          throw new AppError(
            "Для проверки разрешён только выделенный календарь и согласованные участники.",
            403,
          );
      }
      payload = {
        input,
        start,
        end,
        emails,
        interviewers: interviewers.map((i) => ({ ...i, email: i.email! })),
        connectionId: connection?.id ?? null,
        connectionRevision: connection?.revision ?? 0,
        revision: app.revision,
        materialVersion: context.version,
        interviewId: meeting?.id,
        interviewRevision: meeting?.revision,
        availability,
        cancel: b.cancel === true,
        eventId: meeting?.calendarEventId ?? undefined,
      } satisfies MeetingPayload;
    }
    const preview = await db.actionPreview.create({
      data: {
        authorId: user.id,
        applicationId,
        kind: type,
        payload: json(payload),
        expiresAt: new Date(Date.now() + 5 * 60000),
      },
    });
    return { id: preview.id, payload, expiresAt: preview.expiresAt };
  }
  if (type === "stage.confirm" || type === "calendar.confirm") {
    if (b.confirm !== true)
      throw new AppError("Подтверди точное содержание действия.");
    return db.$transaction(async (tx) => {
      const previewId = id.parse(b.previewId);
      await tx.$queryRaw`SELECT id FROM "ActionPreview" WHERE id=${previewId} FOR UPDATE`;
      const p = await tx.actionPreview.findUnique({ where: { id: previewId } });
      if (
        !p ||
        p.authorId !== user.id ||
        p.kind !== type.replace("confirm", "preview")
      )
        throw new AppError("Предпросмотр недоступен.", 404);
      if (p.usedAt) return p.result;
      if (p.expiresAt < new Date())
        throw new AppError(
          "Предпросмотр устарел. Проверь действие заново.",
          409,
        );
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${p.applicationId} FOR UPDATE`;
      const app = await tx.application.findUniqueOrThrow({
          where: { id: p.applicationId },
        }),
        payload = p.payload as unknown as MeetingPayload;
      const actor = await tx.user.findUnique({ where: { id: user.id } });
      if (actor?.role !== "STAFF") throw new AppError("Доступ отозван.", 403);
      const context = await materialContext(tx, app.id);
      if (
        app.revision !== payload.revision ||
        context.version !== payload.materialVersion
      )
        throw new AppError(
          "Заявка изменилась. Сверь основание и получи новый предпросмотр.",
          409,
        );
      let result: unknown;
      if (type === "stage.confirm") {
        const v = p.payload as {
          action: string;
          reason: string;
          fromStage: string;
          toStage: string;
        };
        const decision = await tx.decision.create({
          data: {
            applicationId: app.id,
            authorId: user.id,
            action: v.action,
            reason: v.reason,
            fromStage: app.stage,
            toStage: v.toStage,
            materialVersion: context.version,
            reviewedSnapshot: json(context.snapshot),
          },
        });
        await tx.application.update({
          where: { id: app.id },
          data: { stage: v.toStage, revision: { increment: 1 } },
        });
        result = { id: decision.id };
      } else {
        const v = payload,
          old = v.interviewId
            ? await tx.interview.findUnique({ where: { id: v.interviewId } })
            : null;
        if (old && old.revision !== v.interviewRevision)
          throw new AppError("Встреча изменилась. Повтори предпросмотр.", 409);
        if (
          !old &&
          (await tx.interview.count({
            where: {
              applicationId: app.id,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          }))
        )
          throw new AppError("Открой уже существующее интервью.", 409);
        if (v.connectionId) {
          const c = await tx.googleConnection.findFirst({
            where: {
              id: v.connectionId,
              userId: user.id,
              revision: v.connectionRevision,
            },
          });
          if (!c?.calendarId)
            throw new AppError("Подключение календаря изменилось.", 409);
        }
        const google = v.input.mode === "GOOGLE",
          cancel = !!v.cancel;
        const iData = {
          scheduledAt: new Date(v.start),
          durationMinutes: v.input.durationMinutes,
          timezone: v.input.timezone,
          attendees: json({
            interviewers: v.interviewers,
            recipients: v.input.recipients,
          }),
          status: cancel
            ? google
              ? "CANCELLING"
              : "CANCELLED"
            : google
              ? "SCHEDULING"
              : "SCHEDULED",
          calendarStatus: google ? "QUEUED" : cancel ? "CANCELLED" : "MANUAL",
          calendarConnectionId: v.connectionId,
          // A previous publication never authorizes the newly edited time or URL.
          invitationPublishedAt: null,
          meetUrl: google ? (old?.meetUrl ?? null) : v.input.manualUrl,
          materialVersion: context.version,
        };
        const meeting = old
          ? await tx.interview.update({
              where: { id: old.id },
              data: { ...iData, revision: { increment: 1 } },
            })
          : await tx.interview.create({
              data: {
                ...iData,
                applicationId: app.id,
                revision: 1,
                notes: {},
                plan: { questions: [], notes: "" },
              },
            });
        const updated = await tx.application.update({
          where: { id: app.id },
          data: {
            stage: cancel ? "REVIEW" : "INTERVIEW",
            revision: { increment: 1 },
          },
        });
        await tx.decision.create({
          data: {
            applicationId: app.id,
            authorId: user.id,
            action: cancel ? "CONTINUE" : "INTERVIEW",
            reason: v.input.reason,
            fromStage: app.stage,
            toStage: cancel ? "REVIEW" : "INTERVIEW",
            materialVersion: context.version,
            reviewedSnapshot: json(context.snapshot),
          },
        });
        await tx.interviewVersion.create({
          data: {
            interviewId: meeting.id,
            revision: meeting.revision,
            authorId: user.id,
            kind: cancel
              ? "CANCEL_REQUEST"
              : old
                ? "RESCHEDULE_REQUEST"
                : "SCHEDULE_REQUEST",
            materialVersion: context.version,
            notes: json(v),
          },
        });
        if (google) {
          const eventId = old?.calendarEventId ?? calendarEventId(p.id);
          const operation = await tx.calendarOperation.create({
            data: {
              interviewId: meeting.id,
              requestKey: p.id,
              kind: cancel
                ? "CANCEL"
                : old?.calendarEventId
                  ? "RESCHEDULE"
                  : "CREATE",
              authorId: user.id,
              connectionId: v.connectionId!,
              connectionRevision: v.connectionRevision,
              eventId,
              materialVersion: context.version,
              payload: json({ ...v, revision: updated.revision }),
            },
          });
          await tx.interview.update({
            where: { id: meeting.id },
            data: { calendarEventId: eventId },
          });
          result = {
            id: meeting.id,
            operationId: operation.id,
            status: "QUEUED",
          };
        } else {
          if (v.input.publish)
            await publishInvitation(tx, meeting, user.id, cancel, !!old);
          result = { id: meeting.id, status: meeting.status };
        }
      }
      await tx.actionPreview.update({
        where: { id: p.id },
        data: { usedAt: new Date(), result: json(result) },
      });
      return result;
    });
  }
  if (type === "calendar.retry") {
    const op = await db.calendarOperation.findUnique({
      where: { id: id.parse(b.id) },
    });
    if (!op || op.authorId !== user.id)
      throw new AppError("Операция недоступна.", 404);
    if (op.status === "COMPLETED") return { id: op.interviewId };
    if (op.attempts >= 3)
      throw new AppError(
        "Лимит повторов исчерпан. Сверь встречу в календаре и создай новый предпросмотр изменения.",
        409,
      );
    await db.calendarOperation.updateMany({
      where: { id: op.id, status: { in: ["FAILED", "PENDING"] } },
      data: { status: "QUEUED", leaseUntil: null },
    });
    return { id: op.interviewId };
  }
  throw new AppError("Действие не найдено.", 404);
}
async function publishInvitation(
  tx: Prisma.TransactionClient,
  i: {
    id: string;
    applicationId: string;
    scheduledAt: Date;
    durationMinutes: number;
    timezone: string;
    meetUrl: string | null;
  },
  authorId: string,
  cancel = false,
  reschedule = false,
) {
  const date = new Intl.DateTimeFormat("ru", {
    timeZone: i.timezone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(i.scheduledAt);
  await tx.message.create({
    data: {
      applicationId: i.applicationId,
      authorId,
      kind: cancel ? "INTERVIEW_CANCELLED" : "INTERVIEW",
      body: cancel
        ? `Интервью ${date} (${i.timezone}) отменено. Новое время появится в сообщениях.`
        : `${reschedule ? "Время интервью изменено:" : "Приглашаем на интервью"} ${date} (${i.timezone}), ${i.durationMinutes} мин. Ссылка: ${i.meetUrl}`,
    },
  });
  await tx.interview.update({
    where: { id: i.id },
    data: { invitationPublishedAt: new Date() },
  });
}
export async function processCalendarOperation(
  operationId: string,
  adapterOverride?: GoogleCalendarAdapter,
) {
  const token = randomUUID(),
    now = new Date();
  const claim = await db.calendarOperation.updateMany({
    where: {
      id: operationId,
      attempts: { lt: 3 },
      OR: [
        { status: "QUEUED" },
        { status: "PENDING", leaseUntil: { lt: now } },
        { status: "RUNNING", leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: "RUNNING",
      leaseToken: token,
      leaseUntil: new Date(Date.now() + 90000),
    },
  });
  if (!claim.count) return;
  const op = await db.calendarOperation.findUniqueOrThrow({
      where: { id: operationId },
    }),
    v = op.payload as unknown as MeetingPayload;
  const authorize = async () => {
    const [u, c, i] = await Promise.all([
      db.user.findUnique({ where: { id: op.authorId } }),
      db.googleConnection.findUnique({ where: { id: op.connectionId } }),
      db.interview.findUnique({
        where: { id: op.interviewId },
        include: { application: true },
      }),
    ]);
    if (
      u?.role !== "STAFF" ||
      !c ||
      c.userId !== u.id ||
      c.revision !== op.connectionRevision ||
      !i
    )
      throw new AppError("Доступ календаря изменился.", 403);
    if (
      process.env.GOOGLE_CALENDAR_TEST_ONLY === "true" &&
      (c.calendarId !== process.env.GOOGLE_TEST_CALENDAR_ID ||
        v.emails.some(
          (e) =>
            !(process.env.GOOGLE_TEST_ATTENDEES ?? "")
              .split(",")
              .map((v) => v.trim().toLowerCase())
              .includes(e.toLowerCase()),
        ))
    )
      throw new AppError(
        "Тестовый календарь или участники больше не разрешены.",
        403,
      );
    if (
      i.application.revision !== v.revision ||
      (await materialContext(db, i.applicationId)).version !==
        op.materialVersion
    )
      throw new AppError("Заявка изменилась.", 409);
    return { u, c, i };
  };
  try {
    const { c, i } = await authorize(),
      adapter = adapterOverride ?? (await adapterFor(c));
    let event = await adapter.get(op.eventId);
    if (event && event.extendedProperties?.private?.ivInterview !== i.id)
      throw new GoogleCalendarError("EVENT_OWNER");
    if (op.kind === "CANCEL") {
      await authorize();
      if (event) await adapter.cancel(op.eventId, event.etag);
      await db.$transaction(async (tx) => {
        await tx.calendarOperation.updateMany({
          where: { id: op.id, leaseToken: token },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            leaseUntil: null,
          },
        });
        await tx.interview.update({
          where: { id: i.id },
          data: { status: "CANCELLED", calendarStatus: "CANCELLED" },
        });
        if (v.input.publish) await publishInvitation(tx, i, op.authorId, true);
      });
      return;
    }
    if (!event && op.kind !== "CREATE")
      throw new GoogleCalendarError("EVENT_MISSING");
    const body = {
      summary: "Интервью inVision U",
      start: { dateTime: v.start, timeZone: v.input.timezone },
      end: { dateTime: v.end, timeZone: v.input.timezone },
      guestsCanSeeOtherGuests: false,
      guestsCanModify: false,
      extendedProperties: {
        private: { ivInterview: i.id, ivOperation: op.id },
      },
    };
    if (!event) {
      await authorize();
      event = await adapter.insert(op.eventId, op.id, body);
    }
    if (event.status === "cancelled")
      throw new GoogleCalendarError("EVENT_CANCELLED");
    if (event.conferenceData?.createRequest?.status?.statusCode === "failure")
      throw new GoogleCalendarError("CONFERENCE_FAILED");
    const meet = confirmedMeet(event);
    if (!meet) {
      // Pending conference is a bounded polling step, not another event insertion or invitation.
      const polls =
        Number((op.payload as Record<string, unknown>).polls ?? 0) + 1;
      await db.calendarOperation.updateMany({
        where: { id: op.id, leaseToken: token },
        data: {
          status: polls >= 12 ? "FAILED" : "PENDING",
          payload: json({ ...v, polls }),
          leaseUntil: new Date(Date.now() + 5000),
          errorCode: polls >= 12 ? "CONFERENCE_PENDING" : null,
        },
      });
      await db.interview.update({
        where: { id: i.id },
        data: { calendarStatus: "PENDING" },
      });
      return;
    }
    if (event.extendedProperties?.private?.ivPublished !== op.id) {
      await authorize();
      // The operation marker reconciles a network timeout after Google accepted the update.
      event = await adapter.patch(
        op.eventId,
        {
          ...body,
          attendees: v.emails.map((email) => ({ email })),
          extendedProperties: {
            private: {
              ivInterview: i.id,
              ivOperation: op.id,
              ivPublished: op.id,
            },
          },
        },
        event.etag,
        true,
      );
    }
    await authorize();
    await db.$transaction(async (tx) => {
      const locked = await tx.calendarOperation.updateMany({
        where: { id: op.id, leaseToken: token, status: "RUNNING" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          leaseUntil: null,
          errorCode: null,
        },
      });
      if (!locked.count) return;
      const updated = await tx.interview.update({
        where: { id: i.id },
        data: { calendarStatus: "READY", status: "SCHEDULED", meetUrl: meet },
      });
      if (v.input.publish)
        await publishInvitation(
          tx,
          updated,
          op.authorId,
          false,
          op.kind === "RESCHEDULE",
        );
    });
  } catch (e) {
    const code =
      e instanceof AppError
        ? e.status === 409
          ? "STALE"
          : "ACCESS"
        : e instanceof GoogleCalendarError
          ? e.code
          : "FAILED";
    await db.calendarOperation.updateMany({
      where: { id: op.id, leaseToken: token },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        errorCode: code,
        leaseUntil: null,
      },
    });
    await db.interview.update({
      where: { id: op.interviewId },
      data: { calendarStatus: code === "STALE" ? "STALE" : "FAILED" },
    });
  }
}
export async function runCalendarQueueOnce() {
  const op = await db.calendarOperation.findFirst({
    where: {
      attempts: { lt: 3 },
      OR: [
        { status: "QUEUED" },
        { status: "PENDING", leaseUntil: { lt: new Date() } },
        { status: "RUNNING", leaseUntil: { lt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (op) await processCalendarOperation(op.id);
}
