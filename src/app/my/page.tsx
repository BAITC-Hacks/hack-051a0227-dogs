import Link from "next/link";
import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { MyPath } from "@/components/my-path";
import { WorkshopChoices } from "@/components/journey-actions";
import { treeView } from "@/lib/development-tree.server";
import { actor } from "@/lib/security";
import { DevelopmentTree } from "@/components/development-tree";
export default async function My({
  searchParams,
}: {
  searchParams: Promise<{ tree?: string; node?: string }>;
}) {
  const query = await searchParams;
  const data = await myData();
  if (data?.user.role === "STAFF") redirect("/admissions");
  const tree = await treeView(await actor());
  if (query.tree === "1")
    return (
      <div className="page wrap candidate-journey">
        <DevelopmentTree key={query.node ?? "tree"} initial={tree} selectedId={query.node} full />
      </div>
    );
  if (data) return <MyPath data={data} tree={tree} />;
  return (
    <div className="page wrap candidate-journey">
      <header className="journey-heading">
        <p className="eyebrow">inVision U · начни без аккаунта</p>
        <h1>
          Сначала сделай.
          <br />
          Потом выбирай направление.
        </h1>
        <p>
          Пять задач знакомят с разными видами работы. В каждой можно проверить
          и пересмотреть своё решение.
        </p>
      </header>
      <section className="journey-next">
        <div>
          <p className="eyebrow">Можно начать здесь</p>
          <h2>Выбери задачу, которую хочется решить</h2>
          <p>
            Запусти обмен учебниками, собери робота, подготовь репортаж, проведи
            исследование или составь план центра.
          </p>
        </div>
        <div className="journey-primary">
          <Link className="button dark" href="/#projects">
            Выбрать задачу
          </Link>
          <Link className="text-link" href="/apply">
            Сразу подать заявку
          </Link>
        </div>
      </section>
      <p className="journey-boundary">
        Мастерские знакомят с деятельностью и не являются скрытым экзаменом.
        Проходить все пять для поступления не нужно.{" "}
        <Link className="text-link" href="/login">
          Войти к своим работам
        </Link>
      </p>
      <DevelopmentTree initial={tree} />
      <WorkshopChoices />
    </div>
  );
}
