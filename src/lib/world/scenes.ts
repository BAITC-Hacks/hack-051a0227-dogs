import type { WorldScene } from "./model";

export const TILE = 32;
export type Place = { x: number; y: number };
export type Portal = { id: string; label: string; x: number; y: number; to: WorldScene };
export type WorldProp = {
  id: string;
  label: string;
  art: string;
  x: number;
  y: number;
  size?: number;
  text: string;
  activeText?: string;
  kind?: "toggle" | "secret";
};
export type Zone = {
  title: string;
  program?: string;
  skillDomains?: string[];
  futureMissionIds?: string[];
  width: number;
  height: number;
  interior?: boolean;
  facade?: string;
  landmark?: string;
  portals: Portal[];
  props: WorldProp[];
};
const p = (x: number, y: number) => ({ x: x * TILE, y: y * TILE });
const door = (to: WorldScene, label: string): Portal => ({ id: `${to}-door`, label, ...p(15, 9), to });
const back = (to: WorldScene, label: string): Portal => ({ id: `${to}-door`, label, ...p(2, 11), to });
const exit = (to: WorldScene): Portal => ({ id: `${to}-door`, label: "Выйти наружу", ...p(9, 10), to });
const prop = (id: string, label: string, art: string, x: number, y: number, text: string, kind?: WorldProp["kind"], activeText?: string): WorldProp => ({ id, label, art, ...p(x,y), text, kind, activeText });

