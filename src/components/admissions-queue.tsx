"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  Settings2,
  Users,
  Check,
} from "lucide-react";
import type { queueData } from "@/lib/data";
import { programs, stageLabels, domains } from "@/lib/catalog";
import { Tag } from "./ui";
type Queue = Awaited<ReturnType<typeof queueData>>;
const nextAction: Record<string, string> = {
  REVIEW: "Рассмотреть источники",
  CLARIFICATION: "Проверить уточнение",
  LANGUAGE: "Проверить языковой ответ",
  INTERVIEW: "Подготовиться к интервью",
  DECIDED: "Открыть решение",
};
export function AdmissionsQueue({ applications }: { applications: Queue }) {
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("");
  const [stage, setStage] = useState("");
  const [check, setCheck] = useState("");
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
          <p>Сначала — контекст. Затем — следующий осмысленный шаг.</p>
        </div>
        <Link className="button secondary small" href="/settings">
          <Settings2 size={15} />
          Настройки рассмотрения
        </Link>
      </div>
      <div className="queue-tabs" role="group" aria-label="Этап рассмотрения">
        {[
          ["", "Все заявки"],
          ["REVIEW", "На рассмотрении"],
          ["CLARIFICATION", "Нужно уточнение"],
          ["LANGUAGE", "Язык"],
          ["INTERVIEW", "Интервью"],
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
          {filtered.length} из {applications.length} заявок
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
          <h2>Одни показатели, разные истории</h2>
          <p className="subtle" style={{ margin: "10px 0 20px" }}>
            Сопоставление без общего балла и автоматического ранжирования.
          </p>
          <div className="compare-grid">
            {pick.map((a) => (
              <div key={a.id}>
                <h3>{a.user.name}</h3>
                <dl>
                  <div>
                    <dt>Языковая готовность</dt>
                    <dd>{a.language?.result ?? "Ответ ещё не рассмотрен"}</dd>
                  </div>
                  {[domains[0], domains[3], domains[5]].map((d) => {
                    const assessment = a.assessments.find(
                      (x) => x.domain === d,
                    );
                    return (
                      <div key={d}>
                        <dt>{d}</dt>
                        <dd>
                          {assessment
                            ? `${assessment.level}. Оснований: ${assessment.sufficiency.toLowerCase()}.`
                            : "Не рассмотрено"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <Link
                  className="text-link"
                  href={"/admissions/candidates/" + a.id}
                  style={{ marginTop: 18 }}
                >
                  К источникам <ArrowUpRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="table-scroll">
        <table className="candidate-table">
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
            {filtered.map((a, i) => (
              <tr key={a.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Сравнить: " + a.user.name}
                    checked={selected.includes(a.id)}
                    disabled={selected.length >= 3 && !selected.includes(a.id)}
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
                  <Link
                    className="name-cell"
                    href={"/admissions/candidates/" + a.id}
                  >
                    <span
                      className={`avatar ${i % 3 === 1 ? "lime" : i % 3 === 2 ? "pink" : ""}`}
                    >
                      {a.user.name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>
                      <span className="candidate-name">{a.user.name}</span>
                      <span className="candidate-email">{a.user.email}</span>
                    </span>
                  </Link>
                  <div className="mobile-candidate-context">
                    <span>{a.program.shortTitle}</span>
                    <Tag tone={a.stage === "CLARIFICATION" ? "warning" : a.stage === "INTERVIEW" ? "blue" : a.stage === "DECIDED" ? "success" : "neutral"}>
                      {stageLabels[a.stage]}
                    </Tag>
                    <span>Язык: {a.language?.status === "REVIEWED" ? "рассмотрено" : a.language?.status === "PENDING_REVIEW" ? "ожидает проверки" : a.language ? "ожидает ответа" : "не начато"} · Источники: {a._count.sources}</span>
                    <Link className="text-link" href={"/admissions/candidates/" + a.id}>
                      {nextAction[a.stage]} <ArrowUpRight size={14} />
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
                      : "Нужен первый просмотр"}
                  </span>
                </td>
                <td>
                  <Link
                    className="text-link"
                    style={{ fontSize: 11 }}
                    href={"/admissions/candidates/" + a.id}
                  >
                    {nextAction[a.stage]}
                    <ArrowUpRight size={14} />
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
