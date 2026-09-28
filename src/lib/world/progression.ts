import type { WorldScene } from "./model";

export type CosmeticCategory = "outfit" | "accessory" | "desk" | "world" | "display";
export type Cosmetic = { id: string; title: string; category: CosmeticCategory; price: number; detail: string; tint?: number };
export const cosmetics: readonly Cosmetic[] = [
  {id:"lime-hoodie",title:"Лаймовое худи",category:"outfit",price:55,detail:"Тёплый цвет для прогулки по площади.",tint:0xc7f336},
  {id:"cyan-jacket",title:"Голубая куртка",category:"outfit",price:65,detail:"Для прохладного вечера фестиваля.",tint:0x64c7df},
  {id:"cream-cardigan",title:"Кремовый кардиган",category:"outfit",price:60,detail:"Мягкий повседневный вариант.",tint:0xf1dfb0},
  {id:"varsity-jacket",title:"Тёмная куртка",category:"outfit",price:70,detail:"Контрастная куртка с светлыми рукавами.",tint:0x65736b},
  {id:"moss-sweater",title:"Оливковый свитер",category:"outfit",price:50,detail:"Цвет тихого дворика.",tint:0x94b65f},
  {id:"cream-cap",title:"Светлая кепка",category:"accessory",price:35,detail:"Лёгкая кепка для прогулки."},
  {id:"blue-cap",title:"Голубая кепка",category:"accessory",price:35,detail:"Цвет вывесок Campus Square."},
  {id:"lime-beanie",title:"Лаймовая шапка",category:"accessory",price:40,detail:"Уютная шапка для вечерних историй."},
  {id:"round-glasses",title:"Круглые очки",category:"accessory",price:45,detail:"Небольшая деталь образа."},
  {id:"headphones",title:"Наушники",category:"accessory",price:50,detail:"Для прогулки к Media House."},
  {id:"canvas-tote",title:"Холщовая сумка",category:"accessory",price:40,detail:"Поместится блокнот и карта."},
  {id:"crossbody-bag",title:"Сумка через плечо",category:"accessory",price:45,detail:"Руки свободны для фестиваля."},
  {id:"cyan-scarf",title:"Голубой шарф",category:"accessory",price:35,detail:"Небольшой яркий акцент."},
  {id:"bike-helmet",title:"Велошлем",category:"accessory",price:50,detail:"Образ для дороги через кампус."},
  {id:"festival-pin",title:"Значок фестиваля",category:"accessory",price:30,detail:"На память о площади."},
  {id:"desk-lamp",title:"Настольная лампа",category:"desk",price:70,detail:"Освещает личный стол."},
  {id:"leafy-plant",title:"Растение",category:"desk",price:60,detail:"Немного зелени в своём уголке."},
  {id:"rocket-figure",title:"Фигурка ракеты",category:"desk",price:75,detail:"Маленький предмет для полки."},
  {id:"cyan-poster",title:"Плакат",category:"world",price:80,detail:"Абстрактная карта новых идей."},
  {id:"display-stand",title:"Подставка коллекции",category:"display",price:85,detail:"Показывает найденные открытки."},
] as const;
export const cosmeticById = Object.fromEntries(cosmetics.map(item=>[item.id,item])) as Record<string,Cosmetic>;

