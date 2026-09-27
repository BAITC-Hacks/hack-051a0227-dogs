import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { MyPath } from "@/components/my-path";
import { treeView } from "@/lib/development-tree.server";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";

export default async function My({
  searchParams,
}: {
  searchParams: Promise<{ tree?: string; node?: string; view?: string }>;
}) {
  const user = await actor();
  const space = await accessFor(user);
  if (space !== "FULL") {
    const q = await searchParams;
    const saved = new URLSearchParams();
    for (const key of ["tree", "node", "view"] as const)
      if (q[key]) saved.set(key, q[key]!);
    const target = `/my${saved.size ? `?${saved}` : ""}`;
    redirect(
      space === "GUEST"
        ? `/login?next=${encodeURIComponent(target)}`
        : startRoute(space),
    );
  }
  const [query, data, tree] = await Promise.all([
    searchParams,
    myData(),
    treeView(user),
  ]);
  if (query.view === "profile") redirect("/account");
  if (!data) redirect("/login?next=/my");
  return (
    <MyPath
      key={data.user.id}
      data={data}
      tree={tree}
      initialView={query.tree === "1" ? "route" : query.view}
      nodeId={query.node}
    />
  );
}
