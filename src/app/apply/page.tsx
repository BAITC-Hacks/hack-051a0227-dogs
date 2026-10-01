import { intakeRules } from "@/lib/intake.server";
import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { ApplicationWizard } from "@/components/application-wizard";
import { actor } from "@/lib/security";
import { accessFor } from "@/lib/access.server";
export default async function Apply({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; section?: string; field?: string }>;
}) {
  const user = await actor();
  const space = await accessFor(user);
  if (space === "GUEST") {
    const q = await searchParams;
    const saved = new URLSearchParams();
    for (const key of ["program", "section", "field"] as const) if (q[key]) saved.set(key, q[key]!);
    redirect(`/login?mode=register&next=${encodeURIComponent(`/apply${saved.size ? `?${saved}` : ""}`)}`);
  }
  if (space === "RESTRICTED") redirect("/account");
  const [data, params] = await Promise.all([
    myData(),
    searchParams,
  ]);
  if (!data || data.user.role === "GUEST") redirect("/login?mode=register&next=/apply");
  if (data.user.role === "STAFF") redirect("/admissions");
  if (data.application?.submittedAt) redirect("/my?view=university");
  return (
    <ApplicationWizard
      data={data}
      selectedProgram={params.program}
      rules={await intakeRules()}
      initialSection={params.section}
      initialField={params.field}
    />
  );
}
