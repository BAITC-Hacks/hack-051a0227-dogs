import type { WorldScene } from "./model";

// Authored development content. These outcomes describe a prototype, never a person.
export const roleIds = ["engineer", "product", "research", "policy", "media"] as const;
export type RoleId = (typeof roleIds)[number];
export type MissionPayload = Record<string, string | string[]>;
export type MissionArtifact = { choices: MissionPayload; observation: string; consequence: string };
export type RoleProgress = {
  version: 1;
  introAt?: string;
  stage?: "test" | "revision" | "complete";
  first?: MissionArtifact;
  final?: MissionArtifact;
  completedAt?: string;
  deeperAt?: string;
  deeperChoice?: string;
  deeperResult?: string;
  preference?: "interested" | "again" | "not-for-me";
  replayCount: number;
  history: { first: MissionArtifact; final: MissionArtifact; at: string }[];
};
export type CrossProgress = { version: 1; perspectives: [RoleId, RoleId]; result: string; completedAt: string };

const perspectiveContribution: Record<RoleId, string> = {
  engineer: "Аида проверила, выдержит ли стенд более частые короткие показы",
  product: "Аян изменил путь в приложении, чтобы гости находили свободный показ",
  research: "Лейла сравнила наблюдения у двух входов, прежде чем объяснять причину очереди",
  policy: "Жанерке оставила широкий проход и перенесла точку ожидания",
  media: "Иная сообщила гостям проверенное место и время следующего показа",
};
export function resolveCrossMission(pair: [RoleId, RoleId]): string {
  return `${perspectiveContribution[pair[0]]}. ${perspectiveContribution[pair[1]]}. Очередь не исчезла сама, но гостям стало понятнее, куда идти, а команде — что проверить дальше.`;
}

export type RoleDefinition = {
  id: RoleId; title: string; scene: WorldScene; lead: string; prop: string;
  intro: string; mission: string; deeper: string; deeperScene: WorldScene; deeperProp: string;
  program: string; programFacts: readonly [string,string]; skillNode: string; introReward: number; mainReward: number;
};
export const roles: Record<RoleId, RoleDefinition> = {
  engineer: { id: "engineer", title: "Инженер", scene: "maker", lead: "aida", prop: "maker-kinetic", intro: "Проверь маленький датчик вместе с Аидой", mission: "До открытия 42 минуты", deeper: "Выставочный стенд для разных гостей", deeperScene: "garage", deeperProp: "garage-prototype", program: "Creative Engineering", programFacts:["Прототипы и инженерные задачи","Технологии, дизайн и проекты"], skillNode: "world-engineer", introReward: 25, mainReward: 75 },
  product: { id: "product", title: "Создатель продукта", scene: "garage", lead: "ayan", prop: "garage-prototype", intro: "Переставь два шага в маршруте гостя", mission: "Люди теряются", deeper: "Проверка интерфейса у экспоната", deeperScene: "maker", deeperProp: "maker-kinetic", program: "Innovative IT Product Design and Development", programFacts:["Цифровые продукты для задач людей","Интерфейсы, данные и продуктовые решения"], skillNode: "world-product", introReward: 25, mainReward: 75 },
  research: { id: "research", title: "Исследователь", scene: "people", lead: "leila", prop: "people-wall", intro: "Сравни два непохожих ответа", mission: "Кто не пришёл?", deeper: "Тихий маршрут на площади", deeperScene: "urban", deeperProp: "urban-board", program: "Sociology: Leadership and Innovation", programFacts:["Исследование людей и сообществ","Анализ данных и социальных изменений"], skillNode: "world-research", introReward: 25, mainReward: 75 },
  policy: { id: "policy", title: "Проектировщик пространства", scene: "urban", lead: "zhanerke", prop: "urban-model", intro: "Поставь три зоны, не закрывая проход", mission: "Площадь для всех", deeper: "Поток у входа на фестиваль", deeperScene: "people", deeperProp: "people-field", program: "Public Policy and Development", programFacts:["Данные, экономика и проектирование решений","Работа с сообществами и общественными задачами"], skillNode: "world-policy", introReward: 25, mainReward: 75 },
  media: { id: "media", title: "Автор истории", scene: "house", lead: "inaya", prop: "house-story", intro: "Собери объявление из проверенных фактов", mission: "История меняется", deeper: "Расскажи о выводе исследования", deeperScene: "people", deeperProp: "people-wall", program: "Digital Media and Marketing", programFacts:["Сторителлинг, письмо и редактирование","Видео, подкасты и медиапроизводство"], skillNode: "world-media", introReward: 25, mainReward: 75 },
};

