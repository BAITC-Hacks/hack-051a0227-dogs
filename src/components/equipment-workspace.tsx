"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import {
  equipmentNames,
  equipmentHints,
  type EquipmentState,
} from "@/lib/equipment";
import { action } from "@/lib/client";
import { Feedback, useTask } from "./ui";
export function EquipmentWorkspace({
  state: s,
  setState,
  id,
  hintsUsed: initialHints,
}: {
  state: EquipmentState;
  setState: (s: EquipmentState) => void;
  id: string;
  hintsUsed: string[];
}) {
  const [hintsUsed, setHintsUsed] = useState(initialHints),
    [step, setStep] = useState(0),
    [device, setDevice] = useState("camera"),
    [hour, setHour] = useState("16"),
    [testing, setTesting] = useState(false),
    [done, setDone] = useState(false),
    [testMessage, setTestMessage] = useState("");
  const task = useTask();
  const current = s.screens[step],
    occupied =
      (device === "camera" && hour === "16") ||
      (device === "recorder" && hour === "17");
  const move = (i: number, d: number) => {
    const screens = [...s.screens];
    [screens[i], screens[i + d]] = [screens[i + d], screens[i]];
    setState({ ...s, screens });
    setTesting(false);
  };
  return (
    <div className="equipment-workspace">
      <h3>Маршрут бронирования</h3>
      <ol className="screen-order">
        {s.screens.map((k, i) => (
          <li key={k}>
            <span>
              {i + 1}. {equipmentNames[k]}
            </span>
            <div className="row">
              <button
                className="icon-button"
                disabled={i === 0}
                aria-label={`${equipmentNames[k]}: выше`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={17} />
              </button>
              <button
                className="icon-button"
                disabled={i === 3}
                aria-label={`${equipmentNames[k]}: ниже`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={17} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <label className="check-label">
        <input
          type="checkbox"
          checked={s.requiredPhone}
          onChange={(e) => {
            setState({ ...s, requiredPhone: e.target.checked });
            setTesting(false);
          }}
        />
        Телефон обязателен
      </label>
      <label className="field">
        Если время занято
        <select
          value={s.unavailable}
          onChange={(e) => {
            setState({
              ...s,
              unavailable: e.target.value as EquipmentState["unavailable"],
            });
            setTesting(false);
          }}
        >
          <option value="promise">Подтвердить бронь на выбранное время</option>
          <option value="alternatives">Предложить свободное время</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={s.reservationDetails}
          onChange={(e) => {
            setState({ ...s, reservationDetails: e.target.checked });
            setTesting(false);
          }}
        />
        Показать оборудование и время в подтверждении
      </label>
      <section className="booking-simulator">
        <h3>Пройди путь посетителя</h3>
        <p>
          У посетителя есть почта, но нет телефона. Бронь здесь — часть учебного
          упражнения.
        </p>
        <button
          className="button secondary"
          onClick={() => {
            setTesting(true);
            setStep(0);
            setDevice("camera");
            setHour("16");
            setDone(false);
            setTestMessage("");
          }}
        >
          Проверить бронирование
        </button>
        {testing && (
          <div className="booking-screen">
            <strong>{done ? "Конец маршрута" : equipmentNames[current]}</strong>
            {!done && current === "equipment" && (
              <label className="field">
                Что бронируем
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  <option value="camera">Камера</option>
                  <option value="recorder">Диктофон</option>
                </select>
              </label>
            )}
            {!done && current === "availability" && (
              <>
                <label className="field">
                  Начало на один час
                  <select
                    value={hour}
                    onChange={(e) => {
                      setHour(e.target.value);
                      setTestMessage("");
                    }}
                  >
                    <option value="16">16:00</option>
                    <option value="17">17:00</option>
                  </select>
                </label>
                <p>{occupied ? "Это время занято." : "Это время свободно."}</p>
                {occupied && s.unavailable === "alternatives" && (
                  <button
                    className="text-link"
                    onClick={() => {
                      setHour(hour === "16" ? "17" : "16");
                      setTestMessage("");
                    }}
                  >
                    Выбрать свободное время
                  </button>
                )}
              </>
            )}
            {!done && current === "contact" && (
              <p>
                {s.requiredPhone
                  ? "Телефон обязателен. У посетителя его нет — продолжить нельзя."
                  : "Посетитель оставляет почту для уведомления. Телефон не нужен."}
              </p>
            )}
            {!done && current === "confirm" && (
              <p>
                {s.reservationDetails
                  ? `${device === "camera" ? "Камера" : "Диктофон"}, ${hour}:00–${Number(hour) + 1}:00`
                  : "Готово — без названия и времени"}
                {occupied
                  ? ". Выбранное время занято: такая бронь невыполнима."
                  : ". Время доступно."}
              </p>
            )}
            {!done && (
              <button
                className="button secondary"
                onClick={() => {
                  if (current === "contact" && s.requiredPhone) {
                    setTestMessage(
                      "Исправь обязательность телефона в маршруте и повтори проверку.",
                    );
                    return;
                  }
                  if (
                    current === "availability" &&
                    occupied &&
                    s.unavailable === "alternatives"
                  ) {
                    setTestMessage("Сначала выбери свободное время.");
                    return;
                  }
                  if (step === 3) setDone(true);
                  else setStep(step + 1);
                }}
              >
                Далее
              </button>
            )}
            <p role="status">
              {testMessage ||
                (done
                  ? "Сверь результат с условиями и сохрани свой вариант."
                  : "")}
            </p>
          </div>
        )}
      </section>
      <details className="versions">
        <summary>Подсказки по задаче · {equipmentHints.length}</summary>
        {equipmentHints.map((h) => (
          <div className="hint-row" key={h.id}>
            {hintsUsed.includes(h.id) ? (
              <>
                <strong>{h.title}</strong>
                <p>{h.body}</p>
                <span className="subtle">Подсказка открыта</span>
              </>
            ) : (
              <button
                className="text-link"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    const r = await action<{ hintsUsed: string[] }>(
                      "project.hint",
                      { id, hint: h.id },
                    );
                    setHintsUsed(r.hintsUsed);
                  })
                }
              >
                {h.title}
              </button>
            )}
          </div>
        ))}
        <Feedback task={task} />
      </details>
    </div>
  );
}
