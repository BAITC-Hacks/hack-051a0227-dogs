import { redirect } from "next/navigation";
import { audioStatus } from "@/lib/audio-service.server";
import { myData } from "@/lib/data";
import type { ApplicationFields } from "@/lib/types";
import { LanguageWorkspace } from "@/components/language";
export default async function English() {
  const data = await myData();
  if (!data || data.user.role === "GUEST") redirect("/login?next=/apply");
  if (!data.application) redirect("/apply");
  return (
    <LanguageWorkspace
      key={String(
        (data.application.fields as unknown as ApplicationFields).audioConsent,
      )}
      applicationId={data.application.id}
      userId={data.user.id}
      submitted={!!data.application.submittedAt}
      audio={await audioStatus(data.application.id, data.user)}
      check={data.application.language}
      consented={
        (data.application.fields as unknown as ApplicationFields).audioConsent
      }
    />
  );
}
