import {
  objective,
  type WorldChoice,
  type WorldEventKind,
  type WorldScene,
  type WorldState,
} from "./model";
export type DialogueEffect =
  | { kind: "close" }
  | { kind: "event"; event: WorldEventKind; choice?: WorldChoice }
  | { kind: "travel"; scene: WorldScene };
export type DialogueOption = { label: string; effect: DialogueEffect };
export type DialogueSpec = {
  speaker: string;
  portrait?: string;
  pages: string[];
  options?: DialogueOption[];
  done?: DialogueEffect;
};
const close: DialogueEffect = { kind: "close" };
const end = (
  speaker: string,
  pages: string[],
  done: DialogueEffect = close,
  portrait?: string,
): DialogueSpec => ({ speaker, pages, done, portrait });
const event = (
  event: WorldEventKind,
  choice?: WorldChoice,
): DialogueEffect => ({ kind: "event", event, choice });
export const choiceConsequences: Record<WorldChoice, string> = {
  repair:
    "Ты помогаешь Тимуру починить экран. Расстановка займёт дольше, зато показ останется на центральной площади.",
  delegate:
    "Амир помогает Тимуру с экраном. Показ готов раньше, а обновление приложения фестиваля выйдет после открытия.",
  relocate:
    "Команда переносит показ к кофейне. Экран можно чинить без спешки, но гостям нужна новая схема маршрута.",
};
export const npcRoles = {
  saniya: { name: "Сания", role: "Координатор Campus Square" },
  aruzhan: { name: "Аружан", role: "Digital Media" },
  timur: { name: "Тимур", role: "Creative Engineering" },
  dana: { name: "Дана", role: "Sociology" },
  amir: { name: "Амир", role: "IT Product" },
} as const;
export function dialogueFor(
  id: string,
  name: string,
  s: WorldState,
): DialogueSpec {
  const f = s.flags;
  if (id === "cafe-door")
    return {
      speaker: "Кофейня",
      pages: ["Здесь участники обсуждают проекты перед открытием фестиваля."],
      options: [
        { label: "Войти", effect: { kind: "travel", scene: "cafe" } },
        { label: "Остаться", effect: close },
      ],
    };
  if (id === "coffee-counter")
    return end("Кофейня", [
      "На столе схемы фестиваля и чашки участников. Здесь удобно обсуждать идеи.",
    ]);
  if (["maker", "garage", "people", "urban", "house"].includes(id))
    return end(name, [
      "Проход закрыт на время подготовки Festival of Ideas. С площади слышно, как там собирают площадку.",
    ]);
  if (id === "saniya") {
    if (f.completed)
      return end(
        "Сания",
        [
          "Рада снова тебя видеть. На площади уже идут первые встречи фестиваля.",
        ],
        close,
        "saniya",
      );
    if (f.delivered)
      return end(
        "Сания",
        [
          "Материалы на месте, и площадка готова. Спасибо, что довёл дело до конца.",
        ],
        event("finish"),
        "saniya",
      );
    if (!f.coordinator)
      return end(
        "Сания",
        [
          "Привет! Мы готовим Campus Square к Festival of Ideas. До открытия мало времени, и одновременно появились несколько дел.",
          "Загляни на стенд, поговори с участниками и помоги доставить материалы на площадку. Я буду здесь.",
        ],
        event("coordinator"),
        "saniya",
      );
    return end(
      "Сания",
      ["Сейчас главное: " + objective(s).toLowerCase() + "."],
      close,
      "saniya",
    );
  }
  if (id === "board")
    return end(
      "Информационный стенд",
      [
        "Festival of Ideas откроется сегодня. На площади готовят интерактивный показ и истории студенческих проектов.",
        "Материалы оставили у западной дорожки. Тимур проверяет экран, Аружан собирает программу, Дана слушает гостей, Амир обновляет приложение.",
      ],
      f.coordinator && !f.board ? event("board") : close,
    );
  if (id === "aruzhan")
    return end(
      "Аружан",
      [
        f.choice === "relocate"
          ? "Новый маршрут уже на схеме. Хорошо, что предупредили гостей заранее."
          : "Я собираю истории команд. Когда будет понятна площадка показа, поправлю программу.",
      ],
      f.board && !f.talks.includes(id) ? event("aruzhan") : close,
      id,
    );
  if (id === "timur")
    return end(
      "Тимур",
      [
        f.choice === "repair"
          ? "Мы с тобой вернули экран в работу. Спасибо, что остался разобраться."
          : "Экран включается, но сенсор отвечает с задержкой. Мне нужно время проверить соединения.",
      ],
      f.board && !f.talks.includes(id) ? event("timur") : close,
      id,
    );
  if (id === "dana")
    return end(
      "Дана",
      [
        "Я спрашиваю гостей, как им удобнее находить проекты. Многие ищут понятные указатели, а не длинную программу.",
      ],
      f.board && !f.talks.includes(id) ? event("dana") : close,
      id,
    );
  if (id === "amir")
    return end(
      "Амир",
      [
        f.choice === "delegate"
          ? "Приложение подождёт до открытия. Сейчас я помогу Тимуру с экраном."
          : "Я заканчиваю карту фестиваля. Могу переключиться на экран, но карта выйдет позже.",
      ],
      f.board && !f.talks.includes(id) ? event("amir") : close,
      id,
    );
  if (id === "crate")
    return {
      speaker: "Коробка материалов",
      pages: [
        f.crate
          ? "Материалы уже у тебя."
          : "Здесь карточки проектов и таблички для площадки.",
      ],
      options: f.crate
        ? [{ label: "Понятно", effect: close }]
        : [
            { label: "Взять материалы", effect: event("crate") },
            { label: "Позже", effect: close },
          ],
    };
  if (id === "display") {
    if (!f.crate)
      return end("Интерактивный экран", [
        "Экран иногда не отвечает. Сначала познакомься с площадкой и забери материалы.",
      ]);
    if (!f.display)
      return end(
        "Интерактивный экран",
        [
          "Пока ты забирал материалы, экран совсем перестал отвечать. Тимур может его починить, но показ скоро начнётся.",
        ],
        event("display"),
      );
    if (!f.choice)
      return {
        speaker: "Показ проектов",
        pages: [
          "Есть несколько разумных способов успеть к открытию. Что сделаешь сейчас?",
        ],
        options: [
          {
            label: "Помочь Тимуру с экраном",
            effect: event("choose", "repair"),
          },
          {
            label: "Попросить Амира помочь",
            effect: event("choose", "delegate"),
          },
          {
            label: "Перенести показ к кофейне",
            effect: event("choose", "relocate"),
          },
        ],
      };
    return end("Показ проектов", [choiceConsequences[f.choice]]);
  }
  if (id === "deliver")
    return {
      speaker: "Площадка события",
      pages: [
        f.delivered
          ? "Карточки проектов уже разложены."
          : f.choice
            ? "Здесь готовят столы. Материалы можно передать команде."
            : "Площадка ждёт материалы. Сначала нужно решить вопрос с экраном.",
      ],
      options:
        f.choice && !f.delivered
          ? [
              { label: "Передать материалы", effect: event("deliver") },
              { label: "Позже", effect: close },
            ]
          : [{ label: "Понятно", effect: close }],
    };
  return end(name, ["Здесь собираются участники фестиваля."]);
}
