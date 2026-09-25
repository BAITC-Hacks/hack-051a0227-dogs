"use client";
import { DeskChatLauncher } from "./desk-chat";
import { UserAvatar } from "./user-avatar";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Settings2,
  Users,
  Check,
} from "lucide-react";
import type { queueData } from "@/lib/data";
import { programs, stageLabels, domains } from "@/lib/catalog";
import { humanComparisonIssue } from "@/lib/comparison";
import { Tag } from "./ui";
import { queueQuery, type QueueFilters } from "@/lib/queue-location";
type Queue = Awaited<ReturnType<typeof queueData>>;
const nextAction: Record<string, string> = {
  REVIEW: "Рассмотреть источники",
  CLARIFICATION: "Проверить уточнение",
  LANGUAGE: "Проверить языковой ответ",
  INTERVIEW: "Подготовиться к интервью",
  DECIDED: "Открыть решение",
  CHECK: "Рассмотреть новые сведения",
  FINAL_REVIEW: "Подготовить обратную связь",
};
export function AdmissionsQueue({
  applications,
  initialFilters,
}: {
  applications: Queue;
  initialFilters: QueueFilters;
}) {
  const [search, setSearch] = useState(initialFilters.search);
  const [program, setProgram] = useState(initialFilters.program);
  const [stage, setStage] = useState(initialFilters.stage);
  const [check, setCheck] = useState(initialFilters.check);
  const query = queueQuery({ search, program, stage, check });
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      "/admissions" + (query ? "?" + query : ""),
    );
  }, [query]);
  const candidateHref = (id: string) =>
    "/admissions/candidates/" +
    id +
    (query ? "?queue=" + encodeURIComponent(query) : "");
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const filtered = applications.filter(
    (a) =>
      (!search ||
        (a.user.name + " " + a.user.email)
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!program || a.programSlug === program) &&
      (!stage || a.stage === stage) &&
      (!check ||
        (check === "reviewed"
          ? a.assessments.length > 0
          : check === "waiting"
            ? a.assessments.length === 0
            : a.language?.status === "PENDING_REVIEW")),
  );
  const pick = applications.filter((a) => selected.includes(a.id));
  return (
    <div className="staff-page">
      <div className="page-title">
        <div>
          <h1>Кандидаты</h1>
          <p>
            Откройте материалы кандидата и выберите следующий шаг рассмотрения.
          </p>
        </div>
        <div className="queue-heading-actions">
          <DeskChatLauncher
            applicationIds={selected}
            names={pick.map((a) => a.user.name)}
          />
          <Link className="button secondary small" href="/settings">
            <Settings2 size={15} />
            Настройки рассмотрения
          </Link>
        </div>
      </div>
      <div className="queue-tabs" role="group" aria-label="Этап рассмотрения">
        {[
          ["", "Все заявки"],
          ["REVIEW", "На рассмотрении"],
          ["CLARIFICATION", "Нужно уточнение"],
          ["LANGUAGE", "Язык"],
          ["INTERVIEW", "Интервью"],
          ["CHECK", "Дополнительная проверка"],
          ["FINAL_REVIEW", "Итоговое рассмотрение"],
          ["DECIDED", "Решения"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={stage === value}
            onClick={() => setStage(value)}
          >
            {label}
            <span>
              {value
                ? applications.filter((a) => a.stage === value).length
                : applications.length}
            </span>
          </button>
        ))}
      </div>
      <div className="staff-toolbar">
        <label className="field search-field">
          <span className="inline">
            <Search size={13} />
            Поиск кандидата
          </span>
          <input
            type="search"
            placeholder="Имя или электронная почта"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field filter-field">
          Программа
          <select value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="">Все программы</option>
            {programs.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.shortTitle}
              </option>
            ))}
          </select>
        </label>
        <label className="field filter-field">
          Состояние проверки
          <select value={check} onChange={(e) => setCheck(e.target.value)}>
            <option value="">Все состояния</option>
            <option value="waiting">Без оценки сотрудника</option>
            <option value="reviewed">Есть оценка сотрудника</option>
            <option value="language">Языковой ответ ожидает проверки</option>
          </select>
        </label>
        <button
          className="button secondary small"
          style={{ minHeight: 40 }}
          onClick={() => {
            setSearch("");
            setProgram("");
            setCheck("");
            setStage("");
          }}
        >
          <SlidersHorizontal size={14} />
          Сбросить
        </button>
      </div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="subtle">
          {selected.length
            ? `Выбрано ${selected.length} из 4. Сравните основания или задайте вопрос Vision Desk.`
            : `${filtered.length} из ${applications.length} заявок. Выберите 2–4 для сравнения оснований.`}
        </span>
        <button
          className="button secondary small"
          disabled={selected.length < 2}
          onClick={() => setCompare(!compare)}
        >
          <Users size={15} />
          {compare
            ? "Закрыть сравнение"
            : `Сравнить${selected.length ? " · " + selected.length : ""}`}
        </button>
      </div>
      {compare && (
        <section className="compare-panel">
          <h2>Сравнение оснований</h2>
          <p className="subtle" style={{ margin: "10px 0 20px" }}>
            Сверьте одинаковые области: где есть подтверждённая сотрудником
            интерпретация, а где ещё нужны сведения. Нажмите «Открыть основания
            и шкалу», чтобы проверить материал.
          </p>
          <h3>AI-скоринг · предварительные оценки</h3>
          {new Set(
            pick
              .map(
                (a) =>
                  a.scoring.runs.find(
                    (r) => r.current && r.status === "COMPLETED",
                  )?.criteriaVersion,
              )
              .filter(Boolean),
          ).size > 1 ? (
            <p className="notice warning">
              Версии критериев различаются. Перезапустите анализ по одинаковой
              конфигурации перед сопоставлением оценок.
            </p>
          ) : (
            <div className="compare-grid scoring-comparison">
              {pick.map((a) => {
                const run = a.scoring.runs.find(
                  (r) => r.current && r.status === "COMPLETED",
                );
                return (
                  <div key={a.id}>
                    <h3>{a.user.name}</h3>
                    {!run?.result ? (
                      <p>
                        Нет актуального анализа. Откройте карточку и запустите
                        обработку.
                      </p>
                    ) : (
                      <>
                        <p>
                          Критерии {a.scoring.criteria.rubricVersion} ·{" "}
                          {run.reviews.length
                            ? "Есть человеческая проверка"
                            : "Предварительная оценка"}
                        </p>
                        <dl>
                          {domains.map((domain) => {
                            const d = (
                              run.reviews[0]?.result ?? run.result!
                            ).domains.find((d) => d.domain === domain)!;
                            return (
                              <div key={domain}>
                                <dt>{domain}</dt>
                                <dd>
                                  {d.rating
                                    ? `${d.rating.value !== null ? d.rating.value + " · " : ""}${d.rating.label}`
                                    : "Не установлена"}
                                  <p>
                                    Основания: {d.sufficiency}. {d.consistency}.
                                  </p>
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </>
                    )}
                    <Link className="text-link" href={candidateHref(a.id)}>
                      Открыть основания и шкалу
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          <h3>Человеческие оценки и языковая готовность</h3>
          <div className="compare-grid">
            {pick.map((a) => (
              <div key={a.id}>
                <h3>{a.user.name}</h3>
                <dl>
                  <div>
                    <dt>Языковая готовность</dt>
                    <dd>
                      {a.language?.result ?? "Языковой ответ не сохранён"}
                    </dd>
                  </div>
                  {domains.map((d) => {
                    const assessment = a.assessments.find(
                      (x) => x.domain === d,
                    );
                    const review = a.domainReviews.find((x) => x.domain === d);
                    const currentReview =
                      review?.materialVersion === a.materialVersion
                        ? review
                        : undefined;
                    const issue = humanComparisonIssue(
                      assessment,
                      a.materialVersion,
                      pick.map((item) =>
                        item.assessments.find((x) => x.domain === d),
                      ),
                    );
                    return (
                      <div key={d}>
                        <dt>{d}</dt>
                        <dd>
                          {issue
                            ? issue
                            : assessment
                              ? assessment.level
                              : "Оценка проявления не выставлена"}
                          <p className="meta">
                            Сведения:{" "}
                            {issue
                              ? "Нужна сверка"
                              : (currentReview?.sufficiency ??
                                assessment?.sufficiency ??
                                "Не рассмотрено")}
                            . Согласованность:{" "}
                            {issue
                              ? "Нужна сверка"
                              : (currentReview?.consistency ?? "Не проверено")}
                            .
                          </p>
                          {assessment && (
                            <p className="meta">
                              Критерии: {assessment.rubricVersion}.{" "}
                              {issue
                                ? "Откройте историческую оценку и основания в карточке."
                                : "Версия материалов совпадает."}
                            </p>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <Link
                  className="text-link"
                  href={candidateHref(a.id)}
                  style={{ marginTop: 18 }}
                >
                  К источникам
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="table-scroll">
        <table className="candidate-table queue-table">
          <thead>
            <tr>
              <th>
                <span className="screen-reader-only">Сравнить</span>
              </th>
              <th>Кандидат</th>
              <th>Программа</th>
              <th>Этап</th>
              <th>Готовность по языку</th>
              <th>Источники</th>
              <th>Следующее действие</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Сравнить: " + a.user.name}
                    checked={selected.includes(a.id)}
                    disabled={selected.length >= 4 && !selected.includes(a.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, a.id]
                          : s.filter((x) => x !== a.id),
                      )
                    }
                  />
                </td>
                <td>
                  <Link className="name-cell" href={candidateHref(a.id)}>
                    <UserAvatar user={a.user} size={44} />
                    <span>
                      <span className="candidate-name">{a.user.name}</span>
                      <span className="candidate-email">{a.user.email}</span>
                    </span>
                  </Link>
                  <div className="mobile-candidate-context">
                    <span>{a.program.shortTitle}</span>
                    <Tag
                      tone={
                        a.stage === "CLARIFICATION"
                          ? "warning"
                          : a.stage === "INTERVIEW"
                            ? "blue"
                            : a.stage === "DECIDED"
                              ? "success"
                              : "neutral"
                      }
                    >
                      {stageLabels[a.stage]}
                    </Tag>
                    <span>
                      Язык:{" "}
                      {a.language?.status === "REVIEWED"
                        ? "рассмотрено"
                        : a.language?.status === "PENDING_REVIEW"
                          ? "ожидает проверки"
                          : a.language
                            ? "ожидает ответа"
                            : "не начато"}{" "}
                      · Источники: {a._count.sources}
                    </span>
                    <Link className="text-link" href={candidateHref(a.id)}>
                      {nextAction[a.stage]}
                    </Link>
                  </div>
                </td>
                <td className="program-cell">{a.program.shortTitle}</td>
                <td>
                  <Tag
                    tone={
                      a.stage === "CLARIFICATION"
                        ? "warning"
                        : a.stage === "INTERVIEW"
                          ? "blue"
                          : a.stage === "DECIDED"
                            ? "success"
                            : "neutral"
                    }
                  >
                    {stageLabels[a.stage]}
                  </Tag>
                </td>
                <td>
                  {a.language?.status === "REVIEWED" ? (
                    <span className="inline">
                      <Check size={13} />
                      Рассмотрено
                    </span>
                  ) : a.language?.status === "PENDING_REVIEW" ? (
                    "Ожидает проверки"
                  ) : a.language ? (
                    "Ожидает ответа"
                  ) : (
                    "Не начато"
                  )}
                </td>
                <td>
                  <span>Источники: {a._count.sources}</span>
                  <br />
                  <span className="subtle" style={{ fontSize: 10 }}>
                    {a.assessments.length
                      ? "Есть оценка сотрудника"
                      : "Оценка ещё не выставлена"}
                  </span>
                </td>
                <td>
                  <Link
                    className="text-link"
                    style={{ fontSize: 11 }}
                    href={candidateHref(a.id)}
                  >
                    {nextAction[a.stage]}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty" style={{ padding: 28 }}>
            <h3>По этим условиям заявки не найдены</h3>
            <p style={{ marginTop: 12 }}>
              Измени программу, состояние проверки или поисковый запрос.
            </p>
            <button
              className="button secondary small"
              onClick={() => {
                setSearch("");
                setProgram("");
                setStage("");
                setCheck("");
              }}
            >
              Показать все заявки
            </button>
          </div>
        )}
      </div>
      <div className="queue-caption">
        <span>
          Порядок: последние изменения. Итоговые решения принимает сотрудник.
        </span>
        <span>Готовность · направление и мотивация · опыт</span>
      </div>
    </div>
  );
}
