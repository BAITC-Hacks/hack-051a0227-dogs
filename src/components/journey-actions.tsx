"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { programs } from "@/lib/catalog";
import { missions } from "@/lib/missions";
import { MissionVisual } from "./mission-visual";
import { workHref, type Milestone } from "@/lib/journey";
import { action } from "@/lib/client";

import { Feedback, useTask } from "./ui";
export function WorkshopChoices({
  tried = [],
  id = "workshop-choices",
  exclude = [],
  title,
}: {
  tried?: string[];
  id?: string;
  exclude?: string[];
  title?: string;
}) {
  return (
    <section className="workshop-choices" id={id}>
      <div className="section-heading">
        <h2>
          {title ??
            (tried.length ? "Что попробовать дальше" : "Выбери действие")}
        </h2>
        <p>
          Самостоятельные пробы. Можно начать с любой или сразу подать заявку.
        </p>
      </div>
      <div className="workshop-choice-grid">
        {programs
          .filter((p) => !exclude.includes(p.slug))
          .map((p) => (
            <article className={`workshop-choice ${p.color}`} key={p.slug}>
              <div className="choice-copy">
                <p className="eyebrow">
                  {p.title}
                  {tried.includes(p.slug) ? " · уже есть работа" : ""}
                </p>
                <h3>{p.action}</h3>
                <p>{missions[p.slug].goal}</p>
                <Link className="text-link" href={`/projects/${p.slug}`}>
                  {tried.includes(p.slug) ? "Открыть мастерскую" : "Начать"}
                </Link>
              </div>
              <div className="choice-preview" aria-label="Материал для пробы">
                <MissionVisual slug={p.slug} />
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
        Попробовать бронирование
      </button>
      <p className="subtle context-reward">
        Дополнительно: примени порядок шагов к бронированию оборудования.
        Сохранённое решение по условиям даст +5 поинтов один раз.
      </p>
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
