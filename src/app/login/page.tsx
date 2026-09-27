import { AuthForm } from "@/components/auth-form";
import { actor } from "@/lib/security";
import { accessFor, permittedReturnTo } from "@/lib/access.server";
import { redirect } from "next/navigation";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; staff?: string; next?: string }>;
}) {
  const p = await searchParams;
  const space = await accessFor(await actor());
  if (space !== "GUEST") redirect(permittedReturnTo(p.next, space));
  const next = p.next ?? "";
  return (
    <AuthForm
      register={p.mode === "register"}
      staff={p.staff === "1"}
      next={next}
    />
  );
}
