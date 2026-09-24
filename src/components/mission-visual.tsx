import { missions, type Mission } from "@/lib/missions";
/** Original vector drawings. They depict the task, not mock application controls. */
export function MissionVisual({
  slug,
  hero = false,
}: {
  slug: string;
  hero?: boolean;
}) {
  return (
    <svg
      className={`mission-visual ${hero ? "mission-visual-hero" : ""}`}
      viewBox="0 0 560 340"
      role="img"
      aria-label={missions[slug]?.title ?? "Проектная работа"}
    >
      <rect
        x="0"
        y="0"
        width="560"
        height="340"
        rx="24"
        fill={hero ? "#d8e7f0" : "#e8e5d9"}
      />
      <g
        stroke="#171914"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {slug === "creative-engineering" ? (
          <>
            <path d="M65 274H460V214" strokeDasharray="9 12" fill="none" />
            <path d="M390 274V115H487" strokeDasharray="9 12" fill="none" />
            <path d="M135 222L245 167L356 216L249 270Z" fill="#c4f44e" />
            <path
              d="M135 222V248L248 299V270M248 299L356 245V216"
              fill="#f8f5e9"
            />
            <ellipse cx="179" cy="267" rx="17" ry="24" fill="#171914" />
            <ellipse cx="305" cy="267" rx="17" ry="24" fill="#171914" />
            <path d="M179 185L242 154L317 187L253 221Z" fill="#f8f5e9" />
            <path
              d="M179 185V201L252 236L317 203V187M252 221V236"
              fill="#a8c6dd"
            />
            <path d="M180 163L242 131L318 164L252 198Z" fill="#c4f44e" />
            <path
              d="M180 163V177L252 210L318 178V164M252 198V210"
              fill="#f8f5e9"
            />
            <path d="M321 205V113" />
            <circle cx="321" cy="102" r="16" fill="#f8f5e9" />
            <path
              d="M365 93Q403 93 403 130M375 71Q427 71 427 124"
              fill="none"
            />
            <path d="M53 95L104 68L158 94L106 120Z" fill="#f8f5e9" />
            <path d="M53 95V144L106 170L158 143V94M106 120V170" fill="none" />
          </>
        ) : slug === "digital-products" ? (
          <>
            <path
              d="M155 86Q283 10 420 95M414 70L420 95L391 98M410 242Q285 315 148 245M156 270L148 245L177 238"
              fill="none"
            />
            <path d="M72 145L152 102L233 141L151 186Z" fill="#c4f44e" />
            <path
              d="M72 145V211L151 254L233 209V141M151 186V254"
              fill="#f8f5e9"
            />
            <path d="M101 162V203M121 173V214" />
            <path d="M327 125L403 84L483 123L405 167Z" fill="#a8c6dd" />
            <path
              d="M327 125V216L405 258L483 214V123M405 167V258"
              fill="#f8f5e9"
            />
            <path d="M356 147V199M378 159V210" />
            <circle cx="280" cy="170" r="34" fill="#c4f44e" />
            <path d="M266 170L277 181L296 156" fill="none" />
          </>
        ) : slug === "digital-media" ? (
          <>
            <path d="M125 48H351L421 113V295H125Z" fill="#f8f5e9" />
            <path d="M351 48V113H421" fill="#c4f44e" />
            <path d="M158 88H282M158 109H263" />
            <rect
              x="156"
              y="143"
              width="160"
              height="102"
              rx="2"
              fill="#a8c6dd"
            />
            <path d="M156 228L198 185L231 214L260 177L316 232" fill="#c4f44e" />
            <circle cx="193" cy="166" r="11" fill="#f8f5e9" />
            <path d="M341 155H388M341 180H388M341 206H376M158 267H335" />
            <path d="M93 131L65 111M93 159H57M100 187L77 209" fill="none" />
          </>
        ) : slug === "sociology" ? (
          <>
            <path
              d="M169 114L278 209L410 113M136 245L278 209L445 250"
              fill="none"
              strokeDasharray="7 9"
            />
            <path d="M77 58H213V138H165L147 160V138H77Z" fill="#c4f44e" />
            <path d="M329 45H481V129H383L362 151V129H329Z" fill="#f8f5e9" />
            <circle cx="138" cy="237" r="29" fill="#f8f5e9" />
            <path d="M91 296Q137 251 185 296" fill="#a8c6dd" />
            <circle cx="433" cy="232" r="29" fill="#f8f5e9" />
            <path d="M386 291Q432 246 480 291" fill="#a8c6dd" />
            <circle cx="278" cy="209" r="35" fill="#f8f5e9" />
            <path
              d="M267 199Q281 185 291 200Q295 208 280 217M280 230V231"
              fill="none"
            />
            <path d="M99 85H179M99 110H152M352 72H453M352 98H426" />
          </>
        ) : (
          <>
            <path d="M75 155L273 65L487 160L280 260Z" fill="#f8f5e9" />
            <path
              d="M75 155V214L280 308L487 213V160M280 260V308"
              fill="#a8c6dd"
            />
            <path d="M176 110L385 209M172 201L375 111" />
            <path d="M110 153L176 124L235 151L168 183Z" fill="#c4f44e" />
            <path d="M214 206L280 177L339 204L272 236Z" fill="#c4f44e" />
            <circle cx="291" cy="111" r="13" fill="#f8f5e9" />
            <path d="M273 156V143Q290 120 307 143V156" fill="#171914" />
            <circle cx="393" cy="162" r="13" fill="#f8f5e9" />
            <path d="M375 207V194Q392 171 409 194V207" fill="#171914" />
          </>
        )}
      </g>
    </svg>
  );
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