const allowed = (value: unknown, options: readonly string[]): value is string => typeof value === "string" && options.includes(value);
const list = (value: unknown, options: readonly string[], length: number) =>
  Array.isArray(value) && value.length === length && new Set(value).size === length && value.every((item) => allowed(item, options));
const sequence = (value: unknown, options: readonly string[], length: number) =>
  Array.isArray(value) && value.length === length && value.every((item) => allowed(item, options));
const changed = (a: MissionPayload, b: MissionPayload) =>
  JSON.stringify(Object.entries(a).sort(([left],[right])=>left.localeCompare(right))) !==
  JSON.stringify(Object.entries(b).sort(([left],[right])=>left.localeCompare(right)));
const cap = (text: string) => text.slice(0, 400);

export function validateIntro(role: RoleId, payload: MissionPayload): string {
  if (role === "engineer" && allowed(payload.check, ["крепление", "датчик"])) return `Ты проверил ${payload.check} на малом макете. Теперь можно заняться большим прототипом.`;
  if (role === "product" && list(payload.flow, ["событие", "место"], 2)) return "Ты поменял порядок двух экранов. На большом маршруте появятся новые ограничения.";
  if (role === "research" && allowed(payload.question, ["почему не пришли", "как узнали о событии"])) return "Один вопрос дал разные ответы. На стене People Lab есть и другие источники.";
  if (role === "policy" && list(payload.zones, ["тихая", "показ", "проход"], 3)) return "На маленькой схеме проход остался открыт. Теперь попробуй разместить весь фестиваль.";
  if (role === "media" && allowed(payload.fact, ["место", "время"])) return `Ты сверил ${payload.fact} объявления с программой. Для истории потребуются ещё источники.`;
  throw new Error("Заверши короткое знакомство с ролью.");
}

