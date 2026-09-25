"use client";
import { AvatarEditor } from "./avatar-editor";
import { clearUserRecordings } from "@/lib/recording-cache";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { action } from "@/lib/client";
import { useTask, Feedback } from "./ui";
import type { SafeUser } from "@/lib/types";
export function Header({ user }: { user: SafeUser | null }) {
  const path = usePathname();
  const router = useRouter();
  const task = useTask();
  const staff =
    path.startsWith("/admissions") ||
    path === "/settings" ||
    path.startsWith("/settings/");
  const links = staff
    ? [
        ["Кандидаты", "/admissions"],
        ["Интервью", "/admissions/interviews"],
        ["Решения", "/admissions/decisions"],
      ]
    : [
        ["Проекты", "/"],
        ["Мой путь", "/my"],
        ["Заявка", "/apply"],
      ];
  return (
    <>
      <header className={`site-header ${staff ? "staff-header" : ""}`}>
        <Link
          href={staff ? "/admissions" : "/"}
          className="brand"
          aria-label="inVision U, главная"
        >
          inVision
          <span className="brand-u">
            <span>U</span>
          </span>
          <span className="brand-product">AI Leader ID</span>
        </Link>
        <nav aria-label={staff ? "Навигация комиссии" : "Основная навигация"}>
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={
                (
                  href === "/"
                    ? path === "/" ||
                      path.startsWith("/projects") ||
                      path.startsWith("/programs")
                    : href === "/admissions"
                      ? path === "/admissions" ||
                        path.startsWith("/admissions/candidates")
                      : path.startsWith(href)
                )
                  ? "active"
                  : ""
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-account">
          {user && user.role !== "GUEST" ? (
            <>
              <AvatarEditor user={user} compact />
              <span className="account-name">{user.name.split(" ")[0]}</span>
              <button
                className="icon-button"
                aria-label="Выйти"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await action("logout");
                    await clearUserRecordings(user.id).catch(() => {});
                    router.push("/");
                    router.refresh();
                  })
                }
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link
              className="login-link"
              href={staff ? "/login?staff=1" : "/login"}
            >
              Войти
            </Link>
          )}
        </div>
      </header>
      {task.error && <Feedback task={task} />}
    </>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-identity">
          <Link href="/" className="brand" aria-label="inVision U, главная">
            inVision
            <span className="brand-u">
              <span>U</span>
            </span>
          </Link>
          <p>AI Leader ID</p>
          <p>Практика, проекты и твой следующий шаг.</p>
        </div>
        <nav aria-label="Университет">
          <h2>inVision U</h2>
          <a
            href="https://www.invisionu.education/ru"
            target="_blank"
            rel="noopener noreferrer"
          >
            Сайт университета
          </a>
          <a
            href="https://www.invisionu.education/ru/foundation"
            target="_blank"
            rel="noopener noreferrer"
          >
            Foundation
          </a>
          <a
            href="https://www.invisionu.education/ru/undergraduate"
            target="_blank"
            rel="noopener noreferrer"
          >
            Бакалавриат
          </a>
        </nav>
        <nav aria-label="Связаться с университетом">
          <h2>Связаться с университетом</h2>
          <a href="mailto:info@invisionu.education">info@invisionu.education</a>
          <a href="tel:+77710707370">+7 771 070 73 70</a>
          <a
            href="https://www.invisionu.education/contacts"
            target="_blank"
            rel="noopener noreferrer"
          >
            Контакты и адрес
          </a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© inVision U · AI Leader ID</span>
        <a
          href="https://cdn.prod.website-files.com/6798ba0f2cbf12d58d36f439/67e5344eb13914f196a1e1cb_Privacy%20Policy%20inVision%20University_ru.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          Конфиденциальность inVision U{" "}
          <span className="footer-file-type">PDF</span>
        </a>
        <Link href="/admissions">Приёмная комиссия</Link>
      </div>
    </footer>
  );
}
