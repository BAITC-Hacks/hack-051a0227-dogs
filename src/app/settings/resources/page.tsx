import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { resourceCatalog } from "@/lib/learning-resources.server";
import { ResourceEditor } from "@/components/resource-editor";
export default async function Resources() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  return <ResourceEditor initial={await resourceCatalog()} />;
}
