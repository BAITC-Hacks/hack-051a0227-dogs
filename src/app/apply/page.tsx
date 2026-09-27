import { intakeRules } from "@/lib/intake.server";
import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { ApplicationWizard } from "@/components/application-wizard";
import { AuthForm } from "@/components/auth-form";
export default async function Apply({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; section?: string; field?: string }>;
}) {
  const [data, params] = await Promise.all([myData(), searchParams]);
  if (!data || data.user.role === "GUEST")
    return <AuthForm register next="/apply" />;
  if (data.user.role === "STAFF") redirect("/admissions");
  if (data.application?.submittedAt) redirect("/apply/status");
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
