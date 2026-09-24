import Link from "next/link";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { actionLabels } from "@/lib/catalog";
import { dateLabel } from "@/lib/client";
export default async function Decisions() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
  const rows = await db.decision.findMany({
    include: {
      application: { include: { user: { select: { name: true } } } },
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="staff-page">
      <div className="page-title">
        <div>
          <h1>Решения и следующие действия</h1>
          <p>Каждая запись сохраняет автора, время и основание.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="candidate-table">
          <thead>
            <tr>
              <th>Кандидат</th>
              <th>Действие</th>
              <th>Основание</th>
              <th>Сотрудник</th>
              <th>Дата</th>
              <th>Источники</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="candidate-name">{d.application.user.name}</td>
                <td>{actionLabels[d.action]}</td>
                <td style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>
                  {d.reason}
                </td>
                <td>{d.author.name}</td>
                <td>{dateLabel(d.createdAt)}</td>
                <td>
                  <Link
                    className="text-link"
                    href={"/admissions/candidates/" + d.applicationId}
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <h2>Начните с источников кандидата</h2>
          <p>После первого действия сотрудника его основание появится здесь.</p>
          <Link href="/admissions" className="button primary">
            Открыть кандидатов
          </Link>
        </div>
      )}
    </div>
  );
}
