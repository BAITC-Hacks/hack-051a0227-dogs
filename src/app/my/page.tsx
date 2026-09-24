import Link from "next/link";
import { redirect } from "next/navigation";
import { myData } from "@/lib/data";
import { MyPath } from "@/components/my-path";
import { WorkshopChoices } from "@/components/journey-actions";
export default async function My() {
  const data = await myData();
  if (data?.user.role === "STAFF") redirect("/admissions");
  if (data) return <MyPath data={data} />;
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
            Запусти обмен учебниками, собери робота, подготовь репортаж,
            проведи исследование или составь план центра.
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
        Мастерские знакомят с деятельностью и не являются скрытым экзаменом. Проходить
        все пять для поступления не нужно.{" "}
        <Link className="text-link" href="/login">
          Войти к своим работам
        </Link>
      </p>
      <WorkshopChoices />
    </div>
  );
}
