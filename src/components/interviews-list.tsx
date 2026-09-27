"use client";
import "./interviews-list.css";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Search } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import type { AvatarIdentity } from "@/lib/avatar";
import { dateLabel } from "@/lib/client";

type InterviewRow = {
  id: string;
  applicationId: string;
  user: AvatarIdentity & { name: string };
  program: string;
  scheduledAt: string;
  performedAt: string | null;
  status: string;
  calendarStatus: string;
  timezone: string;
  hasPlan: boolean;
};
type Filter = "all" | "today" | "scheduled" | "completed";

function dayInAlmaty(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}
function rowOrder(row: InterviewRow, today: string, now: number) {
  if (row.status === "COMPLETED") return 3;
  if (dayInAlmaty(row.scheduledAt) === today) return 0;
  return new Date(row.scheduledAt).getTime() >= now ? 1 : 2;
}

export function InterviewsList({
  rows,
  today,
  now,
}: {
  rows: InterviewRow[];
  today: string;
  now: number;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const counts = {
    all: rows.length,
    today: rows.filter(
      (row) =>
        row.status === "SCHEDULED" && dayInAlmaty(row.scheduledAt) === today,
    ).length,
    scheduled: rows.filter((row) => row.status === "SCHEDULED").length,
    completed: rows.filter((row) => row.status === "COMPLETED").length,
  };
  const visible = rows
    .filter((row) => {
      const term = search.trim().toLocaleLowerCase("ru");
      const matchesSearch =
        !term ||
        `${row.user.name} ${row.program} ${row.applicationId}`
          .toLocaleLowerCase("ru")
          .includes(term);
      const matchesFilter =
        filter === "all" ||
        (filter === "today" &&
          row.status === "SCHEDULED" &&
          dayInAlmaty(row.scheduledAt) === today) ||
        (filter === "scheduled" && row.status === "SCHEDULED") ||
        (filter === "completed" && row.status === "COMPLETED");
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const rank = rowOrder(a, today, now) - rowOrder(b, today, now);
      if (rank) return rank;
      const difference =
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      return rowOrder(a, today, now) >= 2 ? -difference : difference;
    });

  return (
    <div className="staff-page interviews-page">
      <div className="page-title interviews-heading">
        <h1>Интервью</h1>
        <p>Подготовка по источникам, разговор и наблюдения сотрудника.</p>
      </div>
      {!!rows.length && (
        <>
          <div className="interviews-toolbar">
            <label className="interviews-search">
              <Search size={19} aria-hidden="true" />
              <span className="screen-reader-only">Поиск интервью</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по имени, программе или ID"
              />
            </label>
            <div
              className="interviews-filters"
              role="group"
              aria-label="Состояние интервью"
            >
              {(
                [
                  ["all", "Все"],
                  ["today", "Сегодня"],
                  ["scheduled", "Назначено"],
                  ["completed", "Завершено"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${label}, ${counts[value]} интервью`}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span
              className="interviews-timezone"
              title="Время встреч показано по Алматы"
            >
              <CalendarDays size={18} /> Время Алматы
            </span>
          </div>
          <div className="table-scroll interviews-table-wrap">
            <table className="candidate-table interviews-table">
              <thead>
                <tr>
                  <th>Кандидат</th>
                  <th>Программа</th>
                  <th>Дата и время</th>
                  <th>Подготовка</th>
                  <th>Состояние</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isCompleted = row.status === "COMPLETED";
                  const stateLabel =
                    row.status === "CANCELLED"
                      ? "Отменено"
                      : row.status === "CANCELLING"
                        ? "Отменяется"
                        : row.status === "SCHEDULING"
                          ? ["FAILED", "STALE"].includes(row.calendarStatus)
                            ? "Нужно повторить"
                            : "Создаётся встреча"
                          : null;
                  const isToday =
                    !isCompleted && dayInAlmaty(row.scheduledAt) === today;
                  const isPast =
                    !isCompleted &&
                    !isToday &&
                    new Date(row.scheduledAt).getTime() < now;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="interviews-person"
                          href={`/admissions/candidates/${row.applicationId}`}
                        >
                          <UserAvatar user={row.user} size={44} />
                          <span>
                            <strong>{row.user.name}</strong>
                            <small
                              title={`Полный ID заявки: ${row.applicationId}`}
                            >
                              ID · {shortId(row.applicationId)}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="interview-mobile-label">
                          Программа
                        </span>
                        {row.program}
                      </td>
                      <td>
                        <span className="interview-mobile-label">
                          Дата и время
                        </span>
                        <strong>
                          {new Intl.DateTimeFormat("ru", {
                            timeZone: row.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(row.scheduledAt))}
                        </strong>
                        <small>{row.timezone}</small>
                        <small>
                          {isCompleted
                            ? row.performedAt
                              ? `Проведено ${dateLabel(row.performedAt)}`
                              : "Время по приглашению"
                            : isToday
                              ? "Сегодня"
                              : isPast
                                ? "Дата прошла, проверьте запись"
                                : "Запланировано"}
                        </small>
                      </td>
                      <td>
                        <span className="interview-mobile-label">
                          Подготовка
                        </span>
                        <strong>
                          {row.hasPlan ? "План сохранён" : "План не сохранён"}
                        </strong>
                        <small>
                          {row.hasPlan
                            ? "Вопросы сохранены"
                            : isCompleted
                              ? "История интервью"
                              : "Можно подготовить вопросы"}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`interviews-state ${isCompleted ? "completed" : isToday ? "today" : "scheduled"}`}
                        >
                          {stateLabel ??
                            (isCompleted
                              ? "Завершено"
                              : isToday
                                ? "Сегодня"
                                : "Назначено")}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="interviews-action"
                          href={`/admissions/interviews/${row.id}`}
                        >
                          Открыть интервью{" "}
                          <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <div className="interviews-empty-filter">
                <h2>По этим условиям интервью не найдены</h2>
                <p>Измените имя, программу или состояние встречи.</p>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Показать все интервью
                </button>
              </div>
            )}
          </div>
          <p className="interviews-count">
            Показано {visible.length} из {rows.length} интервью
          </p>
        </>
      )}
      {!rows.length && (
        <div className="empty">
          <h2>Назначьте первый разговор</h2>
          <p>
            В карточке кандидата выберите «Пригласить на интервью» и укажите
            время.
          </p>
          <Link className="button primary" href="/admissions">
            К кандидатам
          </Link>
        </div>
      )}
    </div>
  );
}
