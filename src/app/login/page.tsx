import { AuthForm } from "@/components/auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; staff?: string; next?: string }>;
}) {
  const p = await searchParams;
  const next =
    p.next?.startsWith("/") && !p.next.startsWith("//") ? p.next : "/my";
  return (
    <AuthForm
      register={p.mode === "register"}
      staff={p.staff === "1"}
      next={next}
    />
  );
}
