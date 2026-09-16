import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
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
          Пять небольших задач знакомят с разными видами работы. Результат
          останется твоим.
        </p>
      </header>
      <section className="journey-next">
        <div>
          <p className="eyebrow">Можно начать здесь</p>
          <h2>Помоги человеку пройти регистрацию</h2>
          <p>
            Переставь экраны и проверь маршрут посетителя, у которого нет
            телефона.
          </p>
        </div>
        <div className="journey-primary">
          <Link className="button dark" href="/projects/digital-products">
            Проверить маршрут сервиса <ArrowUpRight size={18} />
          </Link>
          <Link className="text-link" href="/apply">
            Сразу подать заявку
          </Link>
        </div>
      </section>
      <p className="journey-boundary">
        Мастерские — знакомство с деятельностью, а не скрытый экзамен. Проходить
        все пять для поступления не нужно.{" "}
        <Link className="text-link" href="/login">
          Войти к своим работам
        </Link>
      </p>
      <WorkshopChoices />
    </div>
  );
}
