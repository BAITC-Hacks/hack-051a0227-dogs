import { notFound, redirect } from "next/navigation";
import { actor, AppError, assertApplication } from "@/lib/security";
import { db } from "@/lib/db";
import { twinList, twinView } from "@/lib/twin-service.server";
import { TwinWorkspace } from "@/components/twin-workspace";

export default async function Stability({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ audit?: string }>;
}) {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  const { id } = await params,
    { audit } = await searchParams;
  let data;
  try {
    await assertApplication(id, user);
    const app = await db.application.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { name: true } } },
    });
    const list = await twinList(id, user);
    const initial = audit ? await twinView(id, audit, user) : null;
    data = { name: app.user.name, list, initial };
  } catch (e) {
    if (e instanceof AppError && [403, 404].includes(e.status)) notFound();
    throw e;
  }
  return (
    <TwinWorkspace
      key={audit ?? "choose"}
      applicationId={id}
      name={data.name}
      list={data.list}
      initial={data.initial}
    />
  );
}
