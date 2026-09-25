import { missions, type Mission } from "@/lib/missions";
import { InvisionIllustration } from "./invision-illustration";
/** Generated editorial artwork introduces the task; results below use the actual plan. */
export function MissionVisual({
  slug,
  hero = false,
}: {
  slug: string;
  hero?: boolean;
}) {
  return <InvisionIllustration asset={slug} hero={hero} />;
}
export function MissionArtifact({
  mission: m,
  compact = false,
}: {
  mission: Mission;
  compact?: boolean;
}) {
  const d = missions[m.slug],
    p = m.plan;
  return (
    <div className={`mission-artifact artifact-${m.slug}`}>
      {m.slug === "creative-engineering" && <MissionRobot mission={m} />}
      {m.slug === "digital-media" && (
        <h3>{p.headline || "Заголовок публикации"}</h3>
      )}
      {d.sequence && (
        <ol className="mission-sequence-preview">
          {p.sequence.map((id) => (
            <li key={id}>
              {d.sequence?.items.find((o) => o.id === id)?.label}
              {m.slug === "digital-media" && (
                <p>
                  {
                    (
                      {
                        log: "По журналу выдачи передано 27 книг.",
                        organizer:
                          m.phase === "UPDATED"
                            ? "Организатор уточнил: 29 уникальных регистраций. Число пришедших не установлено."
                            : "Организатор сообщил о 40 регистрациях. Это не число посетителей.",
                        participant:
                          "Участница: «Мне удалось найти учебник без покупки». Это её личный опыт.",
                        photo:
                          "Фотография очереди у стойки показывает один момент встречи.",
                      } as Record<string, string>
                    )[id]
                  }
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {m.slug === "public-policy" && (
        <div className="mission-resource-preview">
          {["Подростки", "Взрослые", "Проектная группа"].map((label, i) => (
            <div key={label}>
              <strong>{label}</strong>
              <div className="resource-slots" aria-hidden="true">
                {Array.from({ length: p.allocations[i] }, (_, n) => (
                  <span key={n} />
                ))}
              </div>
              <span>Занятий: {p.allocations[i]}</span>
            </div>
          ))}
        </div>
      )}
      <dl className="mission-facts">
        {d.fields
          .filter((f) => !compact || d.fields.indexOf(f) < 3)
          .map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>{f.options.find((o) => o.id === p.choices[f.id])?.label}</dd>
            </div>
          ))}
      </dl>
      {!compact && p.explanation && (
        <p>
          <strong>Мой компромисс. </strong>
          {p.explanation}
        </p>
      )}
      {!compact && p.verification && (
        <p>
          <strong>Как проверить. </strong>
          {p.verification}
        </p>
      )}
      <p className="subtle">
        {m.phase === "INITIAL" ? "Исходные условия" : "С учётом нового условия"}
      </p>
    </div>
  );
}

export function MissionRobot({
  mission: m,
  editable = false,
}: {
  mission: Mission;
  editable?: boolean;
}) {
  const c = m.plan.choices,
    cargo = c.chassis === "cargo",
    mass = m.phase === "UPDATED" ? 4 : 2,
    trips = c.trips === "two" ? 2 : 1,
    closed = m.phase === "UPDATED",
    detour = c.route === "detour",
    energy = (detour ? 10 : 6) * (cargo ? 2 : 1) * trips + mass;
  return (
    <figure className="robot-model">
      <svg
        viewBox="0 0 640 260"
        role="img"
        aria-label={`Сборка: ${cargo ? "грузовое" : "лёгкое"} шасси, ${c.battery === "large" ? "большая" : "компактная"} батарея, ${detour ? "объезд" : "прямой путь"}`}
      >
        <rect width="640" height="260" rx="14" fill="#e1ecf6" />
        <g stroke="#20251d" strokeWidth="3" strokeLinejoin="round">
          <path
            d="M250 140H550"
            fill="none"
            strokeDasharray="7 7"
            opacity={detour ? 0.2 : 1}
          />
          <path
            d="M250 140V45H550V140"
            fill="none"
            strokeDasharray="7 7"
            opacity={detour ? 1 : 0.2}
          />
          {closed && (
            <g stroke="#a32b24">
              <path d="M390 120L425 155M425 120L390 155" />
            </g>
          )}
          <rect
            x="60"
            y="139"
            width={cargo ? 160 : 130}
            height="39"
            rx="10"
            fill="#c0f336"
          />
          <circle cx="86" cy="181" r="21" fill="#20251d" />
          <circle cx={cargo ? 196 : 164} cy="181" r="21" fill="#20251d" />
          {Array.from({ length: mass / trips }, (_, i) => (
            <rect
              key={i}
              x="88"
              y={119 - i * 15}
              width="83"
              height="14"
              rx="3"
              fill={i % 2 ? "#c0f336" : "#fffef8"}
            />
          ))}
          <rect
            x="100"
            y="149"
            width="48"
            height="18"
            rx="2"
            fill={c.battery === "large" ? "#20251d" : "#fffef8"}
          />
          {c.sensor === "yes" && (
            <>
              <path d="M205 138V104" />
              <circle cx="205" cy="98" r="9" fill="#fffef8" />
            </>
          )}
          <path d="M535 147V109H602V147M543 109V94H592V109" fill="#fffef8" />
        </g>
        <g fill="#20251d" fontSize="17" fontFamily="sans-serif">
          <text x="295" y="30">
            Объезд: 10 м
          </text>
          <text x="324" y="184">
            {closed ? "Прямой путь закрыт" : "Прямой путь: 6 м"}
          </text>
        </g>
      </svg>
      <figcaption>
        <strong>Расчёт выбранной сборки:</strong> груз за поездку {mass / trips}{" "}
        кг; расход {energy}, запас {c.battery === "large" ? 28 : 14}.{" "}
        {trips === 2 ? "Две поездки учтены." : "Одна поездка."}{" "}
        {editable
          ? "Запуск ниже сохранит проверку."
          : "Расчёт относится к условиям этой сохранённой версии."}
      </figcaption>
    </figure>
  );
}
