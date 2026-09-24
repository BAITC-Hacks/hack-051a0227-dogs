"use client";
import { useState, type ReactNode } from "react";
import { AlertCircle, Check, LoaderCircle, } from "lucide-react";
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run(fn: () => Promise<void>, success = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(success);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Действие прервалось. Повторите попытку.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, run, setNotice };
}
export function Feedback({
  task,
}: {
  task: { busy: boolean; error: string; notice: string };
}) {
  return (
    <div aria-live="polite" aria-atomic="true" className="feedback-status">
      {task.busy && (
        <span className="muted inline">
          <LoaderCircle size={16} className="spin" /> Выполняется…
        </span>
      )}
      {task.error && (
        <p role="alert" className="notice error">
          <AlertCircle size={18} />
          {task.error}
        </p>
      )}
      {task.notice && (
        <p className="notice success">
          <Check size={18} />
          {task.notice}
        </p>
      )}
    </div>
  );
}
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-link">
      {children}

    </a>
  );
}
