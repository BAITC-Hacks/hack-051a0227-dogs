import type { PrismaClient } from "@prisma/client";

/** Give an isolated test account the same explicit, auditable access as an invited user. */
export async function grantQaAccess(db: PrismaClient, email: string) {
  const staff = await db.user.findUniqueOrThrow({
    where: { email: "admissions@invision.local" },
    select: { id: true },
  });
  const user = await db.user.update({
    where: { email },
    data: { origin: "QA" },
    select: { id: true },
  });
  await db.candidateAccessGrant.create({
    data: {
      userId: user.id,
      issuedById: staff.id,
      scope: "FULL_CABINET",
      reason: "Изолированная проверка ранее предоставленного доступа",
    },
  });
  return user.id;
}
