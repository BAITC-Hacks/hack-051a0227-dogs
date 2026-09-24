import { missionSchema } from "./missions";
import type { ProjectState, Feedback } from "./types";
import { z } from "zod";
export const scenarioVersion = 1;
export const initialState: ProjectState = {
  screens: ["profile", "event", "confirm"],
  requiredPhone: true,
  headline: "Открытая площадка: всё меняется",
  caption: "Встречаемся в 14:00. Участие бесплатное.",
  fragments: ["place", "time", "people"],
  modules: [
    { kind: "desk", cell: 0 },
    { kind: "power", cell: 5 },
  ],
  classifications: {},
  question: "",
  note: "",
  allocations: [4, 4, 4],
  explanation: "",
};
export const screenNames: Record<string, string> = {
  profile: "О себе",
  event: "Выбор мастерской",
  confirm: "Подтверждение",
};
export const fragments: Record<string, { title: string; text: string }> = {
  place: {
    title: "Место для идей",
    text: "Библиотека превращается в открытую мастерскую.",
  },
  time: {
    title: "Встречаемся в 16:00",
    text: "Организатор перенёс начало с 14:00 на 16:00.",
  },
  people: {
    title: "Приходи без опыта",
    text: "Материалы и помощь команды доступны каждому.",
  },
  cancel: {
    title: "Всё отменяется?",
    text: "Непроверенный слух из общего чата.",
  },
};
export const modules: Record<string, { title: string; cost: number }> = {
  desk: { title: "Рабочий стол", cost: 3 },
  power: { title: "Питание", cost: 2 },
  seat: { title: "Зона обсуждения", cost: 2 },
  screen: { title: "Экран", cost: 4 },
};
export const testimonies = [
  {
    id: "a",
    text: "18 из 30 опрошенных выбрали вечернее время.",
    answer: "observation",
  },
  {
    id: "b",
    text: "Всем школьникам удобнее после 16:00.",
    answer: "assumption",
  },
  {
    id: "c",
    text: "В опросе участвовали только посетители библиотеки.",
    answer: "observation",
  },
  {
    id: "d",
    text: "Не пришедшие не интересуются мастерскими.",
    answer: "assumption",
  },
];
export const projectSchema = z.object({
  mission: missionSchema.optional(),
  screens: z
    .array(z.enum(["profile", "event", "confirm"]))
    .length(3)
    .refine((v) => new Set(v).size === 3),
  requiredPhone: z.boolean(),
  headline: z.string().max(180),
  caption: z.string().max(800),
  fragments: z
    .array(z.enum(["place", "time", "people", "cancel"]))
    .min(1)
    .max(4)
    .refine((v) => new Set(v).size === v.length),
  modules: z
    .array(
      z.object({
        kind: z.enum(["desk", "power", "seat", "screen"]),
        cell: z.number().int().min(0).max(11),
      }),
    )
    .max(12)
    .refine((v) => new Set(v.map((m) => m.cell)).size === v.length),
  classifications: z.record(
    z.string().regex(/^[abcd]$/),
    z.enum(["observation", "assumption", ""]),
  ),
  question: z.string().max(400),
  note: z.string().max(2000),
  allocations: z.array(z.number().int().min(0).max(12)).length(3),
  explanation: z.string().max(2000),
});
export function checkProject(slug: string, s: ProjectState): Feedback {
  const checks: Feedback["checks"] = [];
  let actions: string[] = [];
  const check = (label: string, passed: boolean, detail: string) =>
    checks.push({ label, passed, detail });
  if (slug === "digital-products") {
    check(
      "Гость без телефона",
      !s.requiredPhone,
      s.requiredPhone
        ? "Телефон обязателен. У Алии его нет — путь прерывается."
        : "Алия проходит регистрацию без телефона.",
    );
    check(
      "Сначала понятный выбор",
      s.screens[0] === "event",
      "Посетитель хочет увидеть мастерские до ввода личных данных.",
    );
    check(
      "Подтверждение завершает путь",
      s.screens.at(-1) === "confirm",
      "Подтверждение должно показывать уже выбранную мастерскую.",
    );
    actions = [
      "Изменение последовательности",
      "Проверка пользовательских условий",
    ];
  }
  if (slug === "digital-media") {
    check(
      "Актуальное время",
      s.fragments.includes("time") &&
        /16[:.]00/.test(s.caption) &&
        !/14[:.]00/.test(s.caption),
      "Начало перенесено на 16:00 — сверь подпись с сообщением организатора.",
    );
    check(
      "Подтверждённое сообщение",
      !s.fragments.includes("cancel"),
      "Фрагмент «Всё отменяется?» противоречит сообщению организатора о переносе времени. Заголовок и свободный текст проверь самостоятельно.",
    );
    check(
      "История с контекстом",
      s.fragments.length >= 3 && s.headline.trim().length > 5,
      "Соедини место, изменение и приглашение в понятную последовательность.",
    );
    actions = [
      "Редактирование заголовка",
      "Монтаж последовательности",
      "Проверка факта",
    ];
  }
  if (slug === "creative-engineering") {
    const cost = s.modules.reduce((a, m) => a + modules[m.kind].cost, 0);
    check(
      "Ресурс: не больше 12 единиц",
      cost <= 12,
      `Использовано ${cost} из 12. Стоимость каждого модуля указана в материалах.`,
    );
    check(
      "Проход свободен",
      s.modules.every((m) => m.cell % 4 !== 3),
      "Правая колонка — проход, в ней нельзя размещать модули.",
    );
    check(
      "Рабочее место и питание",
      s.modules.some((m) => m.kind === "desk") &&
        s.modules.some((m) => m.kind === "power"),
      "Для мастерской нужны хотя бы один стол и модуль питания.",
    );
    check(
      "Экран рядом с питанием",
      s.modules
        .filter((m) => m.kind === "screen")
        .every((m) =>
          s.modules.some(
            (p) =>
              p.kind === "power" &&
              (Math.abs(p.cell - m.cell) === 4 ||
                (Math.floor(p.cell / 4) === Math.floor(m.cell / 4) &&
                  Math.abs(p.cell - m.cell) === 1)),
          ),
        ),
      "Экран должен соседствовать с питанием по стороне.",
    );
    actions = ["Сборка схемы", "Проверка ограничений"];
  }
  if (slug === "sociology") {
    check(
      "Наблюдения отделены",
      testimonies.every((t) => s.classifications[t.id] === t.answer),
      "Исследователь: выборка из посетителей библиотеки не описывает всех школьников.",
    );
    check(
      "Следующий вопрос задан",
      s.question.trim().length > 8,
      "Укажи, кого и о чём нужно спросить следующим.",
    );
    check(
      "Записка сохранит ход мысли",
      s.note.trim().length > 20,
      "Сформулируй вывод, ограничение выборки и способ проверить предположение. Свободный текст не получает автоматической оценки.",
    );
    actions = [
      "Сопоставление свидетельств",
      "Проверка предположений",
      "Формулировка вопроса",
    ];
  }
  if (slug === "public-policy") {
    const total = s.allocations.reduce((a, b) => a + b, 0);
    check(
      "Бюджет соблюдён",
      total <= 12,
      `Распределено ${total} из 12 единиц.`,
    );
    check(
      "Объяснение добавлено",
      s.explanation.trim().length > 20,
      "Зафиксируй, чья потребность покрыта и что пришлось отложить. Свободный текст доступен для обсуждения.",
    );
    actions = [
      "Распределение ресурса",
      "Сравнение покрытия потребностей",
      "Объяснение компромисса",
    ];
  }
  return {
    checks,
    summary: checks.every((c) => c.passed)
      ? "Явные условия задачи выполнены. Можно сравнить решение с исходным планом или попробовать другой подход."
      : "Есть конкретные условия, к которым можно вернуться.",
    actions,
  };
}
export function changesBetween(
  slug: string,
  before: ProjectState,
  after: ProjectState,
): string[] {
  const result: string[] = [];
  const keys: Record<string, string[]> = {
    "digital-products": ["screens", "requiredPhone"],
    "digital-media": ["headline", "caption", "fragments"],
    "creative-engineering": ["modules"],
    sociology: ["classifications", "question", "note"],
    "public-policy": ["allocations", "explanation"],
  };
  const labels: Record<string, string> = {
    screens: "Порядок экранов",
    requiredPhone: "Обязательность телефона",
    headline: "Заголовок",
    caption: "Подпись",
    fragments: "Порядок фрагментов",
    modules: "Размещение модулей",
    classifications: "Разбор свидетельств",
    question: "Исследовательский вопрос",
    note: "Исследовательская записка",
    allocations: "Распределение ресурса",
    explanation: "Объяснение компромисса",
  };
  for (const k of keys[slug] ?? [])
    if (
      JSON.stringify(before[k as keyof ProjectState]) !==
      JSON.stringify(after[k as keyof ProjectState])
    )
      result.push(labels[k]);
  return result;
}
