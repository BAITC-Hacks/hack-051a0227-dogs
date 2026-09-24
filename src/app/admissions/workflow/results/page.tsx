import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actor, AppError } from "@/lib/security";
import { workflowRows } from "@/lib/workflow-service.server";
import {
  supportLabels,
  durationLabel,
  workflowModes,
  workflowSummary,
} from "@/lib/workflow-contract";
export default async function WorkflowResults() {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  let rows;
  try {
    rows = await workflowRows(user);
  } catch (e) {
    if (e instanceof AppError && e.status === 403) notFound();
    throw e;
  }
  const summary = workflowSummary(rows);
  return (
    <div className="staff-page workflow-page">
      <Link className="text-link" href="/admissions/workflow">
        К проверке рабочего процесса
      </Link>
      <h1>Результаты рабочих сессий</h1>
      <p>
        Полное время считается от начала до завершения. Время без пауз исключает только
        паузы, явно отмеченные участником. Это не измерение внимания и не время
        внешней AI-обработки.
      </p>
      {summary.completed ? (
        <p>
          Завершённых человеческих сессий: {summary.completed}. Участников:{" "}
          {summary.participants}. Разных случаев с версиями: {summary.cases}.
        </p>
      ) : (
        <p className="notice info">
          Завершённых человеческих измерений пока нет. Технические проходы
          приведены отдельно.
        </p>
      )}
      <p>
        Незавершённых человеческих сессий: {summary.incomplete}. Технических:{" "}
        {summary.technical}.
      </p>
      <div className="workflow-report-modes">
        {summary.modes.map((m) => (
          <section key={m.mode}>
            <h2>{workflowModes[m.mode]}</h2>
            <p>
              Завершено: {m.count}. Со знакомыми материалами: {m.familiar}.
            </p>
            <p>
              Полное время:{" "}
              {m.count ? durationLabel(m.elapsedMs) : "Не измерено"}. Без пауз:{" "}
              {m.count ? durationLabel(m.withoutPausesMs) : "Не измерено"}.
            </p>
            <p>
              Размечено человеком: {m.annotated} из {m.count}.
            </p>
            <p>
              Исправления: {m.annotated ? m.corrections : "Не измерено"}.
              Пропущенные основания:{" "}
              {m.annotated ? m.missedEvidence : "Не измерено"}. Вопросы:{" "}
              {m.annotated ? m.missedQuestions : "Не измерено"}.
            </p>
          </section>
        ))}
      </div>
      <p className="subtle">
        Суммы по режимам не доказывают улучшения: состав случаев, версии,
        знакомство и порядок могут различаться. Для выводов нужны сопоставимые
        группы и отдельный экспертный разбор.
      </p>
      <a className="button secondary" href="/api/workflow/export">
        Выгрузить сессии и разметку · JSON
      </a>
      {[false, true].map((technical) => (
        <section className="workflow-history" key={String(technical)}>
          <h2>
            {technical
              ? "Технические проходы · вне измерений"
              : "Человеческие сессии"}
          </h2>
          {rows
            .filter((r) => r.technical === technical)
            .map((r) => (
              <details key={r.id}>
                <summary>
                  {r.participant} · {r.title} · {workflowModes[r.mode]} ·{" "}
                  {r.status === "COMPLETED" ? "Завершена" : "Не завершена"}
                </summary>
                <p>
                  Порядок {r.order}.{" "}
                  {r.familiar ? "Материалы знакомы" : "Знакомство не отмечено"}.{" "}
                  {r.familiarityNote}
                </p>
                <p>
                  Полное время {durationLabel(r.elapsedMs)}, без пауз{" "}
                  {durationLabel(r.withoutPausesMs)}
                  {r.status !== "COMPLETED"
                    ? " · на момент открытия отчёта"
                    : ""}
                  .
                </p>
                <p>
                  Версия набора: {r.caseVersion}. Материалы:{" "}
                  {r.materialVersion.slice(0, 12)}. Профиль:{" "}
                  {r.profileVersion?.slice(0, 12) ?? "Не показан"}.
                </p>
                <h3>Рабочий ответ</h3>
                <p>{r.work.evidence || "Основания ещё не сохранены"}</p>
                <p>{r.work.questions}</p>
                <p>{r.work.reason}</p>
                <p>Замеченные ошибки: {r.work.errors || "Не отмечены"}</p>
                <p>
                  Исправления участника: {r.work.corrections || "Не отмечены"}
                </p>
                {r.annotations.length ? (
                  r.annotations.map((a, i) => (
                    <div key={i}>
                      <h3>Разметка {i + 1}</h3>
                      <p>{a.note}</p>
                      <p>
                        Смысловая поддержка: {supportLabels[a.support]}.{" "}
                        {a.checked
                          ? "Пропуски и исправления проверены."
                          : "Пропуски и исправления ещё не подтверждены; счётчики не включены в измерения."}
                      </p>
                      <p>
                        Исправлений: {a.correctionCount}. Пропущенные основания:{" "}
                        {a.missedEvidence.join("; ") || "Не отмечены"}. Вопросы:{" "}
                        {a.missedQuestions.join("; ") || "Не отмечены"}.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Человеческая разметка не выполнена.</p>
                )}
              </details>
            ))}
        </section>
      ))}
    </div>
  );
}
