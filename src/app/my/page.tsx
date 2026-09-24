import Link from "next/link";
import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { MyPath } from "@/components/my-path";
import { UserAvatar } from "@/components/user-avatar";
import { WorkshopChoices } from "@/components/journey-actions";
import { treeView } from "@/lib/development-tree.server";
import { actor } from "@/lib/security";
import { DevelopmentTree } from "@/components/development-tree";
export default async function My({
  searchParams,
}: {
  searchParams: Promise<{ tree?: string; node?: string; view?: string }>;
}) {
  const query = await searchParams;
  const data = await myData();
  if (data?.user.role === "STAFF") redirect("/admissions");
  const tree = await treeView(await actor());
  if (data)
    return (
      <MyPath
        key={data.user.id}
        data={data}
        tree={tree}
        initialView={query.tree === "1" ? "route" : query.view}
        nodeId={query.node}
      />
    );
  if (query.tree === "1")
    return (
      <div className="page wrap candidate-journey">
        <DevelopmentTree initial={tree} selectedId={query.node} full />
      </div>
    );
  return (
    <div className="page wrap candidate-hub">
      <header className="hub-heading">
        <div className="hub-person">
          <UserAvatar size={72} />
          <div>
            <p className="eyebrow">Мой путь · без аккаунта</p>
            <h1>Начни с того, что хочется сделать</h1>
            <p>Небольшая задача, твоё решение и понятный следующий шаг.</p>
          </div>
        </div>
        <Link className="text-link" href="/login?next=/my">
          Войти к своим работам
        </Link>
      </header>
      <section className="hub-next">
        <div>
          <p className="eyebrow">Можно начать здесь · цифровые продукты</p>
          <h2>Запусти обмен учебниками</h2>
          <p>
            Построй путь от поиска книги до её передачи. Проверь, где студенту
            не хватает информации, и сохрани свой вариант.
          </p>
        </div>
        <Link className="button dark" href="/projects/digital-products">
          Открыть мини-практику
        </Link>
      </section>
      <p className="journey-boundary">
        Мастерские добровольны.{" "}
        <Link className="text-link" href="/apply">
          Сразу подать заявку
        </Link>
      </p>
      <WorkshopChoices
        exclude={["digital-products"]}
        title="Можно попробовать другое"
      />
    </div>
  );
}
