import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { collectProfile } from "./profile-context.server";
import { materialContext } from "./review-service.server";
import { digest } from "./scoring-input.server";
import { unansweredQuestions } from "./message-state";
import {
  deskConsentSchema,
  deskTools,
  deskVersion,
  deskSourceKinds,
  type DeskInput,
} from "./vision-desk-contract";
export async function deskInput(
  user: User,
  applicationId: string,
  provider: "local" | "openai",
): Promise<DeskInput> {
  if (user.role !== "STAFF")
    throw new AppError("Vision Desk доступен сотруднику комиссии.", 403);
  const app = await assertApplication(applicationId, user);
  if (!app.submittedAt)
    throw new AppError("Сначала нужна отправленная версия заявки.", 404);
  // One local organisation. This server-bound application scope is never supplied by a model.
  const c = await collectProfile(user, { applicationId });
  const consent = deskConsentSchema.safeParse(app.deskConsent);
  if (provider === "openai" && (!consent.success || !consent.data.granted))
    throw new AppError(
      "Нет действующего разрешения кандидата на внешнюю фактическую подготовку.",
      403,
    );
  const allowed = c.sources.filter(
    (s) =>
      ["source", "clarification"].includes(s.group) &&
      deskSourceKinds.includes(s.kind) &&
      s.current &&
      s.key.startsWith("source:") &&
      (!consent.success ||
        provider === "local" ||
        consent.data.sourceIds.includes(s.key.slice(7))),
  );
  // Do not send files, audio, language, private work, chat, scores or hidden rubrics to the text operation.
  const sources = allowed.slice(-12).map((s) => ({
    key: s.key,
    version: s.version,
    title: s.title,
    quote: s.text.slice(0, 1800),
    origin: s.origin,
    sourceId: s.key.slice(7),
  }));
  const [messages, meetings, material, person] = await Promise.all([
    db.message.findMany({
      where: { applicationId },
      include: { author: { select: { role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.interview.findMany({
      where: { applicationId },
      orderBy: { scheduledAt: "asc" },
    }),
    materialContext(db, applicationId),
    db.user.findUniqueOrThrow({
      where: { id: app.userId },
      select: { name: true },
    }),
  ]);
  const pending = unansweredQuestions(messages).length > 0;
  const human = c.sources
    .filter((s) => s.current && ["human", "review"].includes(s.group))
    .map((s) => ({
      key: s.key,
      version: s.version,
      text: s.text.slice(0, 1200),
      title: s.title,
      origin: s.origin,
      sourceIds: s.dependencies
        .filter((d) => sources.some((r) => r.key === d.key))
        .map((d) => d.key.slice(7)),
    }));
  const tasks = [
    ...(pending ? ["Ожидается ответ кандидата на опубликованный вопрос."] : []),
    ...(!human.length ? ["Человеческое заключение ещё не зафиксировано."] : []),
    ...(meetings.some((i) => i.status === "SCHEDULED")
      ? [
          "Есть назначенная встреча: подготовьте вопросы, не отмечая её состоявшейся.",
        ]
      : []),
    ...(allowed.some((s) => s.group === "clarification")
      ? ["Есть ответы на уточнения: сверьте их с исходной версией."]
      : []),
  ];
  const result = {
    instructionVersion: deskVersion,
    applicationId,
    candidateName: person.name,
    materialVersion: material.version,
    sources,
    human,
    tasks,
    meetings: meetings.map((i) => ({
      id: i.id,
      revision: i.revision,
      scheduledAt: i.scheduledAt.toISOString(),
      status: i.status,
    })),
    pending,
    hasReply: messages.some(
      (m) => m.replyToId && m.author.role === "CANDIDATE",
    ),
    provider,
    consentRevision: consent.success ? consent.data.revision : 0,
  };
  return {
    ...result,
    hash: digest(result),
    operations: deskTools.map((tool, i) => ({
      tool,
      result: [
        "Отправленная заявка доступна",
        `${sources.length} разрешённых фрагментов`,
        `${human.length} человеческих заключений`,
        `${tasks.length} рабочих задач`,
        `${meetings.length} встреч приложения`,
        "Подготовлены собственные черновики",
      ][i],
    })),
  };
}
