import { actor } from "@/lib/security";
import { queueData } from "@/lib/data";
import { AuthForm } from "@/components/auth-form";
import { AdmissionsQueue } from "@/components/admissions-queue";
export default async function Admissions() {
  const u = await actor();
  if (u?.role !== "STAFF") return <AuthForm staff />;
  return <AdmissionsQueue applications={await queueData()} />;
}
