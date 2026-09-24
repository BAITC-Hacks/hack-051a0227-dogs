import { z } from "zod";
import type { Feedback } from "./types";

export const missionRuleVersion = 3;
const text = z.string().max(2000);
export const planSchema = z.object({
  choices: z.record(z.string(), z.string().max(80)),
  sequence: z.array(z.string().max(40)).max(8),
  allocations: z.array(z.number().int().min(0).max(12)).length(3),
  headline: text,
  explanation: text,
  verification: text,
  assignments: z.record(z.string(), z.string().max(40)),
});
export type MissionPlan = z.infer<typeof planSchema>;
export const missionSchema = z.object({
  version: z.literal(2),
  slug: z.string(),
  phase: z.enum(["INITIAL", "UPDATED"]),
  plan: planSchema,
  baseline: planSchema.nullable(),
  tests: z
    .array(
      z.object({
        phase: z.enum(["INITIAL", "UPDATED"]),
        plan: planSchema,
        checks: z.array(
          z.object({
            label: z.string(),
            passed: z.boolean(),
            detail: z.string(),
          }),
        ),
      }),
    )
    .max(2),
  conversations: z
    .array(
      z.object({
        role: z.string(),
        phase: z.enum(["INITIAL", "UPDATED"]),
        kind: z.enum(["ask", "assign"]),
        text: z.string(),
        sourceIds: z.array(z.string()),
        adapter: z.literal("local-scripted"),
        scenarioVersion: z.literal(2),
      }),
    )
    .max(12),
});
export type Mission = z.infer<typeof missionSchema>;
export type MissionCommand =
  { kind: "test" | "reveal" } | { kind: "ask" | "assign"; role: string };
export const missionCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("test") }),
  z.object({ kind: z.literal("reveal") }),
  z.object({ kind: z.enum(["ask", "assign"]), role: z.string().max(40) }),
]);
type Option = { id: string; label: string; detail: string };
type Field = { id: string; label: string; options: Option[] };
type Role = {
  id: string;
  name: string;
  role: string;
  capacity: number;
  initial: string;
  updated: string;
};
export type MissionDefinition = {
  title: string;
  role: string;
  goal: string;
  intro: string;
  materials: string[];
  newFact: string;
  fields: Field[];
  sequence?: { label: string; items: Option[] };
  tasks: { id: string; label: string; effort: number }[];
  team: Role[];
  result: string;
  programConnection: string;
  nextSlug: string;
};
const option = (id: string, label: string, detail: string): Option => ({
  id,
  label,
  detail,
});
const team = (
  a: [string, string, string, string],
  b: [string, string, string, string],
  c: [string, string, string, string],
): Role[] =>
  [a, b, c].map(([id, role, initial, updated], i) => ({
    id,
    name: ["Саша", "Мира", "Даня"][i],
    role,
    capacity: 3,
    initial,
    updated,
  }));
