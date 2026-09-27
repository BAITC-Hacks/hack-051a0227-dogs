import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actor, tokenHash } from "@/lib/security";
import { db } from "@/lib/db";
import { accessFor, startRoute } from "@/lib/access.server";
import { AccountSecurity } from "@/components/account-security";
import { AvatarEditor } from "@/components/avatar-editor";
import { avatarIdentity } from "@/lib/avatar";

export default async function Account() {
  const user = await actor();
  if (!user || user.role === "GUEST") redirect("/login?next=/account");
  const sessionToken = (await cookies()).get("leader_session")?.value;
  const [passkeys, sessions, space] = await Promise.all([
    db.passkey.findMany({
      where: { userId: user.id },
      select: {
        credentialId: true,
        name: true,
        createdAt: true,
        usedAt: true,
        backedUp: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: { tokenHash: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
    accessFor(user),
  ]);
  return (
    <div className="page wrap account-page">
      <div className="page-title">
        <div>
          <h1>Аккаунт и безопасность</h1>
          <p>Личные данные и способы входа в кабинет.</p>
        </div>
        <a className="button secondary" href={startRoute(space)}>
          Вернуться
        </a>
      </div>
      <div className="account-profile">
        <AvatarEditor user={{ ...avatarIdentity(user), name: user.name }} />
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <p>
            ID кандидата: <strong>{user.id}</strong>
          </p>
          {user.phoneVerifiedAt && (
            <p>Подтверждённый телефон: {user.phoneE164}</p>
          )}
        </div>
      </div>
      <AccountSecurity
        passkeys={passkeys.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
          usedAt: p.usedAt?.toISOString() ?? null,
        }))}
        sessions={sessions.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          current: sessionToken
            ? s.tokenHash === tokenHash(sessionToken)
            : false,
        }))}
      />
    </div>
  );
}