export function resolveMission(role: RoleId, payload: MissionPayload, round: "test" | "revision", first?: MissionArtifact): MissionArtifact {
  let observation = "";
  let consequence = "";
  if (role === "engineer") {
    if (!["range", "steady", "low-power"].includes(String(payload.sensor)) || !allowed(payload.power, ["battery", "grid"]) || !allowed(payload.mount, ["open", "guarded"]) || !list(payload.connections,["sensor-power","power-mount"],2)) throw new Error("Собери датчик, питание и крепление и соедини оба кабеля.");
    const demand = payload.sensor === "range" ? 3 : payload.sensor === "steady" ? 2 : 1;
    observation = `${payload.power === "battery" && demand === 3 ? "Батареи хватает ненадолго" : "Питание выдерживает пробу"}; ${payload.mount === "open" ? "механизм виден, но его можно задеть" : "кожух защищает механизм, но уменьшает обзор"}.`;
    consequence = payload.sensor === "low-power" ? "Движение стало проще, зато стенд готов к открытию." : payload.power === "grid" ? "Стенд сохраняет отклик. Команда уводит кабель от прохода и тратит на это дополнительное время." : "Монтаж быстрый, однако запас питания придётся контролировать.";
  } else if (role === "product") {
    if (!list(payload.flow, ["schedule", "place", "save", "detail"], 4) || !allowed(payload.problem, ["wayfinding", "saving"]) || !list(payload.testers,["visitor","volunteer","one-hand"],2)) throw new Error("Собери четыре экрана, выбери проблему и двух тестеров.");
    const flow = payload.flow as string[];
    const placeSteps = flow.indexOf("place") + 1, saveSteps=flow.indexOf("save")+1;
    const testers=payload.testers as string[];
    observation = `${testers.includes("visitor")?`Гость нашёл площадку за ${placeSteps} ${placeSteps===1?"шаг":"шага"}. `:""}${testers.includes("volunteer")?`Волонтёр сохранил событие за ${saveSteps} ${saveSteps===1?"шаг":"шага"}. `:""}${testers.includes("one-hand")?`Гостю с телефоном в одной руке понадобилось ${Math.max(placeSteps,saveSteps)+1} шага. `:""}${round==="test"?"Второй тестер просит проверить путь после изменения порядка.":"Команда записала оба маршрута и оставила место для следующей пробы."}`;
    consequence = payload.problem === "wayfinding" ? "Ты сократил путь к площадке, но сохранение события осталось менее заметным." : "Сохранение стало яснее; поиск площадки всё ещё требует одного лишнего шага.";
  } else if (role === "research") {
    if (!list(payload.interviews, ["volunteer", "visitor", "quiet", "organizer"], 2) || !allowed(payload.hypothesis, ["time", "route", "interest"]) || !sequence(payload.evidence,["supports","contradicts","unclear"],2)) throw new Error("Поговори с двумя людьми и отметь, как два наблюдения связаны с гипотезой.");
    const people=payload.interviews as string[];
    observation = `${people.includes("quiet")?"Один гость ушёл от громкой сцены. ":""}${people.includes("volunteer")?"Волонтёра часто спрашивали о входе. ":""}${people.includes("visitor")?"Посетитель пришёл позже из-за занятий. ":""}${people.includes("organizer")?"Организатор ожидал гостей из другого корпуса. ":""}В коротком опросе 8 из 20 назвали маршрут, 5 время, 4 шум и 3 другие причины. Это не выборка всех гостей.`;
    consequence = `${payload.hypothesis === "route" ? "Маршрут остаётся сильной версией, но ответы о шуме требуют отдельной проверки." : "Первоначальное объяснение не покрывает ответы о маршруте и тишине; исследование продолжается."} Два наблюдения отмечены как ${((payload.evidence as string[]).filter((v)=>v==="supports")).length} поддерживающих и ${((payload.evidence as string[]).filter((v)=>v==="contradicts")).length} противоречащих, без автоматического вывода.`;
  } else if (role === "policy") {
    if (!list(payload.layout, ["demo", "quiet", "media", "food"], 4) || !allowed(payload.priority, ["access", "capacity", "noise"]) || !list(payload.volunteers,["entrance","demo","quiet"],2)) throw new Error("Размести четыре зоны, выбери ограничение и поставь двух волонтёров.");
    const layout = payload.layout as string[];
    observation = `${layout.indexOf("quiet") === layout.indexOf("media") + 1 ? "Тихая зона соседствует со сценой" : "Тихая зона отделена от сцены"}; ${layout[0] === "food" ? "у входа возможна очередь" : "вход остаётся свободным"}. ${!(payload.volunteers as string[]).includes("entrance")?"У входа нет волонтёра, очередь растёт.":"Волонтёр помогает у входа, но другая зона ждёт помощи."}`;
    consequence = payload.priority === "access" ? "Доступный проход сохранён, но демонстрации досталось меньше места." : payload.priority === "noise" ? "Тихая зона получила защиту; часть гостей пройдёт дальше до сцены." : "Вместимость увеличена, однако волонтёрам придётся следить за узким поворотом.";
  } else {
    if (!list(payload.sources, ["author", "schedule", "rumour", "photo"], 2) || !allowed(payload.angle, ["process", "visitor", "change"]) || !allowed(payload.channel, ["board", "social"]) || !list(payload.story,["scene","fact","context"],3) || !allowed(payload.headline,["making","visit","change"]) || (round==="revision" && !allowed(payload.update,["revise","clarify","hold"]))) throw new Error("Выбери источники, порядок истории, заголовок и способ обновления.");
    const uncertain = (payload.sources as string[]).includes("rumour");
    observation = uncertain ? "Один источник передаёт слух; расписание изменилось, подтверждения пока нет." : "Источники подтверждают процесс команды. Новое расписание уже проверено координатором.";
    consequence = `${payload.channel === "social" ? "История быстро дошла до гостей" : "Стенд даёт больше контекста, но часть гостей увидит новость позже"}. ${uncertain?"Слух оставили за пределами подтверждённых фактов. ":""}${round==="revision"?(payload.update==="hold"?"Публикацию отложили до полной сверки времени и места.":payload.update==="clarify"?"К истории добавили уточнение о новом месте показа.":"Материал обновили с новым местом показа."):"После подтверждения переноса материал нужно будет обновить."}`;
  }
  if (round === "revision" && first && !changed(first.choices, payload)) throw new Error("После новой информации измени хотя бы одно решение.");
  return { choices: structuredClone(payload), observation: cap(observation), consequence: cap(consequence) };
}

