import { z } from "zod";
import type { Feedback } from "./types";
export const equipmentNames: Record<string, string> = {
  equipment: "Оборудование",
  availability: "Свободное время",
  contact: "Контакт",
  confirm: "Бронь",
};
export const equipmentSchema = z.object({
  screens: z
    .array(z.enum(["equipment", "availability", "contact", "confirm"]))
    .length(4)
    .refine((v) => new Set(v).size === 4),
  requiredPhone: z.boolean(),
  unavailable: z.enum(["promise", "alternatives"]),
  reservationDetails: z.boolean(),
});
export type EquipmentState = z.infer<typeof equipmentSchema>;
export const equipmentInitial: EquipmentState = {
  screens: ["contact", "equipment", "availability", "confirm"],
  requiredPhone: true,
  unavailable: "promise",
  reservationDetails: false,
};
export const equipmentHints = [
  {
    id: "availability",
    title: "Когда нужен контакт?",
    body: "Сначала человек выбирает вещь и проверяет свободное время. Контакт нужен для доступной брони.",
  },
  {
    id: "occupied",
    title: "Если время занято",
    body: "В 16:00 камера занята. Предложи доступное время, прежде чем подтверждать бронь; обещать выдачу занятой вещи нельзя.",
  },
  {
    id: "receipt",
    title: "Что оставить в подтверждении",
    body: "Название оборудования и время помогают сверить бронь. Телефон необязателен: уведомление в этой задаче доступно по почте.",
  },
] as const;
export function checkEquipment(s: EquipmentState): Feedback {
  const checks = [
    {
      label: "Выбор до проверки времени",
      passed:
        s.screens.indexOf("equipment") < s.screens.indexOf("availability"),
      detail: "Сначала нужно знать, какое оборудование требуется.",
    },
    {
      label: "Доступность до контакта",
      passed: s.screens.indexOf("availability") < s.screens.indexOf("contact"),
      detail:
        s.screens.indexOf("availability") < s.screens.indexOf("contact")
          ? "Доступность оборудования проверяется до запроса контакта."
          : "Сейчас контакт запрашивается до проверки доступности. Человек может заполнить форму для занятой вещи.",
    },
    {
      label: "Доступ без телефона",
      passed: !s.requiredPhone,
      detail: !s.requiredPhone
        ? "Почты достаточно для брони в условиях задачи."
        : "У посетителя есть почта, но нет телефона: обязательное поле прервёт бронирование.",
    },
    {
      label: "Занятое время не обещано",
      passed: s.unavailable === "alternatives",
      detail:
        s.unavailable === "alternatives"
          ? "Для занятой камеры можно выбрать 17:00."
          : "Камера занята в 16:00. Нельзя подтвердить выдачу на это время.",
    },
    {
      label: "Понятная бронь в конце",
      passed: s.screens.at(-1) === "confirm" && s.reservationDetails,
      detail: "В конце должны остаться название вещи и выбранное время.",
    },
  ];
  return {
    checks,
    summary: checks.every((c) => c.passed)
      ? "Оба пути — свободная вещь и занятое время — учитывают условия бронирования."
      : "Проверь ограничения брони ниже: они отличаются от записи на мастерскую.",
    actions: [
      "Порядок бронирования",
      "Обработка недоступного времени",
      "Проверка подтверждения",
    ],
  };
}
