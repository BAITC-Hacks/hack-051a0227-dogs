"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { action, dateLabel } from "@/lib/client";
import { scoringActions, type ScoringResult } from "@/lib/scoring-contract";
import {
  twinStates,
  twinVerdicts,
  twinSuitability,
  type TwinList,
  type TwinAuditView,
  type TwinDefinition,
  type TwinVariant,
} from "@/lib/twin-contract";
import { Feedback, useTask } from "./ui";

export function TwinWorkspace({
  applicationId,
  name,
  list,
  initial,
}: {
  applicationId: string;
  name: string;
  list: TwinList;
  initial: TwinAuditView | null;
}) {
  const [audit, setAudit] = useState(initial),
    [key, setKey] = useState(
      initial?.definition.key ?? list.available[0]?.key ?? "",
    );
  const [preview, setPreview] = useState<{
    definition: TwinDefinition;
    previewHash: string;
  } | null>(null);
  const [side, setSide] = useState<"A" | "B">("A"),
    [pollError, setPollError] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState(""),
    [verdict, setVerdict] = useState<keyof typeof twinVerdicts>("REVIEWED");
  const [reviewKey, setReviewKey] = useState(() => crypto.randomUUID());
  const task = useTask(),
    reviewTask = useTask(),
    router = useRouter();
  const processing = !!audit?.runs.some((r) =>
    ["QUEUED", "RUNNING"].includes(r.status),
  );
  const auditId = audit?.id;
  useEffect(() => {
    if (!processing || !auditId) return;
    let stopped = false;
    const timer = setInterval(() => {
      action<TwinAuditView>("twin.status", { applicationId, auditId })
        .then((v) => {
          if (!stopped) {
            setAudit(v);
            setPollError(false);
          }
        })
        .catch(() => {
          if (!stopped) setPollError(true);
        });
    }, 900);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [applicationId, auditId, processing]);
  const definition = audit?.definition ?? preview?.definition;
  const invalid = definition ? twinSuitability(definition) : [];
  async function openPreview() {
    const p = await action<{ definition: TwinDefinition; previewHash: string }>(
      "twin.preview",
      { applicationId, caseKey: key },
    );
    setPreview(p);
    setAudit(null);
    setRequestKey(crypto.randomUUID());
  }
  return (
    <div className="staff-page twin-workspace">
      <Link
        className="breadcrumbs"
        href={`/admissions/candidates/${applicationId}`}
      >
        ← Вернуться в официальный профиль
      </Link>
      <div className="page-title">
        <div>
          <p>{name} · AI-скоринг</p>
          <h1>Проверка устойчивости</h1>
        </div>
      </div>
      <p className="twin-intro">
        Сопоставьте два контролируемых варианта материалов. Проверка и ваш
        разбор сохраняются отдельно от заявки, оценки и решения.
      </p>
      <section className="twin-choice" aria-label="Выбор проверки">
        {list.available.length > 0 ? (
          <>
            <label className="field">
              Доступная проверка
              <select value={key} onChange={(e) => setKey(e.target.value)}>
                {list.available.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <p>{list.available.find((c) => c.key === key)?.purpose}</p>
            <button
              className="button secondary"
              disabled={task.busy || processing}
              onClick={() => task.run(openPreview)}
            >
              Посмотреть материалы пары
            </button>
          </>
        ) : (
          <p>{list.reason}</p>
        )}
        {list.history.length > 0 && (
          <label className="field">
            Сохранённые проверки
            <select
              value={audit?.id ?? ""}
              onChange={(e) => {
                if (e.target.value) router.push(`?audit=${e.target.value}`);
              }}
            >
              <option value="">Выбрать проверку</option>
              {list.history.map((h) => (
                <option value={h.id} key={h.id}>
                  {h.title} · {dateLabel(h.createdAt)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <Feedback task={task} />
      {definition && (
        <>
          <section className="twin-purpose">
            <span className="eyebrow">Назначение проверки</span>
            <h2>{definition.title}</h2>
            <p>{definition.purpose}</p>
            <dl>
              <div>
                <dt>Что меняется</dt>
                <dd>{definition.factor}</dd>
              </div>
              <div>
                <dt>Ожидаемое свойство</dt>
                <dd>{definition.expected}</dd>
              </div>
              <div>
                <dt>Пригодность</dt>
                <dd>{definition.suitability}</dd>
              </div>
              <div>
                <dt>Допуск</dt>
                <dd>{definition.tolerance}</dd>
              </div>
            </dl>
            <p>
              Проверяем: {definition.domains.join("; ")}. Английский не входит в
              оценку опыта.
            </p>
            <details>
              <summary>Сохраняемые факты и шкала</summary>
              <ul>
                {definition.variants.A.facts
                  .filter((f) => definition.preserved.includes(f.id))
                  .map((f) => (
                    <li key={f.id}>
                      <strong>{f.label}:</strong> {f.value}
                    </li>
                  ))}
              </ul>
              <p>
                Критерии: {definition.variants.A.input.criteria.rubricVersion}.{" "}
                {definition.variants.A.input.criteria.guidance}
              </p>
              {definition.variants.A.input.criteria.levels.map((l) => (
                <p key={l.label}>
                  <strong>{l.label}:</strong> {l.meaning}
                </p>
              ))}
            </details>
            {invalid.length > 0 && (
              <div className="notice warning">
                <div>
                  <strong>Пара требует отклонения</strong>
                  {invalid.map((x) => (
                    <p key={x}>{x}</p>
                  ))}
                </div>
              </div>
            )}
          </section>
          <nav className="twin-jumps" aria-label="Части проверки">
            <a href="#twin-materials">Материалы пары</a>
            {audit && (
              <>
                <a href="#twin-result">Результат</a>
                <a href="#twin-grounds">Основания</a>
                <a href="#twin-review">Разбор</a>
              </>
            )}
          </nav>
          <div
            className="twin-switch"
            role="group"
            aria-label="Вариант материалов"
          >
            <button
              className={`button ${side === "A" ? "primary" : "secondary"}`}
              aria-pressed={side === "A"}
              onClick={() => setSide("A")}
            >
              Исходный вариант
            </button>
            <button
              className={`button ${side === "B" ? "primary" : "secondary"}`}
              aria-pressed={side === "B"}
              onClick={() => setSide("B")}
            >
              Изменённый вариант
            </button>
          </div>
          <section
            id="twin-materials"
            aria-label="Предпросмотр материалов"
            className="twin-columns"
            data-side={side}
          >
            {(["A", "B"] as const).map((s) => (
              <article key={s} className={`twin-material twin-side-${s}`}>
                <h3>{s === "A" ? "Исходный вариант" : "Изменённый вариант"}</h3>
                <VariantMaterial variant={definition.variants[s]} />
              </article>
            ))}
          </section>
          {!audit && preview && (
            <div className="twin-launch">
              <p>
                Оба варианта пройдут отдельные анализы. Официальный профиль
                останется прежним.
              </p>
              <button
                className="button primary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    const run = await action<{ id: string }>("twin.launch", {
                      applicationId,
                      caseKey: definition.key,
                      previewHash: preview.previewHash,
                      requestKey,
                    });
                    router.push(`?audit=${run.id}#twin-result`);
                  })
                }
              >
                {task.busy ? "Запускаем обработку" : "Обработать оба варианта"}
              </button>
            </div>
          )}
          {audit && (
            <>
              {!audit.currentBase && (
                <p className="notice warning">
                  В заявке появились другие материалы. Эта проверка относится к
                  сохранённой паре; исходный профиль не обновляется по её
                  результату.
                </p>
              )}
              {pollError && (
                <p role="alert" className="notice error">
                  Не удалось обновить состояние. Результат пока не подтверждён.
                </p>
              )}
              <section
                id="twin-result"
                className="twin-result"
                aria-label="Результат сравнения"
              >
                <h2>{twinStates[audit.comparison.state]}</h2>
                <p>
                  {audit.runs
                    .map(
                      (r) =>
                        `${r.variant === "A" ? "Исходный" : "Изменённый"}: ${r.status === "COMPLETED" ? "анализ сохранён" : r.status === "FAILED" ? "обработка прервалась" : r.status === "RUNNING" ? "обрабатывается" : "ожидает обработки"}`,
                    )
                    .join(" · ")}
                </p>
                {audit.comparison.reasons.map((r) => (
                  <p key={r}>{r}</p>
                ))}
                {audit.comparison.actionChanged && (
                  <p>
                    <strong>Изменилось рекомендуемое действие.</strong>
                  </p>
                )}
                {audit.comparison.textsChanged && (
                  <p>
                    <strong>Тексты интерпретаций различаются.</strong> Это
                    отметка изменения текста, а не автоматическое заключение о
                    его смысле.
                  </p>
                )}
                {audit.comparison.domains.map((d) => (
                  <div className="twin-difference" key={d.domain}>
                    <strong>{d.domain}</strong>
                    <span>
                      {d.changes.length
                        ? d.changes.join("; ")
                        : "Проверяемые показатели совпадают"}
                    </span>
                    <span>
                      Эпизоды: {d.episodes[0]} → {d.episodes[1]} · Фрагменты:{" "}
                      {d.grounds[0]} → {d.grounds[1]}
                    </span>
                  </div>
                ))}
                {audit.runs.some((r) => r.result) && (
                  <p>
                    <a className="text-link" href="#twin-grounds">
                      Открыть основания и вопросы ↓
                    </a>
                  </p>
                )}
                {!processing && (
                  <button
                    className="button secondary"
                    disabled={task.busy}
                    onClick={() =>
                      task.run(async () => {
                        const p = await action<{
                          definition: TwinDefinition;
                          previewHash: string;
                        }>("twin.preview", {
                          applicationId,
                          caseKey: definition.key,
                        });
                        setKey(definition.key);
                        setPreview(p);
                        setAudit(null);
                        setRequestKey(crypto.randomUUID());
                      })
                    }
                  >
                    Подготовить повторную проверку
                  </button>
                )}
              </section>
              <section id="twin-grounds" aria-label="Основания сравнения">
                <h2>Основания и вопросы</h2>
                <div
                  className="twin-switch"
                  role="group"
                  aria-label="Вариант результата"
                >
                  <button
                    className={`button ${side === "A" ? "primary" : "secondary"}`}
                    aria-pressed={side === "A"}
                    onClick={() => setSide("A")}
                  >
                    Исходный результат
                  </button>
                  <button
                    className={`button ${side === "B" ? "primary" : "secondary"}`}
                    aria-pressed={side === "B"}
                    onClick={() => setSide("B")}
                  >
                    Изменённый результат
                  </button>
                </div>
                <div className="twin-columns" data-side={side}>
                  {(["A", "B"] as const).map((s) => (
                    <article className={`twin-side-${s}`} key={s}>
                      <h3>
                        {s === "A"
                          ? "Исходный результат"
                          : "Изменённый результат"}
                      </h3>
                      <VariantResult
                        result={
                          audit.runs.find((r) => r.variant === s)?.result ??
                          null
                        }
                        variant={definition.variants[s]}
                        domains={definition.domains}
                      />
                    </article>
                  ))}
                </div>
              </section>
              <section id="twin-review" className="twin-review">
                <h2>Разбор сотрудника</h2>
                <p>
                  Ваше заключение не меняет программное сравнение и не
                  переносится в оценку кандидата.
                </p>
                <label className="field">
                  Заключение
                  <select
                    value={verdict}
                    onChange={(e) =>
                      setVerdict(e.target.value as keyof typeof twinVerdicts)
                    }
                  >
                    {Object.entries(twinVerdicts).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Пояснение к сравнению
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="Какие факты и основания вы сопоставили? Чем объясняется различие или непригодность пары?"
                  />
                </label>
                <button
                  className="button primary"
                  disabled={
                    processing || reviewTask.busy || note.trim().length < 15
                  }
                  onClick={() =>
                    reviewTask.run(async () => {
                      await action("twin.review", {
                        applicationId,
                        auditId: audit.id,
                        version: audit.version,
                        baseReviewId: audit.reviews[0]?.id ?? null,
                        verdict,
                        note,
                        requestKey: reviewKey,
                      });
                      setAudit(
                        await action<TwinAuditView>("twin.status", {
                          applicationId,
                          auditId: audit.id,
                        }),
                      );
                      setNote("");
                      setReviewKey(crypto.randomUUID());
                    }, "Разбор сохранён")
                  }
                >
                  Сохранить разбор
                </button>
                <Feedback task={reviewTask} />
                {audit.reviews.map((r) => (
                  <div className="twin-review-entry" key={r.id}>
                    <strong>{twinVerdicts[r.verdict]}</strong>
                    <p>{r.note}</p>
                    <p>
                      {r.author} · {dateLabel(r.createdAt)} · просмотренные
                      версии сохранены
                    </p>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
      <p className="twin-end">
        <Link
          className="text-link"
          href={`/admissions/candidates/${applicationId}`}
        >
          Вернуться в официальный профиль →
        </Link>
      </p>
    </div>
  );
}
function VariantMaterial({ variant: v }: { variant: TwinVariant }) {
  return (
    <>
      {v.background && (
        <div className="twin-background">
          <strong>Исходные неоценочные поля</strong>
          <p>
            Школа: {v.background.school}
            <br />
            Регион: {v.background.region}
          </p>
          <p>Эти поля не включены в оценочный пакет.</p>
        </div>
      )}
      <h4>Опыт</h4>
      <p>{v.input.facts.experience}</p>
      <h4>Личная роль</h4>
      <p>{v.input.facts.personalRole}</p>
      {v.input.sources
        .filter((s) => s.title === "Повторное описание проекта")
        .map((s) => (
          <div key={s.id}>
            <h4>{s.title}</h4>
            <p>{s.text}</p>
            <p>Связан с тем же жизненным эпизодом.</p>
          </div>
        ))}
      {v.input.language && (
        <div className="twin-background">
          <h4>Отдельное языковое заключение</h4>
          <p>{v.input.language.conclusion}</p>
        </div>
      )}
      <details>
        <summary>Факты, отмеченные при подготовке пары</summary>
        {v.facts.map((f) => (
          <p key={f.id}>
            <strong>{f.label}:</strong> {f.value}
          </p>
        ))}
      </details>
      <details>
        <summary>Состав оценочного пакета</summary>
        <p>Программа: {v.input.facts.program}</p>
        <p>Мотивация: {v.input.facts.motivation}</p>
        <p>
          Опыт и роль приведены выше. Критерии: {v.input.criteria.rubricVersion}
          . Уточнений сотрудника: {v.input.clarifications.length}.
        </p>
        <ul>
          {v.input.sources.map((s) => (
            <li key={s.id}>
              {s.title} · {s.kind} ·{" "}
              {s.text ? "текст" : "материал без извлечённого текста"}
            </li>
          ))}
        </ul>
        <p>
          Школа, регион, доход, контакты, достижения и ключи теста в пакет не
          добавлены.
        </p>
      </details>
    </>
  );
}
function VariantResult({
  result: r,
  variant: v,
  domains,
}: {
  result: ScoringResult | null;
  variant: TwinVariant;
  domains: string[];
}) {
  if (!r) return <p>Завершённого результата нет.</p>;
  return (
    <>
      <p>{r.summary}</p>
      <p>
        <strong>{scoringActions[r.recommendation.action]}</strong>
        <br />
        {r.recommendation.reason}
      </p>
      {domains.map((domain) => {
        const d = r.domains.find((d) => d.domain === domain)!;
        return (
          <details className="twin-domain" key={domain}>
            <summary>
              {domain} · {d.rating?.label ?? "Оценка не установлена"}
            </summary>
            <p>
              Достаточность: {d.sufficiency}. {d.consistency}.
            </p>
            <p>{d.interpretation}</p>
            <p>Пробелы: {d.gaps.join(" ") || "Не отмечены"}</p>
            {r.evidence
              .filter((e) => d.evidenceIds.includes(e.id))
              .map((e) => {
                const source = v.input.sources.find(
                  (s) => s.id === e.sourceId,
                )!;
                return (
                  <div className="twin-evidence" key={e.id}>
                    <blockquote>{e.quote}</blockquote>
                    <p>{e.explanation}</p>
                    <details>
                      <summary>Открыть источник: {source.title}</summary>
                      <div className="twin-source">
                        <p>{source.text}</p>
                        <p>
                          Собственная версия материала этого варианта. Эпизод:{" "}
                          {v.sourceLinks.find((s) => s.sourceId === source.id)
                            ?.episode
                            ? "библиотечный проект"
                            : "не установлен"}
                          . Просмотр не подтверждает истинность.
                        </p>
                      </div>
                    </details>
                  </div>
                );
              })}
            {r.questions
              .filter((q) => q.domain === domain)
              .map((q) => (
                <p key={q.id}>
                  <strong>Вопрос:</strong> {q.text}
                  <br />
                  Пробел: {q.gap}
                </p>
              ))}
          </details>
        );
      })}
    </>
  );
}
