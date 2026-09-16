"use client";
import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Play,
  Plug,
  Monitor,
  Armchair,
  Table2,
  Plus,
} from "lucide-react";
import { screenNames, fragments, modules, testimonies } from "@/lib/projects";
import type { ProjectState } from "@/lib/types";
type BaseProps = {
  state: ProjectState;
  update: <K extends keyof ProjectState>(
    key: K,
    value: ProjectState[K],
  ) => void;
};
type SortProps = BaseProps & {
  reorder: (key: "screens" | "fragments", i: number, direction: number) => void;
};
const moduleIcons = {
  desk: Table2,
  power: Plug,
  seat: Armchair,
  screen: Monitor,
};

export function ProductWorkspace({ state, update, reorder }: SortProps) {
  const [preview, setPreview] = useState(false);
  const [phoneStep, setPhoneStep] = useState(0);
  const [choice, setChoice] = useState("");
  const currentScreen = state.screens[phoneStep];
  const move: SortProps["reorder"] = (key, i, direction) => {
    reorder(key, i, direction);
    setPhoneStep(0);
  };
  return (
    <div className="editor-grid">
      <div>
        <h3>Последовательность экранов</h3>
        <p className="subtle" style={{ margin: "10px 0 18px" }}>
          Используй стрелки, чтобы изменить порядок.
        </p>
        <div className="sequence">
          {state.screens.map((s, i) => (
            <div className="sequence-item" key={s}>
              <span className="sequence-index">{i + 1}</span>
              <span className="sequence-title">{screenNames[s]}</span>
              <div className="move-controls">
                <button
                  className="icon-button"
                  disabled={i === 0}
                  onClick={() => move("screens", i, -1)}
                  aria-label={`Поднять ${screenNames[s]}`}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={i === 2}
                  onClick={() => move("screens", i, 1)}
                  aria-label={`Опустить ${screenNames[s]}`}
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <label className="check-label" style={{ marginTop: 22 }}>
          <input
            type="checkbox"
            checked={state.requiredPhone}
            onChange={(e) => update("requiredPhone", e.target.checked)}
          />
          Телефон обязателен
        </label>
        <button
          className="button secondary small"
          style={{ marginTop: 20 }}
          onClick={() => {
            setPreview(!preview);
            setPhoneStep(0);
            setChoice("");
          }}
        >
          <Play size={15} />
          {preview ? "Закрыть прохождение" : "Пройти маршрут"}
        </button>
      </div>
      <div className="phone-preview">
        <div className="phone-top">
          <span>Открытая площадка</span>
          <span>{preview ? phoneStep + 1 : 1} / 3</span>
        </div>
        <h3>{screenNames[preview ? currentScreen : state.screens[0]]}</h3>
        {(preview ? currentScreen : state.screens[0]) === "event" ? (
          <div className="phone-choices">
            {["Создавать", "Исследовать"].map((x) => (
              <button
                key={x}
                aria-pressed={choice === x}
                onClick={() => setChoice(x)}
              >
                {x}
              </button>
            ))}
          </div>
        ) : (preview ? currentScreen : state.screens[0]) === "profile" ? (
          <>
            <div className="phone-field">Имя участника</div>
            <div
              className={`phone-field ${state.requiredPhone ? "" : "optional"}`}
            >
              Телефон {state.requiredPhone ? "· обязательно" : "· по желанию"}
            </div>
            <p className="subtle">Алия без личного телефона</p>
          </>
        ) : (
          <p className="subtle">
            {choice
              ? `Мастерская: ${choice}. Встречаемся в 16:00.`
              : "Мастерская ещё не выбрана. Вернись к выбору."}
          </p>
        )}
        {preview && (
          <button
            className="button primary"
            disabled={currentScreen === "profile" && state.requiredPhone}
            onClick={() => {
              if (phoneStep < 2) setPhoneStep((s) => s + 1);
              else {
                setPhoneStep(0);
                setPreview(false);
              }
            }}
          >
            {phoneStep === 2 ? "Завершить просмотр" : "Продолжить"}
            <ArrowRight size={15} />
          </button>
        )}
        {preview && currentScreen === "profile" && state.requiredPhone && (
          <p className="notice error" style={{ marginTop: 12 }}>
            Алия не может пройти: обязательного телефона нет.
          </p>
        )}
      </div>
    </div>
  );
}

export function MediaWorkspace({ state, update, reorder }: SortProps) {
  const [preview, setPreview] = useState(false);
  const move = reorder;
  return (
    <>
      <div className="media-strip">
        {state.fragments.map((f, i) => (
          <div className={"media-fragment " + f} key={f}>
            <span className="subtle">
              {i + 1} / {state.fragments.length}
            </span>
            <div className="fragment-art">
              {f === "time"
                ? "16:00"
                : f === "place"
                  ? "Открыто."
                  : f === "people"
                    ? "Вместе."
                    : "Отмена?"}
            </div>
            <h3>{fragments[f].title}</h3>
          </div>
        ))}
      </div>
      <div className="sequence">
        {state.fragments.map((f, i) => (
          <div className="sequence-item" key={f}>
            <span className="sequence-title">{fragments[f].title}</span>
            <div className="move-controls">
              <button
                className="icon-button"
                disabled={i === 0}
                onClick={() => move("fragments", i, -1)}
                aria-label={`Поднять фрагмент ${i + 1}`}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-button"
                disabled={i === state.fragments.length - 1}
                onClick={() => move("fragments", i, 1)}
                aria-label={`Опустить фрагмент ${i + 1}`}
              >
                <ArrowDown size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className="check-label" style={{ margin: "16px 0" }}>
        <input
          type="checkbox"
          checked={state.fragments.includes("cancel")}
          onChange={(e) =>
            update(
              "fragments",
              e.target.checked
                ? [...state.fragments, "cancel"]
                : state.fragments.filter((f) => f !== "cancel"),
            )
          }
        />
        Включить фрагмент со слухом об отмене
      </label>
      <div className="stack">
        <label className="field">
          Заголовок
          <input
            maxLength={180}
            value={state.headline}
            onChange={(e) => update("headline", e.target.value)}
          />
        </label>
        <label className="field">
          Подпись
          <textarea
            maxLength={800}
            value={state.caption}
            onChange={(e) => update("caption", e.target.value)}
          />
        </label>
      </div>
      <button
        className="button secondary small"
        style={{ marginTop: 18 }}
        onClick={() => setPreview(!preview)}
      >
        <Play size={16} />
        {preview ? "Закрыть просмотр" : "Посмотреть историю"}
      </button>
      {preview && (
        <div className="story-preview">
          <h3>{state.headline}</h3>
          {state.fragments.map((f) => (
            <p key={f}>
              <strong>{fragments[f].title}</strong>
              <br />
              {fragments[f].text}
            </p>
          ))}
          <p>{state.caption}</p>
        </div>
      )}
    </>
  );
}

export function EngineeringWorkspace({ state, update }: BaseProps) {
  const [selectedModule, setSelectedModule] = useState("desk");
  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h3>Схема площадки</h3>
        <span className="subtle">Выбери модуль, затем клетку</span>
      </div>
      <div className="module-palette">
        {Object.entries(modules).map(([k, m]) => (
          <button
            key={k}
            aria-pressed={selectedModule === k}
            onClick={() => setSelectedModule(k)}
          >
            {m.title}
            <br />
            <span className="subtle">{m.cost} ед.</span>
          </button>
        ))}
      </div>
      <div className="scheme-grid">
        {Array.from({ length: 12 }, (_, cell) => {
          const m = state.modules.find((m) => m.cell === cell);
          const Icon = m
            ? moduleIcons[m.kind as keyof typeof moduleIcons]
            : Plus;
          return (
            <button
              className={`scheme-cell ${m ? "occupied" : ""} ${cell % 4 === 3 ? "aisle" : ""}`}
              key={cell}
              aria-label={`Клетка ${cell + 1}: ${m ? modules[m.kind].title : cell % 4 === 3 ? "проход" : "свободно"}`}
              onClick={() =>
                update(
                  "modules",
                  m
                    ? state.modules.filter((m) => m.cell !== cell)
                    : [...state.modules, { kind: selectedModule, cell }],
                )
              }
            >
              <Icon size={25} />
              {m
                ? modules[m.kind].title
                : cell % 4 === 3
                  ? "Проход"
                  : "Поставить"}
              <span>{`Клетка ${cell + 1}`}</span>
            </button>
          );
        })}
      </div>
      <p className="subtle" style={{ marginTop: 16 }}>
        Расход: {state.modules.reduce((n, m) => n + modules[m.kind].cost, 0)} /
        12 единиц. Нажми занятый модуль, чтобы убрать его.
      </p>
    </>
  );
}

export function SociologyWorkspace({ state, update }: BaseProps) {
  return (
    <>
      <h3>Что мы знаем из материалов?</h3>
      {testimonies.map((t) => (
        <div className="statement" key={t.id}>
          <p>{t.text}</p>
          <div className="segmented" role="group" aria-label={t.text}>
            <button
              aria-pressed={state.classifications[t.id] === "observation"}
              onClick={() =>
                update("classifications", {
                  ...state.classifications,
                  [t.id]: "observation",
                })
              }
            >
              Наблюдение
            </button>
            <button
              aria-pressed={state.classifications[t.id] === "assumption"}
              onClick={() =>
                update("classifications", {
                  ...state.classifications,
                  [t.id]: "assumption",
                })
              }
            >
              Предположение
            </button>
          </div>
        </div>
      ))}
      <div className="stack" style={{ marginTop: 24 }}>
        <label className="field">
          Кого и о чём спросишь следующим?
          <select
            value={state.question}
            onChange={(e) => update("question", e.target.value)}
          >
            <option value="">Выбери исследовательский вопрос</option>
            <option>
              Что мешает участвовать тем, кто не ходит в библиотеку?
            </option>
            <option>
              Как различается удобное время у разных групп школьников?
            </option>
            <option>Какие мастерские интересны нынешним посетителям?</option>
          </select>
        </label>
        <label className="field">
          Исследовательская записка
          <textarea
            value={state.note}
            onChange={(e) => update("note", e.target.value)}
            maxLength={2000}
            placeholder="Вывод, ограничение данных и способ проверить предположение"
          />
        </label>
      </div>
    </>
  );
}

export function PolicyWorkspace({ state, update }: BaseProps) {
  return (
    <>
      <div className="budget-total">
        <h3>Общий ресурс</h3>
        <strong>
          {state.allocations.reduce((a, b) => a + b, 0)}{" "}
          <span className="subtle">/ 12</span>
        </strong>
      </div>
      {["Материалы для мастерских", "Время наставников", "Тихие места"].map(
        (label, i) => {
          const total = [30, 18, 16][i],
            coverage = Math.min(state.allocations[i] * [5, 3, 4][i], total);
          return (
            <div className="allocation-row" key={label}>
              <div className="row">
                <label htmlFor={"allocation-" + i}>{label}</label>
                <output htmlFor={"allocation-" + i}>
                  {state.allocations[i]} ед.
                </output>
              </div>
              <input
                id={"allocation-" + i}
                type="range"
                min="0"
                max="12"
                step="1"
                value={state.allocations[i]}
                onChange={(e) =>
                  update(
                    "allocations",
                    state.allocations.map((v, j) =>
                      j === i ? Number(e.target.value) : v,
                    ),
                  )
                }
              />
              <div className="coverage">
                <span style={{ transform: `scaleX(${coverage / total})` }} />
              </div>
              <span className="subtle">
                Покрыто {coverage} из {total} запросов ·{" "}
                {state.allocations[i] * [5, 3, 4][i] > total
                  ? "Часть ресурса превышает потребность"
                  : "по правилам задачи"}
              </span>
            </div>
          );
        },
      )}
      <label className="field">
        Какой компромисс ты выбрал?
        <textarea
          value={state.explanation}
          onChange={(e) => update("explanation", e.target.value)}
          maxLength={2000}
          placeholder="Кому помог план, чью потребность пришлось отложить и почему?"
        />
      </label>
    </>
  );
}
