// Versioned, author-owned learning content. It does not define admission criteria.
export const skillVersion = 2;
export const skillDomains = [
  { id: "LEADERSHIP", title: "Лидерство", intro: "Пробуй решения, распределяй ответственность и меняй план, когда меняются обстоятельства." },
  { id: "TEAMWORK", title: "Работа в команде", intro: "Слушай разные позиции и собирай решение вместе с другими." },
  { id: "COMMUNICATION", title: "Коммуникация", intro: "Объясняй идею так, чтобы собеседник понял суть и мог задать вопрос." },
  { id: "ENGLISH", title: "Английский", intro: "Пробуй объяснять идеи и участвовать в разговоре на английском." },
] as const;
export type SkillDomainId = (typeof skillDomains)[number]["id"];
export type ActivityType = "VIDEO" | "READING" | "QUIZ" | "BRANCHING_SCENARIO" | "REFLECTION" | "TEXT_RESPONSE" | "AUDIO_RESPONSE" | "SORTING" | "DIALOGUE" | "SUBMISSION";
type Choice = { id: string; label: string; consequence: string; correct?: boolean };
export type SkillNode = {
  id: string; domain: SkillDomainId; branch: string; title: string; shortDescription: string;
  type: ActivityType; tier: number; prerequisites: string[]; optional: boolean;
  reward: number; rewardVersion: number; version: number; prompt: string;
  passage?: string; choices?: Choice[]; followup?: { prompt: string; choices: Choice[] };
  items?: { id: string; label: string }[]; expectedOrder?: string[];
  minWords?: number; mediaSrc?: string; mediaTranscript?: string;
};
const C = (id: string, label: string, consequence: string, correct = false): Choice => ({ id, label, consequence, correct });
const N = (domain: SkillDomainId, branch: string, id: string, title: string, type: ActivityType, prompt: string,
  extra: Partial<SkillNode> = {}): SkillNode => ({
  id, domain, branch, title, type, prompt, shortDescription: extra.shortDescription ?? prompt,
  tier: extra.tier ?? 1, prerequisites: extra.prerequisites ?? [], optional: extra.optional ?? false,
  reward: extra.reward ?? ({ QUIZ: 15, READING: 15, VIDEO: 15, BRANCHING_SCENARIO: 30, SORTING: 20, DIALOGUE: 30, AUDIO_RESPONSE: 40, SUBMISSION: 40, REFLECTION: 25, TEXT_RESPONSE: 25 }[type]),
  rewardVersion: 1, version: 1, ...extra,
});

