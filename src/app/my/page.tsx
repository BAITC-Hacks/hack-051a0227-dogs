import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { myData } from "@/lib/data";
import { MyPath } from "@/components/my-path";
export default async function My() {
  const data = await myData();
  if (!data)
    return (
      <div className="page wrap">
        <div className="page-title">
          <div>
            <h1>У твоего пути будет своя история</h1>
            <p>Начни проект — работа сохранится здесь.</p>
          </div>
        </div>
        <div className="next-step">
          <h2>Первый шаг — твоё действие.</h2>
          <p>
            Для первой пробы аккаунт не нужен. Можно сразу приступить или войти,
            чтобы продолжить сохранённую работу.
          </p>
          <div className="row">
            <Link className="button dark" href="/projects/digital-products">
              Начать проект <ArrowUpRight size={18} />
            </Link>
            <Link className="button secondary" href="/login">
              Войти
            </Link>
          </div>
        </div>
      </div>
    );
  return <MyPath data={data} />;
}
