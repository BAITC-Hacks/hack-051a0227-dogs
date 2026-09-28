import {
  objective,
  type WorldChoice,
  type WorldEventKind,
  type WorldScene,
  type WorldState,
} from "./model";
import { zones } from "./scenes";
import { npcById } from "./npcs";
export type DialogueEffect =
  | { kind: "close" }
  | { kind: "event"; event: WorldEventKind; choice?: WorldChoice }
  | { kind: "travel"; scene: WorldScene }
  | { kind: "explore"; targetId: string; action: "meet" | "deeper" | "toggle" | "discover" };
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
const familiar = (id:string,s:WorldState,pages:string[],done:DialogueEffect=close):DialogueSpec => {
  const npc=npcById[id];
  return {speaker:npc.name,portrait:npc.portrait,pages,
    done,
    options:done.kind==="close" && s.npcMemoryFlags[`met:${id}`] ? [
      {label:"Спросить подробнее",effect:{kind:"explore",targetId:id,action:"deeper"}},
      {label:"Попрощаться",effect:close},
    ]:undefined,
  };
};
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
  const portal = zones[s.scene].portals.find((item)=>item.id===id);
  if(portal)
    return {
      speaker: portal.label,
      pages: [portal.to==="square" ? "Дорожка возвращает на площадь." : zones[portal.to].interior ? `Внутри находится ${zones[portal.to].title}.` : `Впереди ${zones[portal.to].title}.`],
      options: [
        { label: "Идти", effect: { kind: "travel", scene: portal.to } },
        { label: "Остаться", effect: close },
      ],
    };
  const prop = zones[s.scene].props.find((item)=>item.id===id);
  if(prop) {
    const active = prop.kind==="secret" ? s.discoveredSecrets.includes(id) : Boolean(s.persistentPropStates[id]);
    return {
      speaker: prop.label,
      pages:[active && prop.activeText ? prop.activeText : prop.text],
      options:prop.kind==="toggle" && !active ? [
        {label:"Попробовать",effect:{kind:"explore",targetId:id,action:"toggle"}},
        {label:"Оставить",effect:close},
      ]:undefined,
      done:prop.kind==="secret" && !active ? {kind:"explore",targetId:id,action:"discover"}:close,
    };
  }
  const cast = npcById[id];
  if(cast && !["saniya","aruzhan","timur","dana","amir"].includes(id)) {
    const met = Boolean(s.npcMemoryFlags[`met:${id}`]);
    const contextual = cast.alternate && s.persistentPropStates[cast.alternate.afterProp];
    return {
      speaker:cast.name,portrait:cast.portrait,
      pages:[contextual?cast.contextual:met?cast.returning:cast.initial,cast.exit],
      options:met ? [
        {label:"Спросить подробнее",effect:{kind:"explore",targetId:id,action:"deeper"}},
        {label:"Попрощаться",effect:close},
      ]:undefined,
      done:met?close:{kind:"explore",targetId:id,action:"meet"},
    };
  }
  if (id === "saniya") {
    if (f.completed)
      return familiar(
        id,s,
        [
          "Рада снова тебя видеть. На площади уже идут первые встречи фестиваля.",
        ],
      );
    if (f.delivered)
      return familiar(
        id,s,
        [
          "Материалы на месте, и площадка готова. Спасибо, что довёл дело до конца.",
        ],
        event("finish"),
      );
    if (!f.coordinator)
      return familiar(
        id,s,
        [
          "Привет! Мы готовим Campus Square к Festival of Ideas. До открытия мало времени, и одновременно появились несколько дел.",
          "Загляни на стенд, поговори с участниками и помоги доставить материалы на площадку. Я буду здесь.",
        ],
        event("coordinator"),
      );
    return familiar(id,s,["Сейчас главное: " + objective(s).toLowerCase() + "."]);
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
    return familiar(
      id,s,
      [
        f.choice === "relocate"
          ? "Новый маршрут уже на схеме. Хорошо, что предупредили гостей заранее."
          : s.npcMemoryFlags[`met:${id}`] && f.talks.includes(id) ? npcById[id].returning : "Я собираю истории команд. Когда будет понятна площадка показа, поправлю программу.",
      ],
      f.board && !f.talks.includes(id) ? event("aruzhan") : close,
    );
  if (id === "timur")
    return familiar(
      id,s,
      [
        f.choice === "repair"
          ? "Мы с тобой вернули экран в работу. Спасибо, что остался разобраться."
          : s.npcMemoryFlags[`met:${id}`] && f.talks.includes(id) ? npcById[id].returning : "Экран включается, но сенсор отвечает с задержкой. Мне нужно время проверить соединения.",
      ],
      f.board && !f.talks.includes(id) ? event("timur") : close,
    );
  if (id === "dana")
    return familiar(
      id,s,
      [
        s.npcMemoryFlags[`met:${id}`] && f.talks.includes(id) ? npcById[id].returning : "Я спрашиваю гостей, как им удобнее находить проекты. Многие ищут понятные указатели, а не длинную программу.",
      ],
      f.board && !f.talks.includes(id) ? event("dana") : close,
    );
  if (id === "amir")
    return familiar(
      id,s,
      [
        f.choice === "delegate"
          ? "Приложение подождёт до открытия. Сейчас я помогу Тимуру с экраном."
          : s.npcMemoryFlags[`met:${id}`] && f.talks.includes(id) ? npcById[id].returning : "Я заканчиваю карту фестиваля. Могу переключиться на экран, но карта выйдет позже.",
      ],
      f.board && !f.talks.includes(id) ? event("amir") : close,
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