export const skillNodes: SkillNode[] = [
  N("LEADERSHIP", "Решения", "l-choice", "Два хороших решения", "BRANCHING_SCENARIO", "Для школьной выставки осталось два дня. Команда может доработать работающий стенд или добавить интерактивную часть. Что выберешь?", { choices: [
    C("steady", "Довести стенд и заранее проверить демонстрацию", "Гости увидят надёжный результат, но команда не попробует новую идею."),
    C("new", "Сделать интерактивную часть с запасным вариантом", "Новая идея привлечёт внимание, но времени на проверку станет меньше."),
  ], followup: { prompt: "За день до выставки проектор выходит из строя. Как пересмотришь план?", choices: [
    C("fallback", "Показать стенд без проектора и коротко объяснить замысел", "Ты сохраняешь главное и честно называешь ограничение."),
    C("borrow", "Попросить соседнюю команду о проекторе и подготовить печатную схему", "У тебя два пути, но согласование займёт время."),
  ] }, reward: 30 }),
  N("LEADERSHIP", "Ответственность", "l-own", "Что обещать группе", "READING", "Прочитай ситуацию и выбери обещание, которое можно проверить.", { passage: "Волонтёры готовят встречу первокурсников. Регистрация ещё открыта, поэтому число гостей неизвестно. Ты отвечаешь за навигацию в здании.", choices: [
    C("guarantee", "Обещаю, что никто не потеряется", "Это нельзя проверить заранее и гарантировать."),
    C("check", "До пятницы проверю маршрут и поставлю указатели у трёх поворотов", "Обещание ограничено твоей зоной ответственности и сроком.", true),
    C("later", "Разберёмся на месте", "Команда не знает, на что может рассчитывать."),
  ] }),
  N("LEADERSHIP", "Делегирование", "l-delegate", "Передай управление", "SORTING", "В день мероприятия расставь действия по порядку: сначала снять риск, затем распределить работу и сверить результат.", { prerequisites: ["l-choice"], tier: 2, items: [
    { id: "critical", label: "Уточнить, какие задачи нельзя перенести" }, { id: "assign", label: "Передать регистрацию новичку с короткой инструкцией" }, { id: "check", label: "Договориться о контрольной точке через 20 минут" },
  ], expectedOrder: ["critical", "assign", "check"] }),
  N("LEADERSHIP", "Неопределённость", "l-open", "Пять минут до открытия", "BRANCHING_SCENARIO", "Один организатор не пришёл. У тебя три человека и очередь гостей. Что изменишь первым?", { prerequisites: ["l-choice"], tier: 2, choices: [
    C("queue", "Открыть вход вовремя и временно сократить программу", "Гости войдут без задержки, но часть плана понадобится перенести."),
    C("wait", "Попросить гостей подождать десять минут, пока проверишь замену", "Программа может сохраниться, но людям нужно объяснить задержку."),
  ], followup: { prompt: "Отсутствующий участник пишет, что придёт через полчаса. Что сообщишь остальным?", choices: [
    C("now", "Назову новый план и время следующей сверки", "Команда понимает, что делать сейчас и когда пересмотреть решение."),
    C("silent", "Не буду отвлекать команду сообщением", "Темп сохранится, но люди могут работать по разным планам."),
  ] }, reward: 35 }),
  N("LEADERSHIP", "Ответственность", "l-repair", "После ошибки в афише", "DIALOGUE", "В афише указана неверная аудитория. Как начнёшь разговор с командой?", { prerequisites: ["l-own"], tier: 2, choices: [
    C("own", "Я разместил афишу. Исправлю её, а вы поможете проверить старые ссылки?", "Ты называешь своё действие и просишь конкретную помощь."),
    C("trace", "Давайте выясним, где возникла ошибка, и сразу поправим путь гостей", "Группа проверяет причину и действие одновременно."),
  ], followup: { prompt: "Кто-то говорит: «Уже поздно». Как ответишь?", choices: [
    C("route", "На входе поставим человека с верной аудиторией и обновим сообщение", "Позднее исправление всё ещё снижает ущерб."),
    C("accept", "Да, исправим только будущие афиши", "Ты сохраняешь силы, но сегодняшние гости могут не найти встречу."),
  ] } }),
  N("LEADERSHIP", "Инициатива", "l-start", "Небольшой первый шаг", "SUBMISSION", "Предложи изменение в жизни университета, которое можно испытать за неделю. Запиши кому это поможет, первый шаг и что покажет результат.", { prerequisites: ["l-own"], tier: 2, minWords: 35, reward: 45 }),
  N("LEADERSHIP", "Делегирование", "l-capacity", "Не самый быстрый участник", "REFLECTION", "В группе есть опытный участник с двумя задачами и новичок со свободным временем. Как передашь часть работы и какую поддержку оставишь?", { prerequisites: ["l-delegate"], tier: 3, minWords: 25 }),
  N("LEADERSHIP", "Решения", "l-revisit", "Пересмотри выбор", "TEXT_RESPONSE", "Вернись к выставке: какой новый факт заставил бы тебя изменить первое решение? Назови признак и альтернативное действие.", { prerequisites: ["l-choice", "l-open"], tier: 3, minWords: 25, optional: true }),

  N("TEAMWORK", "Слушать", "t-quiet", "Тихий участник", "BRANCHING_SCENARIO", "На встрече двое говорят почти всё время. Третий проверял данные, но молчит. Как изменишь ход обсуждения?", { choices: [
    C("round", "Дам каждому минуту назвать факт, который меняет решение", "У тихого участника появляется ясное место для вклада."),
    C("private", "Спрошу его после встречи и верну сведения группе", "Разговор может быть комфортнее, но решение группы задержится."),
  ], followup: { prompt: "Он говорит, что данные противоречат плану. Что дальше?", choices: [
    C("show", "Попросить показать исходные записи и обновить общий вывод", "Команда проверит факт без давления на человека."),
    C("vote", "Сразу поставить старый план на голосование", "Решение быстрое, но часть данных останется нерассмотренной."),
  ] } }),
  N("TEAMWORK", "Роли в команде", "t-roles", "Кто держит нить", "SORTING", "Перед встречей команды расставь шаги, которые помогут не потерять ответственность.", { items: [
    { id: "goal", label: "Назвать общий результат встречи" }, { id: "owner", label: "Договориться, кто берёт каждый следующий шаг" }, { id: "return", label: "Определить, когда сверить сделанное" },
  ], expectedOrder: ["goal", "owner", "return"] }),
  N("TEAMWORK", "Обратная связь", "t-feedback", "Скажи точно", "DIALOGUE", "Коллега хорошо собрал данные, но таблица непонятна новичкам. Как начнёшь обратную связь?", { prerequisites: ["t-quiet"], tier: 2, choices: [
    C("specific", "Данные полные. Давай добавим подписи к двум колонкам, которые мы не поняли", "Человек слышит конкретное наблюдение и предложение."),
    C("ask", "Можно вместе пройти таблицу глазами нового участника?", "Ты открываешь совместную проверку, не предполагая причины."),
  ], followup: { prompt: "Коллега отвечает: «Но у нас нет времени». Что предложишь?", choices: [
    C("two", "Исправим две самые важные подписи сегодня, остальное завтра", "Объём работы становится посильным."),
    C("all", "Тогда оставим таблицу как есть", "Срок сохранён, но новички могут ошибиться при чтении."),
  ] } }),
  N("TEAMWORK", "Конфликт", "t-ideas", "Конфликт двух сильных идей", "BRANCHING_SCENARIO", "Одна участница хочет провести живую встречу, другой предлагает короткие онлайн-сессии. Оба приводят данные. Что проверишь прежде выбора?", { prerequisites: ["t-quiet"], tier: 2, choices: [
    C("access", "Сравнить, кому доступен каждый формат и какой результат нужен", "Ты сохраняешь сильные аргументы обеих сторон."),
    C("pilot", "Провести по одному небольшому пилоту каждого формата", "Появятся новые сведения, но команда потратит больше времени."),
  ], followup: { prompt: "Есть бюджет только на один формат. Как сообщишь решение?", choices: [
    C("criteria", "Назову критерии, выбранный формат и что проверим позже", "Даже несогласные увидят основание решения."),
    C("majority", "Скажу, что большинство уже решило", "Это быстро, но сильные доводы меньшинства теряются."),
  ] }, reward: 35 }),
  N("TEAMWORK", "Совместное решение", "t-common", "Собери общее решение", "SUBMISSION", "Два участника предлагают разные способы привлечь новых студентов. Запиши общее условие успеха, часть идеи каждого и проверку через неделю.", { prerequisites: ["t-ideas", "t-roles"], tier: 3, minWords: 35, reward: 45 }),
  N("TEAMWORK", "Слушать", "t-paraphrase", "Что услышали на самом деле", "QUIZ", "После слов «я не успеваю подготовить макет» какой ответ уточняет ситуацию без догадки о мотивах?", { choices: [
    C("lazy", "Ты не хочешь заниматься дизайном?", "Это приписывает причину, которой человек не назвал."),
    C("block", "Какая часть макета занимает больше всего времени?", "Вопрос раскрывает конкретное препятствие.", true),
    C("replace", "Тогда я передам макет другому", "Решение принимается без проверки, какая помощь нужна."),
  ] }),
  N("TEAMWORK", "Обратная связь", "t-receive", "Прими замечание", "REFLECTION", "Вспомни безопасную учебную ситуацию, когда тебе предложили изменить работу. Что ты уточнил бы перед правкой и как проверил бы улучшение?", { prerequisites: ["t-feedback"], tier: 3, minWords: 25 }),
  N("TEAMWORK", "Роли в команде", "t-handoff", "Передай задачу так, чтобы её приняли", "TEXT_RESPONSE", "Напиши короткое сообщение участнику: результат, срок, доступные материалы и место для вопроса. Не используй настоящие контакты.", { prerequisites: ["t-roles"], tier: 2, minWords: 25 }),

  N("COMMUNICATION", "Ясная мысль", "c-one", "Одна мысль, три аудитории", "TEXT_RESPONSE", "Ты придумал сервис поиска свободных учебных комнат. Объясни его первокурснику, преподавателю и человеку, который финансирует проект: по одному предложению каждому.", { minWords: 30 }),
  N("COMMUNICATION", "Storytelling", "c-scene", "История без лозунга", "READING", "Прочитай два начала истории и выбери то, которое даёт слушателю конкретную ситуацию.", { passage: "Команда рассказывает о работе над обменом вещами в общежитии. Цель — объяснить, почему она изменила порядок выдачи.", choices: [
    C("vague", "Мы всегда стремимся делать жизнь лучше", "Слушатель не видит ни ситуации, ни действия."),
    C("specific", "В пятницу три человека пришли за одной лампой: запись о выдаче не обновилась", "Есть событие, проблема и причина слушать дальше.", true),
  ] }),
  N("COMMUNICATION", "Объяснение сложного", "c-simple", "Сложное простыми словами", "SORTING", "Собери объяснение датчика качества воздуха в понятном порядке.", { prerequisites: ["c-one"], tier: 2, items: [
    { id: "why", label: "Зачем измерять воздух в аудитории" }, { id: "how", label: "Что измеряет датчик и чего он не умеет" }, { id: "example", label: "Пример: когда стоит открыть окно" },
  ], expectedOrder: ["why", "how", "example"] }),
  N("COMMUNICATION", "Публичное выступление", "c-60", "60 секунд", "AUDIO_RESPONSE", "Запиши короткий рассказ об идее: какая проблема, что ты предлагаешь и какой пример это показывает. Запись остаётся в личном развитии.", { prerequisites: ["c-one"], tier: 2, reward: 40 }),
  N("COMMUNICATION", "Вопросы аудитории", "c-question", "Неожиданный вопрос", "DIALOGUE", "После твоего рассказа слушатель спрашивает: «Почему вы уверены, что это нужно студентам?»", { prerequisites: ["c-scene"], tier: 2, choices: [
    C("honest", "Мы поговорили с шестью студентами; теперь хотим проверить это шире", "Ответ различает услышанное и пока не проверенный масштаб."),
    C("show", "Покажу, какую проблему мы увидели и как проверяем её дальше", "Ты переводишь вопрос к доступным свидетельствам."),
  ], followup: { prompt: "Слушатель спрашивает, что будет, если гипотеза не подтвердится. Что ответишь?", choices: [
    C("change", "Изменим решение и расскажем, какой факт повлиял на выбор", "У слушателя появляется понятное условие пересмотра."),
    C("keep", "Продолжим в том же виде: мы уже вложили время", "Сохранится темп, но риск тратить ресурсы без пользы вырастет."),
  ] } }),
  N("COMMUNICATION", "Питч", "c-slide", "У тебя один слайд", "QUIZ", "Для презентации сервиса обмена вещами выбери факт, который лучше всего помогает понять проблему.", { prerequisites: ["c-simple"], tier: 3, choices: [
    C("team", "Фотография всей команды", "Команда важна, но проблема слушателю не ясна."),
    C("dup", "За неделю шесть запросов повторились из-за неактуальной записи", "Конкретный факт показывает, что именно нужно изменить.", true),
    C("font", "Красивое название проекта", "Название привлечёт взгляд, но не объяснит ситуацию."),
  ] }),
  N("COMMUNICATION", "Storytelling", "c-turn", "Поворот истории", "REFLECTION", "Продолжи историю слайдов: какой факт изменил первоначальный план и как ты объяснишь это аудитории без приукрашивания?", { prerequisites: ["c-scene"], tier: 2, minWords: 25 }),
  N("COMMUNICATION", "Питч", "c-pitch", "Идея за минуту", "SUBMISSION", "Напиши черновик выступления: проблема, действие, подтверждающий пример и вопрос к аудитории. Это личная работа, не материал заявки.", { prerequisites: ["c-slide", "c-question"], tier: 4, minWords: 45, reward: 50 }),

  N("ENGLISH", "Listening", "e-listen", "Listen & react", "VIDEO", "Watch the short captioned scene and choose the next useful question.", { mediaSrc: "/media/skill-listen.mp4", mediaTranscript: "Maya: We moved the student book exchange to Friday. The room is smaller, so we can welcome only twenty people at once. We have not told the volunteers yet.", choices: [
    C("color", "What color is the room?", "The room color does not address the new constraint."),
    C("volunteers", "How will you tell volunteers about the new limit?", "This question follows the change and helps the team act.", true),
  ], shortDescription: "A short captioned story about a changed event plan." }),
  N("ENGLISH", "Speaking", "e-speak", "One clear answer", "AUDIO_RESPONSE", "In English, record two or three sentences about something you helped make. Say what you did yourself.", { reward: 40 }),
  N("ENGLISH", "Explain your project", "e-project", "Explain your project", "TEXT_RESPONSE", "In English, explain a project you know: the problem, your action and one result. You may use a fictional example.", { prerequisites: ["e-speak"], tier: 2, minWords: 30 }),
  N("ENGLISH", "Interview English", "e-follow", "Interview follow-up", "DIALOGUE", "An interviewer asks: “What changed after your first test?” Choose a truthful way to begin.", { prerequisites: ["e-project"], tier: 3, choices: [
    C("fact", "We noticed two repeated requests, so we changed how we recorded them.", "The answer links a finding to an action."),
    C("limit", "Our first test was small. It suggested a change, but we need more evidence.", "The answer states the limit of the result."),
  ], followup: { prompt: "“How did you know the change helped?”", choices: [
    C("compare", "We compared the records before and after the change.", "A concrete comparison makes the answer clearer."),
    C("notyet", "We have not checked that yet; this would be our next step.", "The answer is honest about what is still unknown."),
  ] } }),
  N("ENGLISH", "Academic communication", "e-clear", "Same idea, clearer English", "QUIZ", "Which sentence makes the claim and its limit clear?", { choices: [
    C("always", "Our survey proves all students prefer this option.", "A small survey cannot establish what all students prefer."),
    C("some", "In our small survey, more respondents chose this option; we need a larger sample.", "This keeps both the observation and its limit.", true),
  ] }),
  N("ENGLISH", "Discussion", "e-discuss", "Join the discussion", "READING", "Read the argument and choose a response that moves the discussion forward.", { passage: "“Online meetings let more students join, but it is harder to notice when someone has a question.”", choices: [
    C("ignore", "Online meetings are always better.", "This ignores the concern in the argument."),
    C("question", "Could we try a question round at the end of each topic?", "The response works with the concern and proposes a test.", true),
  ] }),
  N("ENGLISH", "Listening", "e-detail", "What changed?", "QUIZ", "In Maya’s message, what changed about the book exchange?", { prerequisites: ["e-listen"], tier: 2, choices: [
    C("day", "It moved to Friday and the room has a limit of twenty people.", "Both changes are in the message.", true),
    C("free", "It became a paid event.", "The message does not mention payment."),
  ] }),
  N("ENGLISH", "Discussion", "e-response", "Your turn", "REFLECTION", "Write an English reply to a classmate who disagrees with your project idea. Acknowledge their point, add one fact and ask a question.", { prerequisites: ["e-discuss", "e-clear"], tier: 3, minWords: 30, reward: 30 }),
];

export const skillBranches: Record<SkillDomainId, string[]> = {
  LEADERSHIP: ["Решения", "Ответственность", "Делегирование", "Неопределённость", "Инициатива"],
  TEAMWORK: ["Слушать", "Роли в команде", "Обратная связь", "Конфликт", "Совместное решение"],
  COMMUNICATION: ["Ясная мысль", "Storytelling", "Объяснение сложного", "Публичное выступление", "Вопросы аудитории", "Питч"],
  ENGLISH: ["Listening", "Speaking", "Explain your project", "Interview English", "Academic communication", "Discussion"],
};
export const skillNode = (id: string) => skillNodes.find((n) => n.id === id);
export const skillHref = (id?: string) => `/my?view=route${id ? `&node=${encodeURIComponent(id)}` : ""}`;

// Future runtime contract. No WORLD_MISSION node is exposed until its runtime exists.
export type WorldMissionContract = { worldMissionId: string; skillDomain: SkillDomainId; skillBranch: string; prerequisites: string[]; reward: number; completionEvent: string; returnToNode: string };
