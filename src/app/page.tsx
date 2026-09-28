import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { accessFor, startRoute } from "@/lib/access.server";

export default async function Home() {
  const space = await accessFor(await actor());
  if (space !== "GUEST") redirect(startRoute(space));
  return (
    <div className="home intake-landing">
      <section className="home-welcome">
        <div className="welcome-art" aria-hidden="true" />
        <div className="hero wrap mission-hero">
          <div className="hero-copy">
            <p className="eyebrow">Поступление в университет</p>
            <h1>
              Твоё поступление в <span className="lime-mark">inVision U</span>
            </h1>
            <p className="hero-intro">
              Расскажи о себе и своём опыте. Следи за рассмотрением заявки и
              готовься к следующим этапам вместе с Vision.
            </p>
            <div className="hero-actions">
              <Link
                href="/login?mode=register&next=/apply"
                className="button primary large"
              >
                Подать заявку
              </Link>
              <Link href="/login" className="button secondary large">
                Уже есть аккаунт
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="wrap landing-facts">
        <section>
          <span className="landing-number">01</span>
          <h2>Как проходит поступление</h2>
          <p>
            Заполни сведения об образовании, опыте и выбранной программе. Перед
            отправкой проверь заявку и материалы. Следующие действия появятся в
            личном кабинете.
          </p>
        </section>
        <section>
          <span className="landing-number">02</span>
          <h2>Что будет в личном кабинете</h2>
          <p>
            Статус заявки, сообщения университета, приглашение на интервью и
            рекомендации по подготовке собраны в «Моём пути».
          </p>
        </section>
        <section>
          <span className="landing-number">03</span>
          <h2>Знакомство с inVision World</h2>
          <p>
            После подачи можно по желанию открыть дерево навыков,
            сохранить собственную работу и развивать навыки. Это не обязательная
            часть отбора.
          </p>
        </section>
      </div>
    </div>
  );
}
