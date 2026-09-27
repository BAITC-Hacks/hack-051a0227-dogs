import "server-only";
import { db } from "./db";

export type StaffAlert = { id: string; title: string; detail: string; href: string };

export async function staffAlerts(): Promise<StaffAlert[]> {
  const [replies, reviews, languages] = await Promise.all([
    db.message.findMany({
      where: { author: { role: "CANDIDATE" }, replyToId: { not: null }, application: { submittedAt: { not: null } } },
      include: { application: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 4,
    }),
    db.reReviewCase.findMany({
      where: { status: "OPEN" }, include: { application: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 3,
    }),
    db.languageCheck.findMany({
      where: { status: "PENDING_REVIEW" }, include: { application: { include: { user: { select: { name: true } } } } },
      orderBy: { id: "desc" }, take: 3,
    }),
  ]);
  return [
    ...replies.map((item) => ({ id: `reply-${item.id}`, title: "Ответ кандидата", detail: item.application.user.name, href: `/admissions/candidates/${item.applicationId}#candidate-messages` })),
    ...reviews.map((item) => ({ id: `review-${item.id}`, title: "Нужна проверка материалов", detail: item.application.user.name, href: `/admissions/candidates/${item.applicationId}#sources` })),
    ...languages.map((item) => ({ id: `language-${item.id}`, title: "Английский ожидает проверки", detail: item.application.user.name, href: `/admissions/candidates/${item.applicationId}#sources` })),
  ].slice(0, 8);
}
