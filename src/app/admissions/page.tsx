import { actor } from "@/lib/security";
import { queueData } from "@/lib/data";
import { AuthForm } from "@/components/auth-form";
import { AdmissionsQueue } from "@/components/admissions-queue";
import { queueFilters } from "@/lib/queue-location";
export default async function Admissions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const u = await actor();
  if (u?.role !== "STAFF") return <AuthForm staff />;
  const initialFilters = queueFilters(await searchParams);
  const applications = await queueData();
  return (
    <AdmissionsQueue
      key={JSON.stringify(initialFilters)}
      initialFilters={initialFilters}
      applications={applications}
    />
  );
}