export type QuestPoint = {scene:WorldScene; id:string};
export type SideQuest = {id:string;title:string;intro:string;steps: readonly {point:QuestPoint; prompt:string; story:string}[]; endings: readonly [string,string]; reward:number; postcard?:string};
const at=(scene:WorldScene,id:string):QuestPoint=>({scene,id});
export const sideQuests:readonly SideQuest[] = [
  {id:"lost-cable",title:"Кабель для показа",intro:"Тимур отнёс запасной кабель в мастерскую, когда помогал Аиде. Теперь экран на площади ждёт его обратно.",steps:[{point:at("square","timur"),prompt:"Спросить Тимура",story:"Тимур вспоминает: кабель лежит рядом с испытательным столом. Он не хотел бросать незаконченный механизм."},{point:at("maker-room","maker-bench"),prompt:"Проверить верстак",story:"Кабель лежит под листом с пометками. Рядом записано, какой контакт нельзя перегибать."},{point:at("square","display"),prompt:"Вернуть кабель к экрану",story:"Экран снова показывает программу. Тимур благодарит за аккуратную доставку."}],endings:["Подключить сейчас, пока гости ещё не подошли.","Оставить запасной кабель рядом и попросить Тимура проверить соединение."],reward:25,postcard:"display"},
  {id:"prototype-route",title:"Прототип в пути",intro:"Аян обещал показать Лейле новую схему приложения. Он задержался на тесте, а беседа уже начинается.",steps:[{point:at("garage","ayan"),prompt:"Поговорить с Аяном",story:"Аян отдаёт карточку с двумя маршрутами. Он просит не выдавать первый вариант за окончательный."},{point:at("people","leila"),prompt:"Показать Лейле",story:"Лейла замечает, что маршрут на схеме начинается не с того входа, которым пользуются гости."}],endings:["Вернуть замечание Аяну до демонстрации.","Оставить обе схемы для сравнения на беседе."],reward:20,postcard:"product"},
  {id:"story-source",title:"Чей это голос",intro:"Иная собирает короткую историю прототипа и хочет назвать автора решения точно, а не по общему кадру.",steps:[{point:at("house","inaya"),prompt:"Поговорить с Инаей",story:"В черновике есть красивый кадр, но подпись к нему пока пустая."},{point:at("maker","aida"),prompt:"Спросить Аиду",story:"Аида объясняет, кто проверял крепление, а кто предложил закрыть механизм кожухом."},{point:at("house-room","house-edit"),prompt:"Передать точную подпись",story:"Иная добавляет имена к действию и оставляет в монтаже момент обсуждения."}],endings:["Начать историю с самого решения.","Начать историю с вопроса, из-за которого решение изменилось."],reward:30,postcard:"media"},
  {id:"quiet-table",title:"Тихий стол",intro:"Азамат заметил, что в кофейне теперь встречаются сразу несколько команд. Одному столу нужна более спокойная роль.",steps:[{point:at("cafe","azamat"),prompt:"Поговорить с Азаматом",story:"Он показывает стол у окна: здесь удобно говорить без шума сцены."},{point:at("people","oliver"),prompt:"Позвать Оливера",story:"Оливер согласен проводить короткие беседы, если на столе останется место для блокнота."},{point:at("cafe","cafe-counter"),prompt:"Подготовить место",story:"На столе появляется табличка с простым приглашением присесть и поговорить."}],endings:["Оставить один стол для коротких бесед.","Сдвинуть два стола, чтобы разговоры не мешали друг другу."],reward:25,postcard:"cafe"},
  {id:"evening-map",title:"Дорога вечером",intro:"Данияр увидел, что дневная схема скрывает тёмный поворот. Жанерке нужно узнать об этом до показа макета.",steps:[{point:at("urban","daniyar"),prompt:"Спросить Данияра",story:"На его схеме появился обход, который днём казался лишним."},{point:at("urban-room","urban-layers"),prompt:"Сравнить слои карты",story:"Вечерний слой добавляет освещённый переход у площади."},{point:at("urban","zhanerke"),prompt:"Показать Жанерке",story:"Жанерке сохраняет два варианта маршрута, чтобы обсудить их с посетителями."}],endings:["Показать рядом дневную и вечернюю карты.","Первым показать вечерний путь и объяснить отличие."],reward:25,postcard:"urban"},
  {id:"sound-check",title:"Слышно ли историю",intro:"Марк пытается записать голос Аружан на фоне сцены. Его первый дубль оказался слишком шумным.",steps:[{point:at("house","mark"),prompt:"Поговорить с Марком",story:"Он не хочет вырезать из записи паузы, которые делают ответ понятным."},{point:at("cafe","cafe-note"),prompt:"Осмотреть тихое место",story:"У окна меньше шума, но сюда часто заходят гости."},{point:at("house-room","house-podcast"),prompt:"Вернуться к записи",story:"Марк меняет положение микрофона и оставляет живой звук площади на заднем плане."}],endings:["Записать короткий ответ у окна.","Записать ответ в студии и добавить звук площади отдельно."],reward:30,postcard:"media"},
  {id:"feedback-card",title:"Один точный вопрос",intro:"Малика готовит карточки для теста приложения. На первой версии сразу пять вопросов, и гости теряют нить.",steps:[{point:at("garage","malika"),prompt:"Поговорить с Маликой",story:"Она просит выбрать один вопрос, который откроет разговор без подсказки автору."},{point:at("people-room","people-notes"),prompt:"Посмотреть примеры бесед",story:"В коротких заметках полезнее всего вопросы о конкретном действии."},{point:at("garage-room","garage-wall"),prompt:"Вернуть карточку",story:"Малика оставляет на карточке один вопрос о моменте, где человек остановился."}],endings:["Спросить, что человек ожидал увидеть дальше.","Попросить показать, где он впервые замедлился."],reward:25,postcard:"people"},
  {id:"seating-plan",title:"Место для разговора",intro:"Сания попросила освободить проход к стенду. Лавочки удобны, но одна из них перекрывает вид на объявление.",steps:[{point:at("square","saniya"),prompt:"Спросить Санию",story:"Она хочет оставить место и тем, кто ждёт друзей, и тем, кто ищет дорогу."},{point:at("square","board"),prompt:"Посмотреть от стенда",story:"С этого угла видно, где собирается очередь и куда можно сдвинуть лавочку."},{point:at("square","deliver"),prompt:"Предложить расстановку",story:"Проход стал свободнее, а люди всё ещё могут присесть рядом со сценой."}],endings:["Оставить две короткие группы сидений.","Освободить прямую линию к стенду и оставить лавочку сбоку."],reward:20,postcard:"square"},
  {id:"little-exhibit",title:"Стена неудачных версий",intro:"Нурсултан хочет показать не только работающий прототип, но и первую попытку, из которой команда научилась.",steps:[{point:at("maker","nursultan"),prompt:"Поговорить с Нурсултаном",story:"Он предлагает выставить старое крепление рядом с новым."},{point:at("maker-room","maker-test"),prompt:"Взять описание испытания",story:"Записи объясняют, почему первый вариант скрипел и где поправили крепление."},{point:at("maker","maker-kinetic"),prompt:"Оформить показ",story:"У прототипа появляется небольшая история двух версий."}],endings:["Показать оба крепления рядом.","Показать первую версию на карточке и дать посмотреть новую в движении."],reward:25,postcard:"maker"},
  {id:"missing-view",title:"Чей маршрут не спросили",intro:"Лейла заметила, что в её заметках почти нет людей, пришедших с Media House. Это может изменить схему тихого прохода.",steps:[{point:at("people","leila"),prompt:"Спросить Лейлу",story:"Она не хочет считать отсутствующий взгляд согласием."},{point:at("house","inaya"),prompt:"Спросить Инаю",story:"Иная рассказывает, как группа обходит сцену с тяжёлым оборудованием."},{point:at("people-room","people-field"),prompt:"Добавить маршрут",story:"На карте появляется ещё одна линия. Она не перечёркивает предыдущие, но помогает сравнить варианты."}],endings:["Добавить маршрут отдельным слоем.","Отметить вопрос для следующей беседы с гостями."],reward:30,postcard:"people"},
];
export const questById=Object.fromEntries(sideQuests.map(q=>[q.id,q])) as Record<string,SideQuest>;
export const postcards:Readonly<Record<string,{title:string;detail:string;art:string;source?:string}>>={
  display:{title:"Экран площади",detail:"Экран снова заработал перед открытием.",art:"display",source:"История кампуса"},
  product:{title:"Две схемы",detail:"Первый маршрут остался рядом со вторым для сравнения.",art:"journey-board"},
  media:{title:"Голос команды",detail:"В истории слышно, кто что сделал.",art:"camera"},
  cafe:{title:"Тихий стол",detail:"Здесь нашлось место для короткой беседы.",art:"coffee"},
  urban:{title:"Вечерний путь",detail:"На карте появился освещённый обход.",art:"city-model"},
  people:{title:"Другой взгляд",detail:"Новый маршрут дополнил полевые заметки.",art:"research-board"},
  square:{title:"Свободный проход",detail:"С площади легче найти стенд.",art:"board"},
  maker:{title:"Две версии",detail:"Первый прототип тоже стал частью показа.",art:"kinetic"},
  "visit-maker":{title:"Двор мастерских",detail:"Первое знакомство с Maker Yard.",art:"kinetic",source:"Исследование района"},
  "visit-garage":{title:"Гараж идей",detail:"Ты нашёл Product Garage.",art:"journey-board",source:"Исследование района"},
  "visit-people":{title:"Лаборатория людей",detail:"Ты заглянул в People Lab.",art:"research-board",source:"Исследование района"},
  "visit-urban":{title:"Городская карта",detail:"Ты посетил Urban Lab.",art:"city-model",source:"Исследование района"},
  "visit-house":{title:"Дом историй",detail:"Ты добрался до Media House.",art:"camera",source:"Исследование района"},
  "role-engineer":{title:"Проверенный механизм",detail:"Память об инженерной истории.",art:"kinetic",source:"История роли"},
  "role-product":{title:"Новый маршрут",detail:"Память о проверке пути гостя.",art:"journey-board",source:"История роли"},
  "role-research":{title:"Полевой вопрос",detail:"Память о двух разных ответах.",art:"research-board",source:"История роли"},
  "role-policy":{title:"Место для всех",detail:"Память о плане площади.",art:"city-model",source:"История роли"},
  "role-media":{title:"Подтверждённая история",detail:"Память о работе над сообщением.",art:"camera",source:"История роли"},
  "secret-square-birds":{title:"Птица за сценой",detail:"Небольшая находка на площади.",art:"origami",source:"Секрет"},
  "secret-cafe-note":{title:"Заметка у окна",detail:"Чужой вопрос, который остался в кофейне.",art:"notebooks",source:"Секрет"},
  "secret-maker-bird":{title:"Птица из чертежа",detail:"Спрятана под верстаком.",art:"origami",source:"Секрет"},
  "secret-garage-sticker":{title:"Обратная сторона",detail:"Вопрос с оборота стикера.",art:"notebooks",source:"Секрет"},
  "secret-people-fold":{title:"Край карты",detail:"Маленькая схема тихого места.",art:"origami",source:"Секрет"},
  "secret-urban-ticket":{title:"Вечерний билет",detail:"Напоминание проверить дорогу в темноте.",art:"notebooks",source:"Секрет"},
  "secret-house-frame":{title:"Лишний кадр",detail:"Команда смеётся над неудачным дублем.",art:"camera",source:"Секрет"},
};
