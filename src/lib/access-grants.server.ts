import "server-only";
import { z } from "zod";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";

export async function accessGrantAction(
  type: string,
  body: Record<string, unknown>,
  staff: User,
) {
  if (staff.role !== "STAFF")
    throw new AppError("Действие доступно сотруднику.", 403);
  if (type === "access.find") {
    const key = z.string().trim().min(3).max(160).parse(body.identifier);
    const user = await db.user.findFirst({
      where: {
        role: "CANDIDATE",
        OR: [{ id: key }, { email: key.toLowerCase() }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneE164: true,
        phoneVerifiedAt: true,
        application: { select: { submittedAt: true } },
        accessGrants: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reason: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            issuedBy: { select: { name: true } },
          },
        },
      },
    });
    if (!user) throw new AppError("Кандидат не найден.", 404);
    return user;
  }
  if (type === "access.grant") {
    const userId = z.string().min(1).max(100).parse(body.userId);
    const reason = z.string().trim().min(10).max(500).parse(body.reason);
    const confirmName = z.string().parse(body.confirmName);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== "CANDIDATE" || user.name !== confirmName)
        throw new AppError(
          "Данные кандидата изменились. Найдите его снова.",
          409,
        );
      const active = await tx.candidateAccessGrant.findFirst({
        where: {
          userId,
          scope: "FULL_CABINET",
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (active) return { id: active.id, alreadyGranted: true };
      return tx.candidateAccessGrant.create({
        data: { userId, issuedById: staff.id, reason, scope: "FULL_CABINET" },
        select: { id: true, createdAt: true },
      });
    });
  }
  if (type === "access.revoke") {
    const grantId = z.string().min(1).max(100).parse(body.grantId);
    const grant = await db.candidateAccessGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new AppError("Разрешение не найдено.", 404);
    await db.candidateAccessGrant.updateMany({
      where: { id: grantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: staff.id },
    });
    return { revoked: true };
  }
  if (type === "access.phone.verify" || type === "access.phone.revoke") {
    const userId = z.string().min(1).max(100).parse(body.userId);
    const confirmName = z.string().parse(body.confirmName);
    const reason = z.string().trim().min(12).max(500).parse(body.reason);
    const normalized =
      type === "access.phone.verify"
        ? z
            .string()
            .regex(/^\+[1-9]\d{9,14}$/)
            .parse(String(body.phone).replace(/[\s()-]/g, ""))
        : null;
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== "CANDIDATE" || user.name !== confirmName)
        throw new AppError(
          "Данные кандидата изменились. Найдите его снова.",
          409,
        );
      if (normalized) {
        const used = await tx.user.findFirst({
          where: {
            phoneE164: normalized,
            phoneVerifiedAt: { not: null },
            id: { not: userId },
          },
        });
        if (used)
          throw new AppError(
            "Этот номер уже привязан к другому аккаунту.",
            409,
          );
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          phoneE164: normalized,
          phoneVerifiedAt: normalized ? new Date() : null,
        },
      });
      await tx.verifiedPhoneEvent.create({
        data: {
          userId,
          staffId: staff.id,
          phoneE164: normalized,
          action: normalized ? "VERIFIED" : "REVOKED",
          reason,
        },
      });
      return { verified: !!normalized };
    });
  }
  throw new AppError("Действие не найдено.", 404);
}
