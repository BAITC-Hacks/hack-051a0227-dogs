import Link from "next/link";
import { programs } from "@/lib/catalog";
import { missions } from "@/lib/missions";
import { MissionVisual } from "@/components/mission-visual";
import { InvisionIllustration } from "@/components/invision-illustration";
export default function Home() {
  return (
    <div className="home">
      <section className="hero wrap mission-hero">
        <div className="hero-copy">
          <h1>
            Найди своё направление в{" "}
            <span className="lime-mark">inVision U</span>
          </h1>
          <p className="hero-intro">
            Попробуй задачи пяти программ. Получи рекомендации: что изучить
            подробнее, какие навыки потренировать и как продолжить поступление.
          </p>
          <div className="hero-actions">
            <Link href="#projects" className="button primary large">
              Начать
            </Link>
            <Link href="/apply" className="button secondary large">
              Подать заявку
            </Link>
          </div>
          <p className="subtle">
            Начни без аккаунта. Выбери одну задачу или попробуй несколько.
          </p>
        </div>
        <figure className="mission-hero-art">
          <InvisionIllustration asset="project-studio" hero />
          <figcaption>
            Пространство для идей, проб и собственных проектов.
          </figcaption>
        </figure>
      </section>
      <section className="wrap mission-selection" id="projects">
        <div className="section-heading">
          <h2>Какую задачу попробуешь?</h2>
          <p>
            В каждой есть команда, ограничения и новый факт. Твоё решение можно
            проверить и изменить.
          </p>
        </div>
        <div className="mission-entry-grid">
          {programs.map((p) => (
            <article className="mission-entry" key={p.slug}>
              <MissionVisual slug={p.slug} />
              <div>
                <p className="mission-program-name">{p.title}</p>
                <h3>{missions[p.slug].title}</h3>
                <p>{missions[p.slug].goal}</p>
                <Link className="button secondary" href={`/projects/${p.slug}`}>
                  Начать
                  <span className="screen-reader-only">
                    : {missions[p.slug].title}
                  </span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="wrap mission-process">
        <div>
          <p className="eyebrow">После практики</p>
          <h2>Работа остаётся с тобой. Выбери, как продолжить.</h2>
        </div>
        <div className="mission-process-copy">
          <p>
            В «Моём пути» ты найдёшь сохранённые версии, разбор по условиям
            задачи и связь с программой. Можно доработать проект или попробовать
            другое направление.
          </p>
          <p>
            Мастерские добровольные. В заявку попадёт только та версия, которую
            ты отдельно разрешишь передать.
          </p>
          <div className="hero-actions">
            <Link href="/my" className="button dark">
              Открыть мой путь
            </Link>
            <Link href="/apply" className="text-link">
              Подать заявку без мастерских
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