export const zones: Record<WorldScene, Zone> = {
  square: {
    title: "Campus Square", width: 50, height: 34,
    portals: [
      { id: "cafe-door", label: "Зайти в кофейню", ...p(10,24), to: "cafe" },
      { id: "maker-door", label: "Maker Yard", ...p(2,17), to: "maker" },
      { id: "garage-door", label: "Product Garage", ...p(47,17), to: "garage" },
      { id: "people-door", label: "People Lab", ...p(21,2), to: "people" },
      { id: "urban-door", label: "Urban Lab", ...p(42,31), to: "urban" },
      { id: "house-door", label: "Media House", ...p(5,32), to: "house" },
    ],
    props: [
      prop("square-map", "Карта кампуса", "map-kiosk", 35, 25, "Пять дорожек расходятся от площади. Если свернуть за зелёную стену, виден тихий дворик."),
      prop("square-birds", "Заглянуть за сцену", "origami", 27, 26, "За кулисами лежит бумажная птица с нарисованной буквой U. Кто-то оставил её на удачу.", "secret"),
    ],
  },
  cafe: {
    title: "Campus Cafe", width: 18, height: 12, interior: true,
    portals: [{ id: "square-door", label: "Выйти на площадь", ...p(9,10), to: "square" }],
    props: [
      prop("cafe-counter", "Посмотреть меню", "coffee", 9, 5, "На доске только рисунки напитков. На соседнем столе обсуждают афишу фестиваля."),
      prop("cafe-note", "Прочитать записку", "notebooks", 5, 7, "Кто-то записал: «Спросить гостей, какую историю они запомнили». Имя на полях не разобрать.", "secret"),
    ],
  },
  maker: {
    title: "Maker Yard", program: "Creative Engineering", skillDomains: ["LEADERSHIP", "TEAMWORK"], futureMissionIds: ["maker-first-prototype"],
    width: 30, height: 22, facade: "maker-facade", landmark: "kinetic",
    portals: [back("square", "На Campus Square"), door("maker-room", "В мастерскую")],
    props: [
      prop("maker-kinetic", "Осмотреть прототип", "kinetic", 8, 11, "Шарики движутся от лёгкого толчка. Команда спорит, оставить ли механизм открытым или защитить прозрачным кожухом.", "toggle", "Кожух установлен. Движение видно, а посетители не заденут механизм."),
      prop("maker-rack", "Разобрать материалы", "maker-station", 21, 14, "Лист фанеры, крепёж и датчики разложены по группам. На полке отмечено, что ещё нужно проверить."),
      prop("maker-bird", "Заглянуть под верстак", "origami", 6, 17, "На нижней полке спрятана крошечная бумажная птица из старого чертежа.", "secret"),
    ],
  },
  "maker-room": {
    title: "Мастерская", width: 18, height: 12, interior: true,
    portals: [exit("maker")],
    props: [
      prop("maker-bench", "Осмотреть верстак", "maker-bench", 8, 5, "На верстаке три версии крепления. Рядом карандашом отмечено, почему первую пришлось переделать."),
      prop("maker-test", "Включить испытание", "maker-station", 13, 6, "Небольшой мотор делает один оборот и останавливается. Прототип пока тестируют без зрителей.", "toggle", "Испытание завершено. На листе появилась ещё одна отметка."),
    ],
  },
  garage: {
    title: "Product Garage", program: "Innovative IT Product Design and Development", skillDomains: ["COMMUNICATION", "TEAMWORK"], futureMissionIds: ["product-first-test"],
    width: 30, height: 22, facade: "product-facade", landmark: "test-screen",
    portals: [back("square", "На Campus Square"), door("garage-room", "В студию продукта")],
    props: [
      prop("garage-flow", "Изучить путь пользователя", "journey-board", 8, 12, "На доске нарисовано, где человек впервые теряет нужную кнопку. Команда ещё не решила, менять экран или подсказку."),
      prop("garage-prototype", "Проверить прототип", "test-screen", 21, 14, "Экран предлагает выбрать событие. Один вариант открывается быстрее, другой объясняет больше.", "toggle", "Включён второй вариант. Теперь заметнее, кто первым ищет расписание."),
      prop("garage-sticker", "Поднять стикер", "notebooks", 24, 17, "На обороте короткий вопрос: «Кому мы забыли показать эту версию?»", "secret"),
    ],
  },
  "garage-room": {
    title: "Продуктовая студия", width: 18, height: 12, interior: true,
    portals: [exit("garage")],
    props: [
      prop("garage-wall", "Посмотреть стену обратной связи", "journey-board", 6, 5, "Отзывы сгруппированы по ситуациям, а не по «хорошо» и «плохо». Команда ищет повторяющийся момент."),
      prop("garage-corner", "Посмотреть тестовый уголок", "test-screen", 13, 6, "Стул отодвинут от экрана: здесь проверяют, можно ли пройти сценарий без подсказок автора."),
    ],
  },
  people: {
    title: "People Lab", program: "Sociology: Leadership and Innovation", skillDomains: ["TEAMWORK", "COMMUNICATION"], futureMissionIds: ["people-field-notes"],
    width: 30, height: 22, facade: "people-facade", landmark: "research-board",
    portals: [back("square", "На Campus Square"), door("people-room", "В исследовательскую")],
    props: [
      prop("people-wall", "Прочитать полевые заметки", "research-board", 8, 11, "Ответы гостей сгруппированы без имён. Рядом отдельно записаны случаи, которые не вписались в общую картину."),
      prop("people-table", "Посмотреть уголок бесед", "interview-table", 21, 14, "На столе лежат два разных вопросника. Один помогает начать разговор, второй уточняет, что собеседник имел в виду."),
      prop("people-fold", "Осмотреть край карты", "origami", 25, 17, "Под отогнутым краем карты нарисована маленькая схема тихого места для разговора.", "secret"),
    ],
  },
  "people-room": {
    title: "Исследовательская", width: 18, height: 12, interior: true,
    portals: [exit("people")],
    props: [
      prop("people-field", "Открыть карту наблюдений", "research-board", 6, 5, "Маршруты отмечены разными линиями. Некоторые люди обходят площадь, потому что ищут тихое место."),
      prop("people-notes", "Перелистать записи", "notebooks", 13, 6, "В записи есть и неожиданные ответы. Их не вычеркнули ради красивой диаграммы."),
    ],
  },
  urban: {
    title: "Urban Lab", program: "Public Policy and Development", skillDomains: ["LEADERSHIP", "COMMUNICATION"], futureMissionIds: ["urban-shared-space"],
    width: 30, height: 22, facade: "urban-facade", landmark: "city-model",
    portals: [back("square", "На Campus Square"), door("urban-room", "В городскую студию")],
    props: [
      prop("urban-model", "Изучить макет города", "city-model", 8, 11, "На макете один короткий путь проходит через двор, которым уже пользуются жители. Здесь ищут компромисс, а не только скорость.", "toggle", "Включён слой пешеходных маршрутов. Обход длиннее, зато двор остаётся спокойным."),
      prop("urban-board", "Посмотреть схему пространства", "planning-board", 21, 14, "На схеме отмечены лавочки, тень и доступные проходы. Кто-то передвинул остановку на два квартала."),
      prop("urban-ticket", "Найти старый билет", "notebooks", 24, 18, "Между листами лежит нарисованный проездной с пометкой «проверь дорогу вечером».", "secret"),
    ],
  },
  "urban-room": {
    title: "Городская студия", width: 18, height: 12, interior: true,
    portals: [exit("urban")],
    props: [
      prop("urban-layers", "Сравнить слои карты", "planning-board", 6, 5, "На одной схеме главное время в пути, на другой — безопасный переход. Обе нужны для разговора."),
      prop("urban-table", "Осмотреть стол планирования", "city-model", 13, 6, "Команда оставила место для замечаний жителей, прежде чем закрепить вариант."),
    ],
  },
  house: {
    title: "Media House", program: "Digital Media and Marketing", skillDomains: ["COMMUNICATION", "TEAMWORK"], futureMissionIds: ["media-first-story"],
    width: 30, height: 22, facade: "media-facade", landmark: "camera",
    portals: [back("square", "На Campus Square"), door("house-room", "В медиастудию")],
    props: [
      prop("house-story", "Посмотреть стену историй", "research-board", 8, 11, "Одна история звучит красиво, но в ней не хватает голоса человека, который делал работу. Редактор оставил пустое место."),
      prop("house-camera", "Осмотреть съёмочную точку", "camera", 21, 14, "Камера направлена на стол прототипов. Команда ищет ракурс, где видно руки и процесс, а не только итог."),
      prop("house-frame", "Найти лишний кадр", "origami", 24, 18, "На полке лежит неиспользованный кадр: вся команда смеётся над неудачным дублем.", "secret"),
    ],
  },
  "house-room": {
    title: "Медиастудия", width: 18, height: 12, interior: true,
    portals: [exit("house")],
    props: [
      prop("house-edit", "Открыть монтаж", "editing-desk", 6, 5, "На дорожке оставили паузу перед ответом. После неё мысль героя становится понятнее."),
      prop("house-podcast", "Послушать запись", "podcast-desk", 13, 6, "Наушники не подключены. На экране показан фрагмент беседы; запись можно прослушать позже."),
    ],
  },
};

export const districtScenes = ["maker", "garage", "people", "urban", "house"] as const;
export const interiorScenes = ["maker-room", "garage-room", "people-room", "urban-room", "house-room", "cafe"] as const;
export const sceneKeys = Object.keys(zones) as WorldScene[];
export function portalBetween(from: WorldScene, to: WorldScene) {
  return zones[from].portals.find((portal) => portal.to === to);
}
export function pointById(scene: WorldScene, id: string) {
  return zones[scene].props.find((item) => item.id === id);
}
