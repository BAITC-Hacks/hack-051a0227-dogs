import "server-only";
import type { Prisma, User } from "@prisma/client";
import { AppError } from "./security";
export async function saveApplicationMessage(
  tx: Prisma.TransactionClient,
  user: User,
  applicationId: string,
  body: string,
  replyToId: string | null = null,
) {
  const app = await tx.application.findUnique({ where: { id: applicationId } });
  if (!app?.submittedAt || (user.role !== "STAFF" && app.userId !== user.id))
    throw new AppError("Переписка недоступна.", 404);
  if (replyToId) {
    const q = await tx.message.findFirst({
      where: {
        id: replyToId,
        applicationId,
        kind: { in: ["QUESTION", "MESSAGE"] },
        author: { role: "STAFF" },
      },
    });
    if (!q || user.role !== "CANDIDATE")
      throw new AppError("Вопрос недоступен для ответа.", 404);
  }
  const message = await tx.message.create({
    data: {
      applicationId,
      authorId: user.id,
      body,
      replyToId,
      kind: user.role === "STAFF" ? "QUESTION" : "MESSAGE",
    },
  });
  if (user.role === "CANDIDATE")
    await tx.source.create({
      data: {
        applicationId,
        messageId: message.id,
        title: "Ответ в переписке",
        kind: "Уточнение кандидата",
        content: body,
      },
    });
  await tx.application.update({
    where: { id: applicationId },
    data: { updatedAt: new Date() },
  });
  return message;
}
