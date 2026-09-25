"use client";
import { useId, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { reorderItems } from "@/lib/reorder";

export function SortableSequence({
  items,
  value,
  onChange,
  disabled = false,
  removable = false,
}: {
  items: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  removable?: boolean;
}) {
  const id = useId();
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    target: string;
  } | null>(null);
  const [active, setActive] = useState<string | null>(null),
    [target, setTarget] = useState<string | null>(null);
  const [swap, setSwap] = useState(false),
    [notice, setNotice] = useState("");
  function move(from: string, to: string) {
    if (disabled) return;
    onChange(reorderItems(value, value.indexOf(from), value.indexOf(to), swap));
    setNotice(
      `${items.find((i) => i.id === from)?.label}: позиция ${value.indexOf(to) + 1}`,
    );
  }
  return (
    <div className="sequence-editor">
      <div className="sequence-toolbar">
        <p id={id}>Перетащи за ручку или выбери номер позиции.</p>
        <label>
          При переносе
          <select
            value={swap ? "swap" : "move"}
            onChange={(e) => setSwap(e.target.value === "swap")}
            disabled={disabled}
          >
            <option value="move">Сдвинуть порядок</option>
            <option value="swap">Поменять местами</option>
          </select>
        </label>
      </div>
      <ol ref={list} className="sortable-sequence" aria-describedby={id}>
        {value.map((key, i) => {
          const label = items.find((x) => x.id === key)?.label ?? key;
          return (
            <li
              key={key}
              data-sort-id={key}
              className={`${active === key ? "is-dragging" : ""} ${target === key && active !== key ? "drop-target" : ""}`}
            >
              <button
                type="button"
                className="sequence-handle"
                aria-label={`Переместить: ${label}`}
                disabled={disabled}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    const to =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? value.length - 1
                          : i + (e.key === "ArrowUp" ? -1 : 1);
                    if (value[to]) move(key, value[to]);
                  }
                }}
                onPointerDown={(e) => {
                  if (disabled || e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.focus();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    id: key,
                    x: e.clientX,
                    y: e.clientY,
                    target: key,
                  };
                  setActive(key);
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const row = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest<HTMLElement>("[data-sort-id]");
                  if (row && list.current?.contains(row)) {
                    drag.current.target = row.dataset.sortId!;
                    setTarget(drag.current.target);
                  }
                }}
                onPointerUp={(e) => {
                  const d = drag.current;
                  if (d) {
                    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5)
                      move(d.id, d.target);
                    drag.current = null;
                    setActive(null);
                    setTarget(null);
                  }
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setActive(null);
                  setTarget(null);
                }}
              >
                <GripVertical size={20} />
              </button>
              <span className="sequence-label">{label}</span>
              <select
                className="sequence-position"
                aria-label={`Позиция: ${label}`}
                value={i}
                disabled={disabled}
                onChange={(e) => move(key, value[Number(e.target.value)])}
              >
                {value.map((_, j) => (
                  <option key={j} value={j}>
                    {j + 1}
                  </option>
                ))}
              </select>
              {removable && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Убрать: ${label}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v !== key))}
                >
                  <X size={18} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <span className="sr-only" role="status">
        {notice}
      </span>
    </div>
  );
}
