"use client";
import "./admissions-queue.css";
import { DeskChatLauncher } from "./desk-chat";
import { UserAvatar, VisionMark } from "./user-avatar";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowRight,
  BookOpenCheck,
  CircleCheck,
  CircleHelp,
  Clock3,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Settings2,
  Users,
} from "lucide-react";
import type { queueData } from "@/lib/data";
import { programs, stageLabels, domains } from "@/lib/catalog";
import { humanComparisonIssue } from "@/lib/comparison";
import { Tag } from "./ui";
import { queueQuery, type QueueFilters } from "@/lib/queue-location";
type Queue = Awaited<ReturnType<typeof queueData>>;
type Application = Queue[number];
type Sort = "recent" | "attention" | "name";
const quickStages = [
  ["", "Все"],
  ["REVIEW", "На рассмотрении"],
  ["CLARIFICATION", "Нужно уточнение"],
  ["INTERVIEW", "Интервью"],
  ["DECIDED", "Решения"],
] as const;
const allStages = [
  ...quickStages,
  ["LANGUAGE", "Языковая проверка"],
  ["CHECK", "Дополнительная проверка"],
  ["FINAL_REVIEW", "Итоговое рассмотрение"],
] as const;
const attentionOrder: Record<string, number> = {
  REVIEW: 0,
  CLARIFICATION: 1,
  LANGUAGE: 2,
  INTERVIEW: 3,
  CHECK: 4,
  FINAL_REVIEW: 5,
  DECIDED: 6,
};
function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}
function actionHash(stage: string) {
  if (stage === "DECIDED" || stage === "FINAL_REVIEW") return "#decision";
  if (stage === "CLARIFICATION") return "#candidate-messages";
  if (stage === "LANGUAGE") return "#overview";
  if (stage === "REVIEW" || stage === "CHECK") return "#sources";
  return "";
}
function attention(a: Application) {
  if (a.stage === "LANGUAGE")
    return a.language?.status === "PENDING_REVIEW"
      ? {
          title: "Проверить языковой ответ",
          detail: "Ответ ожидает проверки",
          icon: BookOpenCheck,
          tone: "amber",
        }
      : {
          title: "Ожидается ответ",
          detail: "Языковая проверка",
          icon: Clock3,
          tone: "muted",
        };
  if (a.stage === "CLARIFICATION")
    return {
      title: "Нужно уточнение",
      detail: `Источников: ${a._count.sources}`,
      icon: CircleHelp,
      tone: "amber",
    };
  if (a.stage === "INTERVIEW")
    return {
      title: "Подготовиться к интервью",
      detail: `Источников: ${a._count.sources}`,
      icon: BookOpenCheck,
      tone: "blue",
    };
  if (a.stage === "DECIDED")
    return {
      title: "Решение сохранено",
      detail: "Откройте карточку",
      icon: CircleCheck,
      tone: "green",
    };
  if (a.stage === "REVIEW")
    return {
      title: "Проверить основания",
      detail: `Источников: ${a._count.sources}`,
      icon: BookOpenCheck,
      tone: "blue",
    };
  return {
    title: nextAction[a.stage] ?? "Открыть заявку",
    detail: `Источников: ${a._count.sources}`,
    icon: BookOpenCheck,
    tone: "blue",
  };
}
function languageState(a: Application) {
  if (a.language?.status === "REVIEWED")
    return { text: "Рассмотрен", tone: "green" };
  if (a.language?.status === "PENDING_REVIEW")
    return { text: "На проверке", tone: "amber" };
  if (a.language) return { text: "Ожидает ответа", tone: "muted" };
  return { text: "Не начато", tone: "muted" };
}
const nextAction: Record<string, string> = {
  REVIEW: "Рассмотреть источники",
  CLARIFICATION: "Проверить уточнение",
  LANGUAGE: "Открыть языковой этап",
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
  const actionHref = (a: Application) =>
    candidateHref(a.id) + actionHash(a.stage);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);
  const filterChanged = () => setPage(0);
  const filtered = applications.filter(
    (a) =>
      (!search ||
        (
          a.user.name +
          " " +
          a.user.email +
          " " +
          a.id +
          " " +
          a.program.shortTitle
        )
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
  const sorted = [...filtered].sort((a, b) =>
    sort === "name"
      ? a.user.name.localeCompare(b.user.name, "ru")
      : sort === "attention"
        ? (attentionOrder[a.stage] ?? 9) - (attentionOrder[b.stage] ?? 9) ||
          b.updatedAt.getTime() - a.updatedAt.getTime()
        : b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const pageCount = Math.ceil(sorted.length / 8);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const shown = sorted.slice(currentPage * 8, currentPage * 8 + 8);
  const pick = applications.filter((a) => selected.includes(a.id));
  return (
    <div className="staff-page queue-page">
      <div className="page-title queue-page-head">
        <div>
          <h1>Кандидаты</h1>
          <p>
            Все отправленные заявки в одной очереди. Выберите, чьи материалы
            проверить следующими.
          </p>
        </div>
        <div className="queue-vision-card">
          <span className="queue-vision-mark">
            <VisionMark size={40} />
          </span>
          <div className="queue-vision-copy">
            <strong>Vision Desk ✦</strong>
            <span>Вопросы по заявкам и основаниям</span>
            <small>
              {selected.length
                ? `Выбрано заявок: ${selected.length}`
                : `Отправленных заявок: ${applications.length}`}
            </small>
          </div>
          <DeskChatLauncher
            applicationIds={selected}
            names={pick.map((a) => a.user.name)}
            label="Открыть"
          />
        </div>
      </div>
      <div className="queue-filter-line">
        <div className="queue-tabs" role="group" aria-label="Этап рассмотрения">
          {quickStages.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={stage === value}
              onClick={() => {
                setStage(value);
                filterChanged();
              }}
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
        <details className="queue-filter-details">
          <summary>
            <SlidersHorizontal size={18} /> Фильтры
          </summary>
          <div className="queue-filter-panel">
            <label className="field">
              Этап рассмотрения
              <select
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  filterChanged();
                }}
              >
                {allStages.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label === "Все" ? "Все этапы" : label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Программа
              <select
                value={program}
                onChange={(e) => {
                  setProgram(e.target.value);
                  filterChanged();
                }}
              >
                <option value="">Все программы</option>
                {programs.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.shortTitle}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Состояние проверки
              <select
                value={check}
                onChange={(e) => {
                  setCheck(e.target.value);
                  filterChanged();
                }}
              >
                <option value="">Все состояния</option>
                <option value="waiting">Без оценки сотрудника</option>
                <option value="reviewed">Есть оценка сотрудника</option>
                <option value="language">
                  Языковой ответ ожидает проверки
                </option>
              </select>
            </label>
            <button
              className="button secondary small"
              onClick={() => {
                setSearch("");
                setProgram("");
                setCheck("");
                setStage("");
                filterChanged();
              }}
            >
              Сбросить фильтры
            </button>
            <Link className="queue-settings-link" href="/settings">
              <Settings2 size={17} /> Настройки рассмотрения
            </Link>
          </div>
        </details>
      </div>
      <div className="staff-toolbar">
        <label className="queue-search">
          <Search size={19} aria-hidden="true" />
          <span className="screen-reader-only">Поиск кандидата</span>
          <input
            type="search"
            placeholder="Поиск по имени, программе или ID заявки"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              filterChanged();
            }}
          />
        </label>
        <label className="queue-sort">
          <ArrowDownUp size={17} aria-hidden="true" />
          <span className="screen-reader-only">Сортировка</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              filterChanged();
            }}
          >
            <option value="recent">Сначала изменённые</option>
            <option value="attention">По этапу рассмотрения</option>
            <option value="name">По имени</option>
          </select>
        </label>
        <div className="queue-layout" role="group" aria-label="Вид списка">
          <button
            aria-label="Список"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={20} />
          </button>
          <button
            aria-label="Карточки"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <LayoutGrid size={20} />
          </button>
        </div>
      </div>
      <div className="queue-selection-bar">
        <span className="subtle">
          {selected.length
            ? `Выбрано ${selected.length} из 4. Сравните основания или задайте вопрос Vision Desk.`
            : `${filtered.length} из ${applications.length} заявок · Выберите 2–4 для сравнения оснований.`}
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
      <div
        className={`table-scroll queue-results ${layout === "grid" ? "queue-results-grid" : ""}`}
      >
        <table className="candidate-table queue-table">
          <thead>
            <tr>
              <th>
                <span className="screen-reader-only">Сравнить</span>
              </th>
              <th>Кандидат</th>
              <th>Программа</th>
              <th>Статус</th>
              <th>Что проверить</th>
              <th>Английский</th>
              <th>Следующее действие</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const focus = attention(a);
              const language = languageState(a);
              const FocusIcon = focus.icon;
              return (
                <tr key={a.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Сравнить: " + a.user.name}
                      checked={selected.includes(a.id)}
                      disabled={
                        selected.length >= 4 && !selected.includes(a.id)
                      }
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
                        <span
                          className="candidate-id"
                          title={`Полный ID заявки: ${a.id}`}
                        >
                          ID · {shortId(a.id)}
                        </span>
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
                        Английский: {language.text} · Источников:{" "}
                        {a._count.sources}
                      </span>
                      <Link className="queue-action" href={actionHref(a)}>
                        {nextAction[a.stage] ?? "Открыть заявку"}
                        <ArrowRight size={17} />
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
                  <td className="queue-focus-cell">
                    <span className={`queue-focus-icon ${focus.tone}`}>
                      <FocusIcon size={20} />
                    </span>
                    <span>
                      <strong>{focus.title}</strong>
                      <small>{focus.detail}</small>
                    </span>
                  </td>
                  <td className="queue-language-cell">
                    <span className={`queue-language-dot ${language.tone}`} />
                    {language.text}
                  </td>
                  <td className="queue-action-cell">
                    <Link className="queue-action" href={actionHref(a)}>
                      {nextAction[a.stage] ?? "Открыть заявку"}
                      <ArrowRight size={17} />
                    </Link>
                  </td>
                </tr>
              );
            })}
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
          Показано {shown.length ? currentPage * 8 + 1 : 0}–
          {currentPage * 8 + shown.length} из {filtered.length} кандидатов
        </span>
        {pageCount > 1 && (
          <nav
            className="queue-pagination"
            aria-label="Страницы списка кандидатов"
          >
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Предыдущая страница"
            >
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                aria-current={currentPage === i ? "page" : undefined}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Следующая страница"
            >
              ›
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
