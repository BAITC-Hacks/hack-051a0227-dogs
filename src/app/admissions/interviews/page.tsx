import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { dateLabel } from "@/lib/client";
import { Tag } from "@/components/ui";
export default async function Interviews() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  const rows = await db.interview.findMany({
    include: {
      application: {
        include: { user: { select: { name: true } }, program: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });
  return (
    <div className="staff-page">
      <div className="page-title">
        <div>
          <h1>Интервью</h1>
          <p>Подготовка по источникам, разговор и наблюдения сотрудника.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="candidate-table interview-list">
          <thead>
            <tr>
              <th>Кандидат</th>
              <th>Программа</th>
              <th>Время · Алматы</th>
              <th>Состояние</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link
                    className="candidate-name"
                    href={"/admissions/candidates/" + i.applicationId}
                  >
                    {i.application.user.name}
                  </Link>
                </td>
                <td data-label="Программа">
                  {i.application.program.shortTitle}
                </td>
                <td data-label="Алматы">
                  {dateLabel(
                    i.status === "COMPLETED" && i.performedAt
                      ? i.performedAt
                      : i.scheduledAt,
                  )}
                </td>
                <td>
                  <Tag tone={i.status === "COMPLETED" ? "success" : "blue"}>
                    {i.status === "COMPLETED" ? "Завершено" : "Назначено"}
                  </Tag>
                </td>
                <td>
                  <Link
                    className="text-link"
                    href={"/admissions/interviews/" + i.id}
                  >
                    Открыть интервью <ArrowUpRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
