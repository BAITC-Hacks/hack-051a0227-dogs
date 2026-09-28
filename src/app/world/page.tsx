import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";
import WorldGame from "@/components/world-game";

export default async function World() {
  const space = await accessFor(await actor());
  if (space !== "FULL")
    redirect(space === "GUEST" ? "/login?next=/world" : startRoute(space));
  return <WorldGame />;
}