export const missions: Record<string, MissionDefinition> = {
  "digital-products": {
    title: "Запусти сервис обмена учебниками",
    role: "Координатор продуктовой команды",
    goal: "Помоги студенту найти доступный учебник и договориться о передаче.",
    intro:
      "У команды один рабочий цикл. Выбери проблему, первую функцию и маршрут. Проверь его, затем учти новое ограничение.",
    materials: [
      "Из 8 разговоров: 5 человек не знают, у кого есть нужная книга; 3 находят книгу, но не могут согласовать передачу. Эта небольшая выборка не описывает всех студентов.",
      "Каталог стоит 2 единицы работы, заявки на поиск 1, встроенный чат 3. На первую функцию есть 2 единицы. У каждого участника команды по 3 единицы времени.",
      "В маршруте должны остаться поиск, проверка доступности, договорённость и подтверждение. Контакт можно запросить после проверки доступности.",
    ],
    newFact:
      "Владельцы не всегда отвечают сразу. Студенту нужен путь при недоступной книге. Стойка выдачи закрывается в 18:00; вечерняя передача возможна только по договорённости.",
    fields: [
      {
        id: "problem",
        label: "Первая проблема",
        options: [
          option(
            "find",
            "Найти нужную книгу",
            "Не видно, у кого есть экземпляр.",
          ),
          option(
            "arrange",
            "Договориться о передаче",
            "Книга найдена, но встреча не согласована.",
          ),
        ],
      },
      {
        id: "feature",
        label: "Первая функция",
        options: [
          option(
            "catalog",
            "Каталог доступных книг",
            "2 единицы. Подходит для поиска экземпляра.",
          ),
          option(
            "requests",
            "Заявки на поиск",
            "1 единица. Владелец откликается на запрос.",
          ),
          option(
            "chat",
            "Встроенный чат",
            "3 единицы. В этом цикле не помещается.",
          ),
        ],
      },
      {
        id: "fallback",
        label: "Если книга недоступна",
        options: [
          option(
            "none",
            "Завершить без альтернативы",
            "Студенту придётся начать заново.",
          ),
          option(
            "queue",
            "Оставить заявку",
            "Получить ответ, когда появится экземпляр.",
          ),
          option(
            "alternatives",
            "Показать другие экземпляры",
            "Продолжить поиск без повторного ввода.",
          ),
        ],
      },
      {
        id: "handoff",
        label: "Способ передачи",
        options: [
          option(
            "desk",
            "Через стойку до 18:00",
            "Предсказуемое место, ограниченные часы.",
          ),
          option(
            "meeting",
            "Договориться о встрече",
            "Гибкое время, нужно согласие двух людей.",
          ),
        ],
      },
    ],
    sequence: {
      label: "Маршрут студента",
      items: [
        option("find", "Найти книгу", ""),
        option("availability", "Проверить доступность", ""),
        option("contact", "Указать контакт", ""),
        option("arrange", "Согласовать передачу", ""),
        option("confirm", "Получить подтверждение", ""),
      ],
    },
    tasks: [
      { id: "research", label: "Уточнить проблему у студентов", effort: 2 },
      { id: "prototype", label: "Собрать маршрут", effort: 2 },
      { id: "test", label: "Проверить недоступную книгу", effort: 2 },
    ],
    team: team(
      [
        "researcher",
        "Исследование",
        "Начни с одной проблемы. Каталог помогает найти книгу, а заявки дают владельцам повод откликнуться.",
        "Проверь, может ли студент продолжить без повторного ввода, если экземпляр уже отдали.",
      ],
      [
        "designer",
        "Проектирование",
        "Сначала проверь доступность, затем проси контакт. Для договорённости контакт нужен; убирать его целиком необязательно.",
        "У стойки есть ограничение по времени. В подтверждении надо объяснить выбранный способ передачи.",
      ],
      [
        "builder",
        "Разработка",
        "У нас 2 единицы на первую функцию. Каталог или заявки помещаются; встроенный чат потребует ещё один цикл.",
        "Очередь заявок и другие экземпляры решают разные задачи. Выбери одну альтернативу и объясни её.",
      ],
    ),
    result: "Маршрут обмена и план работы команды",
    programConnection:
      "Связь потребности человека, функции и маршрута относится к исследованию пользователей и проектированию цифрового продукта. Посмотри, как эти задачи представлены в программе.",
    nextSlug: "creative-engineering",
  },
  "creative-engineering": {
    title: "Собери робота для доставки книг",
    role: "Координатор инженерной команды",
    goal: "Доставь груз в читальный зал без превышения энергии и бюджета.",
    intro:
      "Выбери шасси, батарею и маршрут. Характеристики ниже достаточны для учебной проверки. После первого запуска изменятся груз и путь.",
    materials: [
      "Сначала груз 2 кг, затем 4 кг. Бюджет сборки 9 единиц. Лёгкое шасси: груз до 3 кг, стоимость 2, расход 1 ед./м. Грузовое: до 6 кг, стоимость 4, расход 2 ед./м.",
      "Батарея компактная: запас 14, стоимость 2. Большая: запас 28, стоимость 4. Датчик препятствий стоит 1; без него маршрут среди людей недопустим по условиям упражнения.",
      "Прямой путь 6 м, объезд 10 м. После изменения прямой путь закрыт. Энергия = длина × расход шасси + масса груза. Это заданная учебная модель, не физическая экспертиза.",
    ],
    newFact:
      "Теперь нужно везти 4 кг книг. На прямом пути ремонт. Доступен объезд длиной 10 м; можно разделить груз на две поездки, но энергию считай для обеих.",
    fields: [
      {
        id: "chassis",
        label: "Шасси",
        options: [
          option("light", "Лёгкое", "До 3 кг; стоимость 2; расход 1/м."),
          option("cargo", "Грузовое", "До 6 кг; стоимость 4; расход 2/м."),
        ],
      },
      {
        id: "battery",
        label: "Батарея",
        options: [
          option("small", "Компактная", "Запас 14; стоимость 2."),
          option("large", "Большая", "Запас 28; стоимость 4."),
        ],
      },
      {
        id: "sensor",
        label: "Датчик препятствий",
        options: [
          option("yes", "Установить", "Стоимость 1."),
          option(
            "no",
            "Без датчика",
            "Маршрут среди людей не проходит проверку.",
          ),
        ],
      },
      {
        id: "route",
        label: "Путь",
        options: [
          option("direct", "Прямой, 6 м", "Доступен до ремонта."),
          option("detour", "Объезд, 10 м", "Доступен и во время ремонта."),
        ],
      },
      {
        id: "trips",
        label: "Количество поездок",
        options: [
          option("one", "Одна поездка", "Весь груз сразу."),
          option(
            "two",
            "Две поездки",
            "Груз делится поровну; расход пути удваивается.",
          ),
        ],
      },
    ],
    tasks: [
      { id: "assembly", label: "Собрать компоненты", effort: 2 },
      { id: "energy", label: "Посчитать расход", effort: 2 },
      { id: "route", label: "Осмотреть маршрут", effort: 2 },
    ],
    team: team(
      [
        "mechanic",
        "Сборка",
        "Лёгкая база дешевле и экономнее, но выдерживает только 3 кг. Две поездки допустимы, если хватит энергии.",
        "Для 4 кг можно выбрать грузовую базу или две лёгкие поездки. Сравни общий расход, а не только цену шасси.",
      ],
      [
        "electrician",
        "Питание",
        "Проверь сумму стоимости шасси, батареи и датчика. Остаток бюджета не обязан быть нулём.",
        "На объезде грузовая база расходует 24, а две лёгкие поездки тоже 24. Большая батарея покрывает оба варианта.",
      ],
      [
        "navigator",
        "Маршрут",
        "Без датчика нельзя выпускать робота на путь среди людей. Проверка маршрута отдельна от расчёта батареи.",
        "Прямой коридор закрыт. Исправь путь в сборке, даже если энергии хватало раньше.",
      ],
    ),
    result: "Сборка робота и протокол учебного запуска",
    programConnection:
      "Выбор компонентов и сопоставление расчёта с ограничениями относятся к инженерному проектированию. В программе можно подробнее изучить эту деятельность.",
    nextSlug: "digital-media",
  },
  "digital-media": {
    title: "Подготовь репортаж к публикации",
    role: "Выпускающий редактор",
    goal: "Собери материал об обмене книгами для выбранной аудитории и проверь основания утверждений.",
    intro:
      "Выбери читателя, цель и источники, переставь фрагменты, напиши заголовок. Перед выпуском придёт уточнение.",
    materials: [
      "Организатор: «На встречу зарегистрировались 40 человек». Это число регистраций, а не посещений.",
      "Журнал выдачи: в день встречи передано 27 книг. Фотография показывает очередь у стойки, но не всех участников.",
      "Участница: «Мне удалось найти учебник без покупки». Один рассказ не описывает результат для всех.",
      "Для публикации нужны минимум два разных источника. Факт, подпись к фото и личная история могут стоять в разном порядке.",
    ],
    newFact:
      "Организатор уточнил: из 40 регистраций 11 были повторными. Уникальных регистраций 29; точного числа пришедших нет. Журнал 27 переданных книг подтверждён.",
    fields: [
      {
        id: "audience",
        label: "Читатель",
        options: [
          option(
            "students",
            "Студенты",
            "Практическая история для участников.",
          ),
          option(
            "partners",
            "Партнёры центра",
            "Объяснение результата мероприятия.",
          ),
        ],
      },
      {
        id: "purpose",
        label: "Задача публикации",
        options: [
          option(
            "explain",
            "Объяснить, как работает обмен",
            "Показать процесс и ограничения.",
          ),
          option(
            "report",
            "Рассказать об итогах",
            "Сопоставить подтверждённые факты.",
          ),
        ],
      },
      {
        id: "number",
        label: "Факт для публикации",
        options: [
          option(
            "forty",
            "40 регистраций",
            "Первоначальная запись организатора.",
          ),
          option(
            "unique",
            "29 уникальных регистраций",
            "Подтверждается только уточнением.",
          ),
          option(
            "books",
            "27 переданных книг",
            "Подтверждено журналом выдачи.",
          ),
        ],
      },
      {
        id: "scope",
        label: "Как описать посещаемость",
        options: [
          option(
            "unknown",
            "Число пришедших не установлено",
            "Регистрации не равны посещениям.",
          ),
          option(
            "all",
            "Все зарегистрированные пришли",
            "Подтверждающего источника нет.",
          ),
        ],
      },
    ],
    sequence: {
      label: "Материалы в публикации",
      items: [
        option("log", "Журнал выдачи", "27 книг"),
        option("organizer", "Слова организатора", "Регистрации"),
        option("participant", "Рассказ участницы", "Личный опыт"),
        option("photo", "Фото у стойки", "Один момент встречи"),
      ],
    },
    tasks: [
      { id: "facts", label: "Сверить цифры с источниками", effort: 2 },
      { id: "edit", label: "Собрать текст и заголовок", effort: 2 },
      { id: "release", label: "Проверить подписи перед выпуском", effort: 2 },
    ],
    team: team(
      [
        "reporter",
        "Репортёр",
        "Рассказ участницы можно поставить первым. Подпиши, что это личный опыт, и добавь подтверждённый факт.",
        "Уточнение меняет число регистраций. Факт о 27 книгах остался прежним.",
      ],
      [
        "editor",
        "Редактор",
        "Заголовок и объяснение подачи ты пишешь сам. Проверка не оценивает их художественное качество.",
        "Можно строить историю вокруг книг или регистраций. В обоих случаях не утверждай точное число посетителей.",
      ],
      [
        "producer",
        "Выпуск",
        "Для разных аудиторий полезны разные детали. Выбери цель до расстановки фрагментов.",
        "Проверь, что в выбранных материалах есть источник числа. Один красивый кадр его не доказывает.",
      ],
    ),
    result: "Редакторский макет публикации",
    programConnection:
      "Выбор аудитории, работа с источниками и сборка истории относятся к редактуре, коммуникации и медиапроизводству. Посмотри, как они связаны с программой.",
    nextSlug: "sociology",
  },
  sociology: {
    title: "Выясни, почему участники уходят из клуба",
    role: "Координатор исследования",
    goal: "Предложи объяснение оттока и проверку, которая может его опровергнуть.",
    intro:
      "Выбери предварительную гипотезу и данные. После первого разбора появится противоречащее свидетельство.",
    materials: [
      "Из 12 ушедших ответили только 4. Трое назвали неудобное время, один сменил интересы. Восемь не ответили.",
      "Два действующих участника довольны расписанием. Их ответы не заменяют мнения ушедших.",
      "Есть журнал посещений за 3 месяца, приглашение на беседу для неответивших и возможность тестового переноса встречи.",
    ],
    newFact:
      "Двое ушедших сообщили, что время им подходило, но новичкам не давали реальных задач. Это не опровергает проблему расписания у других, но делает единственное объяснение недостаточным.",
    fields: [
      {
        id: "hypothesis",
        label: "Рабочая гипотеза",
        options: [
          option(
            "time",
            "Неудобное расписание",
            "Проверить на ушедших и неответивших.",
          ),
          option(
            "roles",
            "Нет возможности участвовать",
            "Проверить доступ к задачам и роли новичков.",
          ),
          option(
            "mixed",
            "Причины различаются",
            "Сопоставить расписание и доступ к задачам.",
          ),
        ],
      },
      {
        id: "sample",
        label: "Кого услышать дальше",
        options: [
          option(
            "active",
            "Только активных участников",
            "Их легко найти, но они остались в клубе.",
          ),
          option(
            "missing",
            "Ушедших, которые не ответили",
            "Пополнить неполную выборку.",
          ),
          option(
            "compare",
            "Ушедших и оставшихся новичков",
            "Сравнить опыт двух групп.",
          ),
        ],
      },
      {
        id: "method",
        label: "Способ проверки",
        options: [
          option(
            "interview",
            "Беседы по одинаковым вопросам",
            "Проверить несколько возможных причин.",
          ),
          option(
            "pilot",
            "Пробная встреча с доступными ролями",
            "Наблюдать участие; не обещать причинный вывод.",
          ),
          option(
            "poll",
            "Опрос только в активном чате",
            "Не охватит многих ушедших.",
          ),
        ],
      },
      {
        id: "certainty",
        label: "Граница вывода",
        options: [
          option(
            "limited",
            "Предварительное объяснение",
            "Выборка неполная, причины могут различаться.",
          ),
          option(
            "certain",
            "Причина установлена для всех",
            "Эти данные не позволяют такого вывода.",
          ),
        ],
      },
    ],
    tasks: [
      { id: "sample", label: "Пригласить недостающую группу", effort: 2 },
      { id: "questions", label: "Подготовить одинаковые вопросы", effort: 2 },
      { id: "analysis", label: "Сопоставить свидетельства", effort: 2 },
    ],
    team: team(
      [
        "field",
        "Полевое исследование",
        "У нас нет ответов восьми ушедших. Их молчание не означает согласия с четырьмя ответившими.",
        "Новое свидетельство относится к роли новичков. Спроси и о задачах, и о времени, не навязывая одну причину.",
      ],
      [
        "analyst",
        "Анализ",
        "Журнал посещений показывает уход, но не его причину. Не называй гипотезу доказанным фактом.",
        "Гипотеза о времени может оставаться одной из причин. Объясни, что сравнишь с новым свидетельством.",
      ],
      [
        "facilitator",
        "Работа с участниками",
        "Беседа с ушедшими и оставшимися новичками даст сравнение, но не представительную статистику.",
        "Тестовая встреча проверит доступность ролей. Участие в одной встрече ещё не доказывает устойчивое возвращение.",
      ],
    ),
    result: "Исследовательская записка и план проверки",
    programConnection:
      "Проверка гипотез по неполной выборке и противоречащим свидетельствам относится к исследованию сообществ. Изучи это направление в описании программы.",
    nextSlug: "public-policy",
  },
  "public-policy": {
    title: "Организуй работу общественного учебного центра",
    role: "Координатор центра",
    goal: "Распредели доступные занятия между тремя группами и объясни, что пока не удастся обеспечить.",
    intro:
      "Спланируй шесть двухчасовых занятий. После проверки изменится доступность комнаты и сотрудника.",
    materials: [
      "Потребности: подросткам нужно 3 занятия, взрослым 3, совместной проектной группе 2. Все потребности одновременно не помещаются в 6 слотов.",
      "Две комнаты дают суммарно 6 слотов, два сотрудника могут сопровождать по 3. План задаётся количеством занятий каждой группы, а не политическими предпочтениями.",
      "Тихая самостоятельная работа не требует сотрудника, но только для взрослых. Подростковые и проектные занятия всегда требуют сопровождения.",
    ],
    newFact:
      "Одна комната доступна на слот меньше. Осталось 5 слотов. Второй сотрудник может провести только одно занятие: суммарно 4 сопровождаемых. Можно сделать до двух взрослых занятий самостоятельными.",
    fields: [
      {
        id: "adultMode",
        label: "Формат взрослых занятий",
        options: [
          option(
            "guided",
            "С сотрудником",
            "Каждое занятие требует сопровождения.",
          ),
          option(
            "independent",
            "Самостоятельная работа",
            "До двух занятий без сотрудника; нужна инструкция.",
          ),
        ],
      },
      {
        id: "priority",
        label: "Принцип распределения",
        options: [
          option(
            "balanced",
            "Дать доступ каждой группе",
            "Хотя бы одно занятие каждой; потребности закрыты частично.",
          ),
          option(
            "depth",
            "Сохранить полную программу двух групп",
            "Третьей группе пока не хватает слотов; объясни компромисс.",
          ),
        ],
      },
    ],
    tasks: [
      { id: "schedule", label: "Согласовать расписание комнат", effort: 2 },
      { id: "staff", label: "Подтвердить присутствие сотрудников", effort: 2 },
      { id: "followup", label: "Собрать обратную связь групп", effort: 2 },
    ],
    team: team(
      [
        "coordinator",
        "Расписание",
        "На восемь желаемых занятий есть шесть слотов. Равное распределение и полная программа двух групп имеют разные последствия.",
        "Теперь доступны пять слотов. Не оставляй в плане занятие в закрытой комнате.",
      ],
      [
        "mentor",
        "Сопровождение",
        "Подростки и проектная группа работают с сотрудником. Взрослые могут заниматься самостоятельно по инструкции.",
        "Доступны четыре сопровождаемых занятия. Самостоятельный формат взрослых освобождает время, но требует ясного задания.",
      ],
      [
        "liaison",
        "Связь с группами",
        "Уточни, как сообщишь каждой группе её расписание и ограничение. Количество слотов не измеряет удовлетворённость.",
        "Сравни, кто потерял занятие после изменения. Запиши способ проверить, состоялись ли запланированные встречи.",
      ],
    ),
    result: "Ресурсный план центра",
    programConnection:
      "Распределение ресурсов, сравнение последствий и проверка исполнения относятся к управлению общественными проектами. Посмотри связь этой деятельности с программой.",
    nextSlug: "digital-products",
  },
};
export function initialMission(slug: string): Mission {
  const d = missions[slug];
  if (!d) throw new Error("Задание не найдено");
  return {
    version: 2,
    slug,
    phase: "INITIAL",
    plan: {
      choices: Object.fromEntries(d.fields.map((f) => [f.id, f.options[0].id])),
      sequence: d.sequence?.items.map((o) => o.id) ?? [],
      allocations: [2, 2, 2],
      headline: "",
      explanation: "",
      verification: "",
      assignments: {},
    },
    baseline: null,
    tests: [],
    conversations: [],
  };
}
export function readMission(state: unknown): Mission | undefined {
  if (!state || typeof state !== "object" || !("mission" in state)) return;
  return missionSchema.parse((state as { mission: unknown }).mission);
}
export function validateMissionPlan(slug: string, p: MissionPlan) {
  const d = missions[slug];
  if (
    !d ||
    Object.keys(p.choices).length !== d.fields.length ||
    d.fields.some((f) => !f.options.some((o) => o.id === p.choices[f.id]))
  )
    throw new Error("Выбор не соответствует условиям миссии.");
  if (
    new Set(p.sequence).size !== p.sequence.length ||
    p.sequence.some((id) => !d.sequence?.items.some((o) => o.id === id))
  )
    throw new Error("Материал маршрута недоступен.");
  if (
    Object.entries(p.assignments).some(
      ([task, role]) =>
        !d.tasks.some((t) => t.id === task) ||
        !d.team.some((r) => r.id === role),
    )
  )
    throw new Error("Поручение не соответствует команде.");
}
export function missionChecks(m: Mission): Feedback["checks"] {
  const { slug, plan: p, phase } = m,
    d = missions[slug],
    c = p.choices,
    updated = phase === "UPDATED";
  const checks: Feedback["checks"] = [];
  const add = (label: string, passed: boolean, detail: string) =>
    checks.push({ label, passed, detail });
  if (slug === "digital-products") {
    add(
      "Функция и проблема",
      c.feature !== "chat" &&
        (c.problem === "find" || c.feature === "requests"),
      c.feature === "chat"
        ? "Чат стоит 3 единицы при доступных 2. Оставь каталог или заявки."
        : c.problem === "arrange" && c.feature === "catalog"
          ? "Каталог помогает найти книгу, но сам не помогает согласовать передачу. Пересмотри первую проблему или функцию."
          : "Выбранная функция укладывается в 2 единицы и поддерживает первую проблему.",
    );
    const seq = p.sequence;
    add(
      "Путь до подтверждения",
      ["find", "availability", "contact", "arrange", "confirm"].every((k) =>
        seq.includes(k),
      ) &&
        seq[0] === "find" &&
        seq.indexOf("availability") < seq.indexOf("contact") &&
        seq.indexOf("contact") < seq.indexOf("arrange") &&
        seq.at(-1) === "confirm",
      "Сначала книга и её доступность, затем контакт, договорённость и подтверждение. Передача требует контакта, а его ранний запрос ещё не помогает найти книгу.",
    );
    if (updated)
      add(
        "Недоступная книга",
        c.fallback !== "none",
        c.fallback === "none"
          ? "При недоступной книге маршрут обрывается. Добавь заявку или другие экземпляры."
          : `Студент может продолжить: ${c.fallback === "queue" ? "оставить заявку" : "увидеть другие экземпляры"}. ${c.handoff === "desk" ? "Передача через стойку ограничена временем до 18:00." : "Время встречи нужно согласовать."}`,
      );
  } else if (slug === "creative-engineering") {
    const mass = updated ? 4 : 2,
      trips = c.trips === "two" ? 2 : 1,
      cargo = c.chassis === "cargo",
      distance = c.route === "direct" ? 6 : 10,
      energy = distance * (cargo ? 2 : 1) * trips + mass,
      battery = c.battery === "large" ? 28 : 14,
      cost =
        (cargo ? 4 : 2) +
        (c.battery === "large" ? 4 : 2) +
        (c.sensor === "yes" ? 1 : 0);
    add(
      "Груз",
      mass / trips <= (cargo ? 6 : 3),
      `Груз за поездку: ${mass / trips} кг. Предел шасси: ${cargo ? 6 : 3} кг.`,
    );
    add(
      "Энергия",
      energy <= battery,
      `Расход: ${distance} м × ${cargo ? 2 : 1} × ${trips} поездки + ${mass} кг = ${energy}. Запас батареи: ${battery}.`,
    );
    add(
      "Сборка и путь",
      cost <= 9 && c.sensor === "yes" && (!updated || c.route === "detour"),
      `Стоимость сборки: ${cost} из 9. ${c.sensor === "yes" ? "Датчик установлен." : "Нужен датчик препятствий."} ${updated && c.route === "direct" ? "Прямой путь закрыт; выбери объезд." : "Выбранный путь доступен."}`,
    );
  } else if (slug === "digital-media") {
    add(
      "Подтверждённое число",
      (updated ? c.number !== "forty" : c.number !== "unique") &&
        p.sequence.includes(c.number === "books" ? "log" : "organizer"),
      updated && c.number === "forty"
        ? "После удаления повторов 40 регистраций уже неактуальны. Используй 29 уникальных или 27 переданных книг."
        : !updated && c.number === "unique"
          ? "Число 29 ещё не подтверждено доступными материалами."
          : "Выбранное число должно сопровождаться журналом выдачи или словами организатора.",
    );
    add(
      "Разные источники",
      p.sequence.length >= 2 && c.scope === "unknown",
      "Нужны как минимум два разных источника. Регистрации и фотография не доказывают число пришедших.",
    );
    add(
      "Заголовок",
      p.headline.trim().length >= 5,
      "Запиши собственный заголовок. Его точность и редакторскую выразительность нужно проверить чтением; автоматически проверяется только наличие.",
    );
  } else if (slug === "sociology") {
    add(
      "Недостающие свидетельства",
      c.sample !== "active" && c.method !== "poll",
      "Добавь ушедших или сравнение групп. Активный чат не охватывает многих ушедших.",
    );
    add(
      "Границы вывода",
      c.certainty === "limited",
      "Четыре ответа не представляют всех двенадцать ушедших. Причины могут различаться.",
    );
    if (updated)
      add(
        "Противоречащее свидетельство",
        c.hypothesis !== "time",
        "Добавь объяснение о доступе к задачам или гипотезу о разных причинах. Расписание может оставаться одной из причин.",
      );
  } else {
    const [y, a, g] = p.allocations,
      total = y + a + g,
      unguided = c.adultMode === "independent" ? Math.min(a, 2) : 0,
      staff = total - unguided,
      slots = updated ? 5 : 6,
      capacity = updated ? 4 : 6;
    add(
      "Комнаты и сопровождение",
      total > 0 && total <= slots && staff <= capacity,
      `Занятий: ${total}, доступно ${slots}. Нужен сотрудник на ${staff}, доступно ${capacity}. Самостоятельных взрослых занятий: ${unguided}.`,
    );
    add(
      "Потребности групп",
      y <= 3 &&
        a <= 3 &&
        g <= 2 &&
        (c.priority === "balanced"
          ? [y, a, g].every((n) => n >= 1)
          : [y >= 3, a >= 3, g >= 2].filter(Boolean).length >= 2),
      `Подростки: ${y} из 3; взрослые: ${a} из 3; проектная группа: ${g} из 2. ${c.priority === "balanced" ? "Каждой группе нужен хотя бы один слот." : "Проверь, что две группы получили полную запрошенную программу."}`,
    );
  }
  const assigned = d.tasks.every((t) => p.assignments[t.id]);
  add(
    "План команды",
    assigned &&
      d.team.every(
        (r) =>
          d.tasks
            .filter((t) => p.assignments[t.id] === r.id)
            .reduce((n, t) => n + t.effort, 0) <= r.capacity,
      ),
    "Каждую работу нужно поручить участнику. У каждого 3 единицы времени, поручение требует 2. Распределение сохраняется как твой план, а не доказательство выполненной людьми работы.",
  );
  add(
    "Объяснение и проверка",
    p.explanation.trim().length >= 20 && p.verification.trim().length >= 15,
    "Запиши выбранный компромисс и наблюдаемый способ проверки. Наличие текста проверяется; смысл и качество остаются предметом обсуждения.",
  );
  return checks;
}
export function samePlan(a: MissionPlan, b: MissionPlan) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function missionFeedback(m: Mission): Feedback {
  const checks = missionChecks(m),
    last = m.tests.find((t) => t.phase === m.phase),
    tested = !!last && samePlan(last.plan, m.plan);
  const all = checks.every((c) => c.passed);
  return {
    checks: [
      ...checks,
      {
        label: "Проверка после нового условия",
        passed: m.phase === "UPDATED" && tested,
        detail: !tested
          ? "Запусти проверку текущего решения. Сохранение само по себе не является проверкой."
          : m.phase === "INITIAL"
            ? "Первая проверка сохранена. Открой новое условие и проверь решение снова."
            : "Сохранена проверка текущего решения с новым условием.",
      },
    ],
    summary: !tested
      ? "Решение сохранено. Учебная проверка этого варианта ещё не выполнена."
      : !all
        ? `Проверка выявила конкретные ограничения: ${checks
            .filter((c) => !c.passed)
            .map((c) => c.label.toLowerCase())
            .join("; ")}. Их можно исправить и запустить проверку снова.`
        : m.phase === "INITIAL"
          ? "Исходные условия выполнены. Теперь можно проверить устойчивость решения после нового факта."
          : "Решение выполняет явные условия обновлённой задачи. Ниже сохранены выбранный компромисс, помощь команды и результат проверки.",
    actions: checks.filter((c) => !c.passed).map((c) => c.detail),
  };
}
export function missionDifferences(a: Mission, b: Mission): string[] {
  const d = missions[b.slug],
    out: string[] = [];
  for (const f of d.fields)
    if (a.plan.choices[f.id] !== b.plan.choices[f.id])
      out.push(
        `${f.label}. Было: ${f.options.find((o) => o.id === a.plan.choices[f.id])?.label ?? "не выбрано"}. Сейчас: ${f.options.find((o) => o.id === b.plan.choices[f.id])?.label ?? "не выбрано"}.`,
      );
  if (a.plan.sequence.join() !== b.plan.sequence.join())
    out.push(
      `${d.sequence?.label ?? "Последовательность"}: изменены состав или порядок. Сопоставь предпросмотры «Было» и «Сейчас».`,
    );
  if (
    b.slug === "public-policy" &&
    a.plan.allocations.join() !== b.plan.allocations.join()
  )
    for (const [i, name] of [
      "Подростковые занятия",
      "Взрослые занятия",
      "Проектные занятия",
    ].entries())
      if (a.plan.allocations[i] !== b.plan.allocations[i])
        out.push(
          `${name}. Было: ${a.plan.allocations[i]}. Сейчас: ${b.plan.allocations[i]}.`,
        );
  for (const [k, label] of [
    ["headline", "Заголовок"],
    ["explanation", "Объяснение компромисса"],
    ["verification", "Способ проверки"],
  ] as const)
    if (a.plan[k] !== b.plan[k]) out.push(`${label}: текст изменён автором.`);
  if (JSON.stringify(a.plan.assignments) !== JSON.stringify(b.plan.assignments))
    out.push("Изменено распределение работы команды.");
  return out;
}
export function describeMission(m: Mission): string {
  const d = missions[m.slug],
    p = m.plan;
  return [
    `Учебная работа: ${d.title}. Сценарий 2, правила ${missionRuleVersion}.`,
    ...d.materials.map((material) => `Условие задачи: ${material}`),
    m.phase === "UPDATED"
      ? `Новое условие: ${d.newFact}`
      : "Исходные условия задачи.",
    ...d.fields.map(
      (f) =>
        `${f.label}: ${f.options.find((o) => o.id === p.choices[f.id])?.label}`,
    ),
    d.sequence
      ? `${d.sequence.label}: ${p.sequence.map((id) => d.sequence?.items.find((o) => o.id === id)?.label).join("; ")}`
      : "",
    m.slug === "public-policy"
      ? `Занятия: подростки ${p.allocations[0]}, взрослые ${p.allocations[1]}, проектная группа ${p.allocations[2]}.`
      : "",
    p.headline ? `Заголовок: ${p.headline}` : "",
    `Компромисс автора: ${p.explanation}`,
    `Предложенная проверка: ${p.verification}`,
    `Поручения: ${d.tasks.map((t) => `${t.label}: ${d.team.find((r) => r.id === p.assignments[t.id])?.name ?? "не назначено"}`).join("; ")}`,
    `Помощь: ${m.conversations.length ? m.conversations.map((c) => `${d.team.find((r) => r.id === c.role)?.role}: ${c.text}`).join("\n") : "к команде не обращались"}`,
    missionFeedback(m).summary,
  ]
    .filter(Boolean)
    .join("\n");
}
