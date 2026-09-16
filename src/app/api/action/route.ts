import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { describeWork } from "@/lib/presentation";
import {
  audioStatus,
  changeAudioConsent,
  enqueueAudio,
  correctAudio,
  recordAudioReview,
} from "@/lib/audio-service.server";
import type { ProjectState } from "@/lib/types";
import {
  actor,
  requireUser,
  requireStaff,
  setSession,
  hashPassword,
  verifyPassword,
  AppError,
  assertApplication,
  rateLimit,
  checkOrigin,
  tokenHash,
} from "@/lib/security";
import { journeyAction } from "@/lib/journey.server";
import { reviewAction } from "@/lib/review-service.server";
import { programFor, forcedStatements } from "@/lib/catalog";
import { fieldsSchema, emptyFields, submissionIssues } from "@/lib/validation";
import type { ApplicationFields, LanguageState } from "@/lib/types";
const id = z.string().min(1).max(100);
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 100000)
      throw new AppError("Слишком большой запрос.", 413);
    const raw = await req.text();
    if (raw.length > 100000) throw new AppError("Слишком большой запрос.", 413);
    const b = JSON.parse(raw);
    const type = z.string().parse(b.type);
    let result: unknown = {};
    if (type === "register" || type === "login") {
      await rateLimit("authentication", 60);
      const v = z
        .object({
          email: z.email().max(160),
          password: z
            .string()
            .min(10, "Пароль — не меньше 10 символов.")
            .max(128),
          name: z.string().min(2).max(160).optional(),
        })
        .parse(b);
      const email = v.email.toLowerCase().trim();
      const old = await actor();
      const existing = await db.user.findUnique({ where: { email } });
      if (type === "register") {
        if (existing)
          throw new AppError(
            "Этот адрес уже зарегистрирован. Войдите в аккаунт.",
          );
        if (!v.name) throw new AppError("Укажите имя.");
        const passwordHash = await hashPassword(v.password);
        const u =
          old?.role === "GUEST"
            ? await db.user.update({
                where: { id: old.id },
                data: { email, name: v.name, passwordHash, role: "CANDIDATE" },
              })
            : await db.user.create({
                data: { email, name: v.name, passwordHash, role: "CANDIDATE" },
              });
        await setSession(u.id);
        result = { role: u.role };
      } else {
        if (
          !existing?.passwordHash ||
          !(await verifyPassword(v.password, existing.passwordHash))
        )
          throw new AppError("Почта или пароль не совпадают.", 401);
        if (old?.role === "GUEST" && existing.role === "CANDIDATE")
          await db.$transaction(async (tx) => {
            // Serialize with project saves, and preserve both owners' explicit interests.
            for (const ownerId of [old.id, existing.id].sort())
              await tx.$queryRaw`SELECT id FROM "User" WHERE id=${ownerId} FOR UPDATE`;
            await tx.projectAttempt.updateMany({
              where: { userId: old.id },
              data: { userId: existing.id },
            });
            const owners = await tx.user.findMany({
              where: { id: { in: [old.id, existing.id] } },
            });
            await tx.user.update({
              where: { id: existing.id },
              data: {
                interests: [...new Set(owners.flatMap((o) => o.interests))],
              },
            });
          });
        await setSession(existing.id);
        result = { role: existing.role };
      }
    } else if (type === "logout") {
      const jar = await cookies();
      const token = jar.get("leader_session")?.value;
      if (token)
        await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      jar.delete("leader_session");
    } else if (
      [
        "project.save",
        "project.context",
        "project.hint",
        "project.progress",
      ].includes(type)
    ) {
      result = await journeyAction(type, b);
    } else if (type === "interest") {
      const u = await requireUser();
      const slug = z.string().parse(b.slug);
      if (!programFor(slug)) throw new AppError("Направление не найдено.");
      const interests = b.enabled
        ? [...new Set([...u.interests, slug])]
        : u.interests.filter((s) => s !== slug);
      await db.user.update({ where: { id: u.id }, data: { interests } });
      result = { interests };
    } else if (type === "attempt.interest") {
      const u = await requireUser();
      const value = z.enum(["MORE", "ANOTHER", "UNDECIDED"]).parse(b.value);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`;
        const owned = await tx.projectAttempt.findFirst({
          where: { id: id.parse(b.id), userId: u.id },
        });
        if (!owned) throw new AppError("Работа недоступна.", 404);
        if (value === "MORE")
          await tx.projectAttempt.updateMany({
            where: { userId: u.id, interest: "MORE" },
            data: { interest: "UNDECIDED" },
          });
        await tx.projectAttempt.update({
          where: { id: owned.id },
          data: { interest: value },
        });
      });
    } else if (type === "application.save") {
      const u = await requireUser();
      if (u.role !== "CANDIDATE")
        throw new AppError("Заявку заполняет кандидат.", 403);
      const fields = fieldsSchema.parse(b.fields);
      const slug = z.string().parse(b.programSlug);
      if (!programFor(slug)) throw new AppError("Выберите программу.");
      const app = await db.application.findUnique({ where: { userId: u.id } });
      if (app?.submittedAt)
        throw new AppError(
          "Отправленная версия зафиксирована. Уточнения отправьте в переписке.",
          409,
        );
      if (app) {
        const rev = z.number().int().parse(b.revision);
        await db.$transaction(async (tx) => {
          const r = await tx.application.updateMany({
            where: { id: app.id, revision: rev, submittedAt: null },
            data: {
              fields: json(fields),
              programSlug: slug,
              revision: { increment: 1 },
            },
          });
          if (!r.count)
            throw new AppError(
              "Заявка изменена в другой вкладке. Обновите страницу.",
              409,
            );
          await tx.applicationVersion.create({
            data: {
              applicationId: app.id,
              revision: rev + 1,
              snapshot: json({ fields, programSlug: slug }),
              kind: "DRAFT",
            },
          });
        });
        result = { id: app.id, revision: rev + 1 };
      } else {
        const a = await db.application.create({
          data: {
            userId: u.id,
            programSlug: slug,
            fields: json(fields),
            revision: 1,
            versions: {
              create: {
                revision: 1,
                snapshot: json({ fields, programSlug: slug }),
                kind: "DRAFT",
              },
            },
          },
        });
        result = { id: a.id, revision: 1 };
      }
    } else if (type === "work.transfer") {
      const u = await requireUser();
      if (b.consent !== true)
        throw new AppError("Подтвердите передачу учебной работы.");
      const attempt = await db.projectAttempt.findFirst({
        where: { id: id.parse(b.attemptId), userId: u.id },
      });
      const app = await db.application.findUnique({ where: { userId: u.id } });
      if (!attempt || !app)
        throw new AppError(
          "Сначала сохраните работу и заполните данные заявки.",
        );
      if (app.submittedAt)
        throw new AppError("Отправленная заявка зафиксирована.", 409);
      const requestedRevision = z.number().int().positive().parse(b.revision);
      const v = await db.attemptVersion.findUnique({
        where: {
          attemptId_revision: {
            attemptId: attempt.id,
            revision: requestedRevision,
          },
        },
      });
      if (!v) throw new AppError("Выбранная версия работы недоступна.", 404);
      result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
        const current = await tx.application.findUniqueOrThrow({
          where: { id: app.id },
        });
        if (current.submittedAt)
          throw new AppError("Отправленная заявка зафиксирована.", 409);
        return tx.workTransfer.upsert({
          where: {
            applicationId_attemptId_revision: {
              applicationId: app.id,
              attemptId: attempt.id,
              revision: v.revision,
            },
          },
          create: {
            applicationId: app.id,
            attemptId: attempt.id,
            revision: v.revision,
            snapshot: json({
              slug: attempt.slug,
              context: attempt.context,
              state: v.state,
              label: "Учебное упражнение",
              conditions: attempt.conditions,
            }),
          },
          update: {},
        });
      });
    } else if (type === "application.submit") {
      const u = await requireUser();
      if (b.confirm !== true) throw new AppError("Подтвердите отправку.");
      const expectedRevision = z.number().int().parse(b.revision);
      result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE "userId"=${u.id} FOR UPDATE`;
        const app = await tx.application.findUnique({
          where: { userId: u.id },
          include: { materials: true, transfers: true },
        });
        if (!app) throw new AppError("Сначала заполните заявку.");
        if (app.submittedAt) throw new AppError("Заявка уже отправлена.", 409);
        if (app.revision !== expectedRevision)
          throw new AppError(
            "Заявка изменилась. Откройте обзор перед отправкой.",
            409,
          );
        const fields = fieldsSchema.parse(app.fields);
        const issues = submissionIssues(
          fields,
          app.materials.map((m) => m.kind),
        );
        if (issues.length) throw new AppError(issues.join(" "));
        const updated = await tx.application.updateMany({
          where: { id: app.id, revision: app.revision, submittedAt: null },
          data: {
            stage: "REVIEW",
            submittedAt: new Date(),
            revision: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new AppError("Заявка уже изменена. Обновите страницу.", 409);
        await tx.applicationVersion.create({
          data: {
            applicationId: app.id,
            revision: app.revision + 1,
            kind: "SUBMITTED",
            snapshot: json({
              fields,
              programSlug: app.programSlug,
              materialIds: app.materials.map((m) => m.id),
              transfers: app.transfers,
            }),
          },
        });
        const episode = await tx.episode.create({
          data: {
            applicationId: app.id,
            title: "Опыт из заявки",
            personalRole: fields.personalRole,
          },
        });
        await tx.source.createMany({
          data: [
            {
              applicationId: app.id,
              episodeId: episode.id,
              title: "Опыт и личная роль",
              kind: "Анкета",
              content: `${fields.experience}\n\nЛичная роль: ${fields.personalRole}`,
            },
            {
              applicationId: app.id,
              title: "Мотивация",
              kind: "Анкета",
              content: fields.motivation,
            },
            {
              applicationId: app.id,
              title: "Выбор утверждений",
              kind: "Forced-choice",
              content: `Больше похоже: ${forcedStatements[Number(fields.most)]}. Меньше похоже: ${forcedStatements[Number(fields.least)]}. Выбор не является оценкой потенциала.`,
            },
            ...(fields.videoUrl
              ? [
                  {
                    applicationId: app.id,
                    title: "Видеопрезентация по ссылке",
                    kind: "Видео (ссылка)",
                    content: fields.videoUrl,
                  },
                ]
              : []),
            ...app.transfers.map((t) => ({
              applicationId: app.id,
              title: "Учебная работа из проекта",
              kind: "Учебное упражнение",
              content:
                "Учебное упражнение. Версия " +
                t.revision +
                "\n\n" +
                describeWork(
                  (t.snapshot as { slug: string }).slug,
                  (t.snapshot as unknown as { state: ProjectState }).state,
                  (t.snapshot as { context?: string }).context,
                ),
            })),
            ...app.materials.map((m) => ({
              applicationId: app.id,
              title: m.name,
              kind:
                m.kind === "oral" || m.kind === "followup"
                  ? "Оригинал аудио"
                  : "Материал кандидата",
              content:
                "Материал приложен кандидатом. Содержание проверяется по оригиналу.",
              materialId: m.id,
            })),
          ],
        });
        await tx.message.create({
          data: {
            applicationId: app.id,
            authorId: u.id,
            kind: "RECEIPT",
            body: "Заявка передана комиссии. Отправленная версия сохранена. Ответы и следующие шаги будут в этом разделе.",
          },
        });
        return { id: app.id };
      });
    } else if (type === "message") {
      const u = await requireUser();
      const app = await assertApplication(id.parse(b.applicationId), u);
      if (!app.submittedAt)
        throw new AppError("Переписка доступна после отправки заявки.");
      const body = z.string().trim().min(3).max(5000).parse(b.body);
      result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
        const message = await tx.message.create({
          data: { applicationId: app.id, authorId: u.id, body },
        });
        if (u.role === "CANDIDATE")
          await tx.source.create({
            data: {
              applicationId: app.id,
              messageId: message.id,
              title: "Ответ в переписке",
              kind: "Уточнение кандидата",
              content: body,
            },
          });
        await tx.application.update({
          where: { id: app.id },
          data: { updatedAt: new Date() },
        });
        return message;
      });
    } else if (type === "correction") {
      const u = await requireUser();
      const source = await db.source.findUnique({
        where: { id: id.parse(b.sourceId) },
      });
      if (!source) throw new AppError("Источник недоступен.", 404);
      await assertApplication(source.applicationId, u);
      const explanation = z
        .string()
        .trim()
        .min(10)
        .max(3000)
        .parse(b.explanation);
      result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${source.applicationId} FOR UPDATE`;
        const correction = await tx.correction.create({
          data: { sourceId: source.id, authorId: u.id, explanation },
        });
        await tx.application.update({
          where: { id: source.applicationId },
          data: { updatedAt: new Date() },
        });
        return correction;
      });
    } else if (type.startsWith("audio.")) {
      const u = await requireUser();
      if (type === "audio.status")
        result = await audioStatus(id.parse(b.applicationId), u);
      else if (type === "audio.consent")
        result = await changeAudioConsent(
          id.parse(b.applicationId),
          u,
          z.boolean().parse(b.granted),
          z.number().int().min(0).parse(b.revision),
        );
      else if (type === "audio.start") {
        await rateLimit("audio:" + u.id, 10);
        const job = await enqueueAudio(
          id.parse(b.applicationId),
          u,
          z.number().int().min(0).parse(b.revision),
        );
        result = { id: job.id, status: job.status };
      } else if (type === "audio.correct") result = await correctAudio(u, b);
      else throw new AppError("Действие недоступно.", 404);
    } else if (type === "language.consent") {
      const u = await requireUser();
      const app = await db.application.findUnique({ where: { userId: u.id } });
      if (!app) throw new AppError("Сначала сохраните заявку.");
      const fields = { ...(app.fields as object), audioConsent: true };
      await db.$transaction(async (tx) => {
        const updated = await tx.application.updateMany({
          where: { id: app.id, revision: app.revision },
          data: { fields: json(fields), revision: { increment: 1 } },
        });
        if (!updated.count)
          throw new AppError("Заявка изменилась. Повторите действие.", 409);
        await tx.applicationVersion.create({
          data: {
            applicationId: app.id,
            revision: app.revision + 1,
            kind: "AUDIO_CONSENT",
            snapshot: json({
              consent: "Разрешаю запись и проверку устного ответа",
              consentedAt: new Date().toISOString(),
              fields,
            }),
          },
        });
      });
    } else if (type === "language.save") {
      const u = await requireUser();
      const app = await db.application.findUnique({ where: { userId: u.id } });
      if (!app) throw new AppError("Сначала сохраните данные заявки.");
      const f = app.fields as unknown as ApplicationFields;
      if (!f.audioConsent)
        throw new AppError("Подтвердите согласие на запись голоса в заявке.");
      const state = z
        .object({
          comprehension: z.string().max(30),
          oralId: z.string().max(100),
          followupId: z.string().max(100),
          writtenNote: z.string().max(2000),
        })
        .parse(b.state);
      for (const [kind, mid] of [
        ["oral", state.oralId],
        ["followup", state.followupId],
      ])
        if (
          mid &&
          !(await db.material.findFirst({
            where: { id: mid, userId: u.id, applicationId: app.id, kind },
          }))
        )
          throw new AppError("Запись недоступна.", 404);
      if (
        b.finish &&
        (!state.oralId || !state.followupId || !state.comprehension)
      )
        throw new AppError("Ответьте на вопрос и сохраните обе записи.");
      const existing = await db.languageCheck.findUnique({
        where: { applicationId: app.id },
      });
      const status = b.finish ? "PENDING_REVIEW" : "IN_PROGRESS";
      const outcome = b.finish
        ? "Ожидает проверки сотрудником"
        : "Ответ сохраняется";
      const comprehensionFeedback = state.comprehension
        ? state.comprehension === "later"
          ? "Верно: начало перенесено, потому что зал освободится позже."
          : "Вернитесь к сообщению: изменилось время доступности зала."
        : "Выберите ответ по содержанию сообщения.";
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
        if (existing) {
          const rev = z.number().int().parse(b.revision);
          const r = await tx.languageCheck.updateMany({
            where: { id: existing.id, revision: rev },
            data: {
              state: json(state),
              status,
              result: outcome,
              reviewerId: null,
              reviewedAt: null,
              revision: { increment: 1 },
            },
          });
          if (!r.count)
            throw new AppError(
              "Ответ изменён в другой вкладке. Обновите страницу.",
              409,
            );
          await tx.languageVersion.create({
            data: {
              checkId: existing.id,
              revision: rev + 1,
              state: json(state),
              authorId: u.id,
            },
          });
          result = { revision: rev + 1, comprehensionFeedback };
        } else {
          const check = await tx.languageCheck.create({
            data: {
              applicationId: app.id,
              state: json(state),
              status,
              result: outcome,
              revision: 1,
            },
          });
          await tx.languageVersion.create({
            data: {
              checkId: check.id,
              revision: 1,
              state: json(state),
              authorId: u.id,
            },
          });
          result = { revision: 1, comprehensionFeedback };
        }
        await tx.audioJob.updateMany({
          where: {
            applicationId: app.id,
            status: {
              in: ["QUEUED", "TRANSCRIBING", "SUMMARIZING", "RETRY_WAIT"],
            },
            OR: [
              { oralId: { not: state.oralId } },
              { followupId: { not: state.followupId } },
            ],
          },
          data: {
            status: "SUPERSEDED",
            errorCode: "SUPERSEDED",
            leaseToken: null,
            leaseUntil: null,
          },
        });
      });
    } else if (type === "language.review") {
      const u = await requireStaff();
      const app = await assertApplication(id.parse(b.applicationId), u);
      const check = await db.languageCheck.findUnique({
        where: { applicationId: app.id },
      });
      if (!check)
        throw new AppError("Кандидат ещё не сохранил языковой ответ.");
      const resultText = z.string().trim().min(15).max(3000).parse(b.result);
      const state = check.state as unknown as LanguageState;
      if (!state.oralId || !state.followupId)
        throw new AppError(
          "Для оценки устного ответа необходимы оригиналы обеих записей.",
        );
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
        if (b.audio)
          await recordAudioReview(
            tx,
            app.id,
            u.id,
            check.revision + 1,
            resultText,
            b.audio,
          );
        const r = await tx.languageCheck.updateMany({
          where: { id: check.id, revision: z.number().int().parse(b.revision) },
          data: {
            status: "REVIEWED",
            result: resultText,
            reviewerId: u.id,
            reviewedAt: new Date(),
            revision: { increment: 1 },
          },
        });
        if (!r.count)
          throw new AppError("Языковой ответ изменён. Обновите страницу.", 409);
        await tx.languageVersion.create({
          data: {
            checkId: check.id,
            revision: check.revision + 1,
            authorId: u.id,
            state: json({
              response: check.state,
              result: resultText,
              reviewedBy: u.id,
            }),
          },
        });
      });
    } else if (
      type.startsWith("review.") ||
      type.startsWith("feedback.") ||
      type === "assessment" ||
      type === "decision" ||
      type.startsWith("interview.")
    ) {
      result = await reviewAction(type, b, await requireStaff());
    } else if (type === "settings") {
      await requireStaff();
      const guidance = z.string().trim().min(40).max(5000).parse(b.guidance);
      const old = await db.setting.findUniqueOrThrow({
        where: { key: "rubric" },
      });
      const value = old.value as { version: number; guidance: string };
      await db.setting.update({
        where: { key: "rubric" },
        data: {
          value: json({
            version: value.version + 1,
            guidance,
            previous: old.value,
          }),
        },
      });
    } else if (type === "application.init") {
      const u = await requireUser();
      if (u.role !== "CANDIDATE")
        throw new AppError("Заявку заполняет кандидат.", 403);
      const existing = await db.application.findUnique({
        where: { userId: u.id },
      });
      result =
        existing ??
        (await db.application.create({
          data: {
            userId: u.id,
            programSlug: "digital-products",
            fields: json({
              ...emptyFields,
              name: u.name,
              email: u.email ?? "",
            }),
          },
        }));
    } else throw new AppError("Действие не найдено.", 404);
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          ok: false,
          error:
            error.issues.find((i) => /[А-Яа-я]/.test(i.message))?.message ??
            "Проверьте заполнение полей и допустимый размер ответа.",
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { ok: false, error: "Не удалось прочитать запрос." },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return NextResponse.json(
        { ok: false, error: "Запись уже существует. Обновите страницу." },
        { status: 409 },
      );
    console.error(
      "Action failed",
      error instanceof Error ? error.name : "Unknown",
    );
    return NextResponse.json(
      { ok: false, error: "Сохранение прервалось. Повторите попытку." },
      { status: 500 },
    );
  }
}
