import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  MoveRight,
  Clock3,
} from "lucide-react";
import { programs } from "@/lib/catalog";
export default function Home() {
  return (
    <div className="home">
      <section className="hero wrap">
        <div className="hero-copy">
          <h1>
            Твой первый
            <br />
            проект в <span className="lime-mark">inVision</span>
          </h1>
          <p className="hero-intro">
            Попробуй реальные виды учебной работы.
            <br className="desktop-only" /> Создай результат и узнай, что
            хочется изучать глубже.
          </p>
          <div className="hero-actions">
            <Link
              href="/projects/digital-products"
              className="button primary large"
            >
              Войти в проект <ArrowUpRight size={23} />
            </Link>
            <Link href="/apply" className="text-link">
              Перейти к поступлению <ArrowRight size={18} />
            </Link>
          </div>
          <p className="subtle inline">
            <Clock3 size={16} /> Первая проба — около 10 минут. Начни без
            регистрации.
          </p>
        </div>
        <Link
          href="/projects/digital-products"
          className="case-board"
          aria-label="Открыть проект образовательной площадки"
        >
          <div className="board-head">
            <span>Открытая площадка</span>
            <span className="live-dot">План меняется</span>
          </div>
          <div className="board-title">
            Хорошая идея.
            <br />
            Новый поворот.
          </div>
          <div className="board-scene">
            <div className="board-note">
              <span className="small-label">СООБЩЕНИЕ КОМАНДЫ</span>
              <p>
                Место остаётся.
                <br />
                Время меняется.
                <br />
                Люди — в центре.
              </p>
              <div className="time-change">
                <del>14:00</del>
                <MoveRight size={22} />
                <strong>16:00</strong>
              </div>
            </div>
            <div className="board-route">
              <div className="mini-screen">
                <span>Выбери мастерскую</span>
                <div className="mini-option">Создавать</div>
                <div className="mini-option">Исследовать</div>
                <span className="mini-action">
                  Продолжить <ArrowRight size={14} />
                </span>
              </div>
              <div className="route-note">
                <Check size={16} /> Меньше полей.
                <br />
                Больше участия.
              </div>
            </div>
          </div>
          <div className="board-foot">
            <span>
              У каждого изменения есть автор.
              <br />
              <strong>Следующее — твоё.</strong>
            </span>
            <span className="round-arrow">
              <ArrowUpRight size={24} />
            </span>
          </div>
        </Link>
      </section>
      <section className="project-section wrap" id="projects">
        <div className="section-heading">
          <h2>
            Одна ситуация.
            <br />
            Пять способов включиться.
          </h2>
          <p>
            Команда готовит открытую образовательную площадку, но план
            приходится пересмотреть. Выбери, что сделаешь ты.
          </p>
        </div>
        <div className="activity-layout">
          <Link href="/projects/digital-products" className="featured-activity">
            <h3>
              Сделай вход
              <br />
              проще для всех.
            </h3>
            <span className="tag neutral">Цифровые продукты</span>
            <div className="flow-strip">
              <span>Мастерская</span>
              <ArrowRight />
              <span>Твой выбор</span>
              <ArrowRight />
              <span className="flow-finish">
                <Check size={18} />
              </span>
            </div>
            <p>Переставь экраны, убери лишнее поле и проверь путь участника.</p>
            <span className="activity-link">
              Изменить маршрут <ArrowUpRight size={23} />
            </span>
          </Link>
          <div className="activity-list">
            {programs.slice(1).map((p) => (
              <Link
                key={p.slug}
                href={"/projects/" + p.slug}
                className="activity-row"
              >
                <div className={`discipline-mark ${p.color}`}>{p.letter}</div>
                <div>
                  <h3>{p.action}</h3>
                  <span className="subtle">{p.shortTitle}</span>
                </div>
                <ArrowUpRight size={23} />
              </Link>
            ))}
          </div>
        </div>
        <div className="project-footnote">
          <p>
            Учебная вымышленная ситуация. Упражнения знакомят с видами работы и
            не являются вступительным испытанием.
          </p>
          <Link href="/apply" className="text-link">
            Уже определился? Подай заявку <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="path-banner">
        <div className="wrap banner-inner">
          <h2>
            Сначала попробуй.
            <br />
            Потом решай.
          </h2>
          <div>
            <p>
              Твоя работа, изменения и обратная связь соберутся в «Моём пути».
              Ты сам решаешь, чем поделиться с комиссией.
            </p>
            <Link href="/my" className="button dark">
              Открыть мой путь <ArrowUpRight size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
