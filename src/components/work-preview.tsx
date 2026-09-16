import { screenNames, fragments, modules, testimonies } from "@/lib/projects";
import { equipmentNames, equipmentSchema } from "@/lib/equipment";
import type { ProjectState } from "@/lib/types";
export function WorkPreview({
  slug,
  state,
  context = "WORKSHOP",
  compact = false,
}: {
  slug: string;
  state: unknown;
  context?: string;
  compact?: boolean;
}) {
  const s = state as ProjectState;
  if (context === "EQUIPMENT") {
    const b = equipmentSchema.parse(state);
    return (
      <div className="work-preview route-preview">
        <ol>
          {b.screens.map((k) => (
            <li key={k}>{equipmentNames[k]}</li>
          ))}
        </ol>
        <p>Камера · 16:00 занято, 17:00 свободно</p>
        <p>
          {b.unavailable === "alternatives"
            ? "Предложить свободное время"
            : "Бронь без проверки занятого времени"}{" "}
          · Телефон {b.requiredPhone ? "обязателен" : "по желанию"}
        </p>
      </div>
    );
  }
  if (slug === "digital-products")
    return (
      <div className="work-preview route-preview">
        <ol>
          {s.screens.map((k) => (
            <li key={k}>{screenNames[k]}</li>
          ))}
        </ol>
        <p>Телефон {s.requiredPhone ? "обязателен" : "по желанию"}</p>
      </div>
    );
  if (slug === "digital-media")
    return (
      <div className="work-preview media-preview">
        <strong>{s.headline || "Заголовок ещё не добавлен"}</strong>
        <ol>
          {s.fragments.map((k) => (
            <li key={k}>
              <span>{fragments[k].title}</span>
              {!compact && <p>{fragments[k].text}</p>}
            </li>
          ))}
        </ol>
        <p>{s.caption || "Подпись ещё не добавлена"}</p>
      </div>
    );
  if (slug === "creative-engineering")
    return (
      <div className="work-preview plan-preview">
        <div
          className="mini-plan"
          aria-label="Схема: четыре столбца, три строки"
        >
          {Array.from({ length: 12 }, (_, cell) => {
            const m = s.modules.find((m) => m.cell === cell);
            return (
              <div
                key={cell}
                className={m ? "occupied" : cell % 4 === 3 ? "passage" : ""}
              >
                <span>{cell + 1}</span>
                <strong>
                  {m ? modules[m.kind].title : cell % 4 === 3 ? "Проход" : "—"}
                </strong>
              </div>
            );
          })}
        </div>
        <p>
          Ресурс: {s.modules.reduce((n, m) => n + modules[m.kind].cost, 0)} из
          12
        </p>
      </div>
    );
  if (slug === "sociology")
    return (
      <div className="work-preview research-preview">
        <p className="eyebrow">Исследовательская записка</p>
        <p>{s.note || "Вывод ещё не записан"}</p>
        <strong>Следующий вопрос</strong>
        <p>{s.question || "Вопрос ещё не выбран"}</p>
        {!compact && (
          <ul>
            {testimonies.map((t) => (
              <li key={t.id}>
                {t.text}{" "}
                <strong>
                  {s.classifications[t.id] === "observation"
                    ? "Наблюдение"
                    : s.classifications[t.id] === "assumption"
                      ? "Предположение"
                      : "Без отметки"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  return (
    <div className="work-preview resource-preview">
      <dl>
        {["Материалы", "Помощники", "Тихие места"].map((label, i) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {s.allocations[i]} ед. · для {s.allocations[i] * [5, 3, 2][i]}{" "}
              участников
            </dd>
          </div>
        ))}
      </dl>
      <p>{s.explanation || "Объяснение компромисса ещё не добавлено"}</p>
    </div>
  );
}
