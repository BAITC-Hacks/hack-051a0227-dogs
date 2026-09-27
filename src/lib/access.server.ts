import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { actor, AppError } from "./security";

export type AccessSpace =
  "GUEST" | "APPLICATION" | "FULL" | "STAFF" | "RESTRICTED";

export async function accessFor(user: User | null): Promise<AccessSpace> {
  if (!user || user.role === "GUEST") return "GUEST";
  if (user.role === "STAFF") return "STAFF";
  if (user.role !== "CANDIDATE") return "RESTRICTED";
  const [submitted, grant] = await Promise.all([
    db.application.findFirst({
      where: {
        userId: user.id,
        submittedAt: { not: null },
        versions: { some: { kind: "SUBMITTED" } },
      },
      select: { id: true },
    }),
    db.candidateAccessGrant.findFirst({
      where: {
        userId: user.id,
        scope: "FULL_CABINET",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    }),
  ]);
  return submitted || grant ? "FULL" : "APPLICATION";
}

export function startRoute(space: AccessSpace) {
  switch (space) {
    case "STAFF":
      return "/admissions";
    case "FULL":
      return "/my";
    case "APPLICATION":
      return "/apply";
    case "RESTRICTED":
      return "/account";
    default:
      return "/";
  }
}

export function permittedReturnTo(value: unknown, space: AccessSpace) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n\0]/.test(value) ||
    value.length > 500
  )
    return startRoute(space);
  const parsed = new URL(value, "http://local.invalid");
  if (
    parsed.origin !== "http://local.invalid" ||
    parsed.pathname.includes("..")
  )
    return startRoute(space);
  const path = parsed.pathname;
  if (space === "STAFF")
    return /^\/admissions(?:\/|$)/.test(path) ||
      /^\/settings(?:\/|$)/.test(path)
      ? value
      : "/admissions";
  if (space === "APPLICATION")
    return /^\/apply(?:\/|$)/.test(path) || /^\/account(?:\/|$)/.test(path)
      ? value
      : "/apply";
  if (space === "FULL")
    return /^\/(?:my|world|apply|projects|programs|account)(?:\/|$)/.test(path)
      ? value
      : "/my";
  return startRoute(space);
}

export async function requireFullCandidate() {
  const user = await actor();
  if (!user) throw new AppError("Войдите в аккаунт, чтобы продолжить.", 401);
  if ((await accessFor(user)) !== "FULL")
    throw new AppError("Этот раздел откроется после подачи заявки.", 403);
  return user;
}
