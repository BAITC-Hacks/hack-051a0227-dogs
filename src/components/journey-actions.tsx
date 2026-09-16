"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ArrowRight, X } from "lucide-react";
import { programs } from "@/lib/catalog";
import { initialState } from "@/lib/projects";
import { workHref, type Milestone } from "@/lib/journey";
import { action } from "@/lib/client";
import { WorkPreview } from "./work-preview";
import { Feedback, useTask } from "./ui";
const descriptions: Record<string, string> = {
  "digital-products":
    "Переставь экраны и проверь, пройдёт ли посетитель без телефона.",
  "digital-media": "Собери фрагменты истории, исправь время и напиши подпись.",
  "creative-engineering": "Размести модули: сохрани проход и уложись в ресурс.",
  sociology:
    "Отдели наблюдения от предположений и сформулируй следующий вопрос.",
  "public-policy":
    "Распредели 12 единиц между тремя потребностями и объясни компромисс.",
};
export function WorkshopChoices({ tried = [] }: { tried?: string[] }) {
  return (
    <section className="workshop-choices" id="workshop-choices">
      <div className="section-heading">
        <h2>{tried.length ? "Что попробовать дальше" : "Выбери действие"}</h2>
        <p>
          Пять самостоятельных проб. Можно начать с любой или сразу подать
          заявку.
        </p>
      </div>
      <div className="workshop-choice-grid">
        {programs.map((p) => (
          <article className={`workshop-choice ${p.color}`} key={p.slug}>
            <div className="choice-copy">
              <p className="eyebrow">
                {p.shortTitle}
                {tried.includes(p.slug) ? " · уже есть работа" : ""}
              </p>
              <h3>{p.action}</h3>
              <p>{descriptions[p.slug]}</p>
              <Link className="text-link" href={`/projects/${p.slug}`}>
                {tried.includes(p.slug) ? "Открыть мастерскую" : "Попробовать"}
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="choice-preview" aria-label="Материал для пробы">
              <WorkPreview slug={p.slug} state={initialState} compact />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function ContextStart({
  versionId,
  primary = false,
}: {
  versionId: string;
  primary?: boolean;
}) {
  const task = useTask(),
    router = useRouter();
  return (
    <div>
      <button
        className={`button ${primary ? "dark" : "secondary"}`}
        disabled={task.busy}
        onClick={() =>
          task.run(async () => {
            const next = await action<{ id: string; slug: string }>(
              "project.context",
              { versionId },
            );
            router.push(workHref(next));
          })
        }
      >
        Попробовать бронирование <ArrowRight size={17} />
      </button>
      <Feedback task={task} />
    </div>
  );
}
export function MilestoneMarks({ items }: { items: Milestone[] }) {
  if (!items.length) return null;
  return (
    <ul className="milestone-marks" aria-label="Личные достижения">
      {items.map((m) => (
        <li key={m.key}>
          <Link
            href={workHref({ id: m.attemptId, slug: m.slug }, m.revision)}
            className="milestone-stamp"
          >
            {m.title}
          </Link>
          <p>
            {m.description} Подтверждение: версия {m.revision}.
          </p>
        </li>
      ))}
    </ul>
  );
}
const key = "leader-workspace-tip-1";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};
function wasDismissed() {
  try {
    return localStorage.getItem(key) === "closed";
  } catch {
    return false;
  }
}
export function WorkspaceTip() {
  const stored = useSyncExternalStore(subscribe, wasDismissed, () => false),
    [closed, setClosed] = useState(false);
  if (stored || closed) return null;
  return (
    <aside className="workspace-tip">
      <p>
        Меняй работу, проверяй условия и сохраняй варианты. До отправки в заявку
        её видишь только ты.
      </p>
      <button
        className="icon-button"
        aria-label="Закрыть подсказку"
        onClick={() => {
          setClosed(true);
          try {
            localStorage.setItem(key, "closed");
            window.dispatchEvent(new Event("storage"));
          } catch {}
        }}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