export const newCondition: Record<RoleId, string> = {
  engineer: "На площадке нельзя вести кабель через основной проход. Аида просит повторить сборку с этим условием.",
  product: "Второй гость пользуется телефоном одной рукой и хочет сразу сохранить событие. Переставь путь после его пробы.",
  research: "Часть гостей была на площади, но ушла из-за шума. Обнови гипотезу или состав бесед.",
  policy: "Служба площадки просит оставить широкий путь для тележки. Пересмотри план после симуляции.",
  media: "Координатор подтвердил перенос показа на соседнюю площадку. Реши, как обновить историю.",
};

export const deeperChoices: Record<RoleId, readonly [readonly [string,string], readonly [string,string]]> = {
  engineer: [["accessible","Опустить датчик до уровня ребёнка"],["remote","Перенести управление на соседний экран"]],
  product: [["preview","Показать быстрый просмотр перед действием"],["guided","Добавить короткую подсказку у экспоната"]],
  research: [["observe","Сравнить поток людей у двух входов"],["ask","Спросить гостей тихой зоны о маршруте"]],
  policy: [["split","Разделить вход и выход"],["stagger","Развести начало показов по времени"]],
  media: [["context","Показать пределы выборки рядом с выводом"],["voices","Добавить два разных голоса из интервью"]],
};
export function resolveDeeper(role: RoleId, choice: unknown): string {
  if (!deeperChoices[role].some(([id])=>id===choice)) throw new Error("Выбери, как связать две команды.");
  const outcomes: Record<RoleId, Record<string,string>> = {
    engineer: {accessible:"Дети тоже могут запустить установку, но Аиде нужно повторно проверить крепление.",remote:"Управление стало удобнее для очереди, зато гостю придётся сделать ещё один шаг."},
    product: {preview:"Гость понял, что увидит дальше, но путь стал длиннее на один экран.",guided:"Подсказка помогла у экспоната, но в приложении осталось меньше контекста."},
    research: {observe:"Поток у входов различается. Лейла не делает вывод только по одной точке.",ask:"Гости тихой зоны объяснили обходной путь. Теперь у команды есть ещё один вопрос для наблюдения."},
    policy: {split:"Очередь стала понятнее, но вход и выход требуют двух волонтёров.",stagger:"Пик нагрузки снизился, однако часть посетителей ждёт следующего показа."},
    media: {context:"Читателю яснее, кого опросили, хотя короткий формат стал плотнее.",voices:"История получила разные точки зрения; Иная оставила место для чисел и оговорок."},
  };
  return outcomes[role][String(choice)];
}

export function emptyRoleProgress(): RoleProgress { return { version: 1, replayCount: 0, history: [] }; }
