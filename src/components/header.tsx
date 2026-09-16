"use client";
import { clearUserRecordings } from "@/lib/recording-cache";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, LogOut } from "lucide-react";
import { action } from "@/lib/client";
import { useTask, Feedback } from "./ui";
import type { SafeUser } from "@/lib/types";
export function Header({ user }: { user: SafeUser | null }) {
  const path = usePathname();
  const router = useRouter();
  const task = useTask();
  const staff = path.startsWith("/admissions") || path === "/settings";
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
          aria-label="inVision U — главная"
        >
          inVision<span>U</span>
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
              Войти <ArrowUpRight size={16} />
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
      <Link href="/" className="wordmark">
        inVision U
      </Link>
      <span>От первого действия — к своему направлению.</span>
      <Link href="/admissions">
        Приёмная комиссия <ArrowUpRight size={15} />
      </Link>
    </footer>
  );
}
