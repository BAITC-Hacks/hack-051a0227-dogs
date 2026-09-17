import "server-only";
import { domains } from "./catalog";
import { factualAssessment } from "./scoring-provider.server";
import {
  validateScoringResult,
  type ScoringInput,
  type ScoringResult,
} from "./scoring-contract";

/** Authored fictional cases, used only by the isolated fixture CLI and tests.
 * No name/keyword matching or score inference on arbitrary candidate answers. */
export const assessmentStories = {
  language: {
    name: "Марк Ветров",
    motivation:
      "Хочу учиться в inVision U обсуждать проверку сервисов с участниками команды. Выбираю цифровые продукты: хочу изучать причины ошибок пользователя.",
    experience:
      "Я собрал форму записи на школьную выставку и проверил её с шестью посетителями. Двое не заметили выбор времени. Я перенёс его перед вводом контакта и повторил проверку: участники нашли свободное время. Редактор команды подготовил тексты, я отвечал за маршрут записи.",
    personalRole:
      "Я собрал маршрут, наблюдал шесть попыток записи и изменил порядок полей; тексты подготовил редактор.",
  },
  rich: {
    name: "Ника Левина",
    motivation:
      "Хочу учиться в inVision U, чтобы обсуждать решения с людьми разных направлений. Выбираю цифровые продукты: мне интересно проверять доступность сервиса до запуска.",
    experience:
      "В школьной библиотеке я организовала четыре встречи читателей. Я опросила 12 участников, сравнила два расписания и предложила перенести встречу на субботу. Команда распределила роли ведущего и редактора. На четыре встречи пришли 48 участников; это записи нашего журнала, а не независимая проверка. На следующей встрече я заранее собрала предпочтения по времени.",
    personalRole:
      "Я провела опрос, сравнила два расписания и предложила проверить субботний формат; участники команды выбрали свои роли.",
  },
  unclear: {
    name: "Илья Береговой",
    motivation:
      "Выбираю цифровые продукты: хочу разобраться, как проверять сервис с пользователями. В inVision U хочу обсуждать свои решения с другими студентами.",
    experience:
      "Мы запустили школьный обмен книгами. Команда подготовила форму и провела встречу. У нас было 20 участников. Что делал каждый участник команды, в этом описании не разделено.",
    personalRole: "Я участвовал в общей подготовке и помогал команде.",
  },
  conflict: {
    name: "Рада Озёрная",
    motivation:
      "Хочу исследовать, почему люди прекращают пользоваться сервисом. Выбираю цифровые продукты и совместное обсуждение решений в inVision U.",
    experience:
      "Я одна подготовила маршрут записи на встречу и проверила его с пятью участниками. В отчёте проекта указала 30 участников встречи.",
    personalRole:
      "Маршрут мы собирали вдвоём с редактором. По журналу на встречу пришли 18 участников.",
  },
} as const;
export const clarifiedAction =
  "Я лично нарисовал форму обмена книгами и проверил её с четырьмя одноклассниками. Редактор написал объявление, ведущий провёл встречу. После проверки я перенёс выбор времени перед контактом. В следующей встрече сначала проверю доступность времени.";
export type StoryKey = keyof typeof assessmentStories;
export function preparedStory(
  input: ScoringInput,
  key: StoryKey,
  clarified = false,
): ScoringResult {
  const story = assessmentStories[key];
  const allowedTitles = [
    "Опыт и личная роль",
    "Мотивация",
    "Видеопрезентация по ссылке",
    ...(key === "language" ? ["Письменный языковой ответ"] : []),
    ...(clarified ? ["Ответ в переписке"] : []),
  ];
  if (
    input.sources.some(
      (s) =>
        !allowedTitles.includes(s.title) || s.material || s.corrections.length,
    ) ||
    new Set(input.sources.map((s) => s.title)).size !== input.sources.length ||
    input.clarifications.length ||
    input.criteria.rubricVersion !== 1 ||
    input.criteria.numeric
  )
    throw new Error("STORY_MATERIALS_MISMATCH");
  if (
    input.facts.experience !== story.experience ||
    input.facts.motivation !== story.motivation ||
    input.facts.personalRole !== story.personalRole
  )
    throw new Error("STORY_INPUT_MISMATCH");
  const result = factualAssessment(input);
  result.state = "READY";
  result.evidence = [];
  const experience = input.sources.find(
    (s) => s.title === "Опыт и личная роль",
  )!;
  const motivation = input.sources.find((s) => s.title === "Мотивация")!;
  if (
    !experience ||
    !motivation ||
    experience.text !==
      `${story.experience}\n\nЛичная роль: ${story.personalRole}` ||
    motivation.text !== story.motivation
  )
    throw new Error("STORY_SOURCE_MISMATCH");
  const add = (
    id: string,
    source: typeof experience,
    quote: string,
    explanation: string,
  ) => {
    result.evidence.push({
      id,
      sourceId: source.id,
      sourceVersion: source.version,
      quote,
      explanation,
    });
  };
  add(
    "motivation",
    motivation,
    story.motivation,
    "Кандидат связывает выбор программы с описанным предметом интереса. Это заявление о мотивации, не прогноз успешности обучения.",
  );
  add(
    "experience",
    experience,
    story.experience,
    "Описание одного проекта. Личная роль и результат требуют сопоставления с остальными материалами.",
  );
  add(
    "role",
    experience,
    story.personalRole,
    "Отдельное поле личной роли относится к тому же проекту; оно не считается вторым достижением.",
  );
  result.domains = result.domains.map((d, i) => {
    if ([4, 7, 8].includes(i))
      return {
        ...d,
        interpretation:
          i === 8
            ? d.interpretation
            : "Область оставлена для человеческой интерпретации согласно действующей рубрике. По этому рассказу нельзя установить личные ценности или устойчивую направленность человека.",
        gaps:
          i === 8
            ? []
            : [
                "Нужен разговор об основаниях выбора в конкретной ситуации, без вывода о личности.",
              ],
      };
    return {
      ...d,
      evidenceIds: [i < 2 ? "motivation" : "experience"],
      sufficiency: "Частично" as const,
      consistency: "Не обнаружено противоречий" as const,
      interpretation:
        "Есть материал для обсуждения области; уровень пока не установлен.",
      gaps: [],
    };
  });
  const set = (
    i: number,
    interpretation: string,
    rating: boolean,
    evidenceIds: string[],
    sufficiency: "Частично" | "Достаточно" = "Частично",
  ) => {
    Object.assign(result.domains[i], {
      interpretation,
      rating: rating ? { label: "Есть проявление", value: null } : null,
      evidenceIds,
      sufficiency,
    });
  };
  set(
    0,
    "Названа причина выбора университета: совместное обсуждение решений. Стоит уточнить ожидания от такого формата.",
    true,
    ["motivation"],
  );
  set(
    1,
    "Интерес к цифровым продуктам связан с проверкой сервиса на пользователях, а не только с названием программы.",
    true,
    ["motivation"],
  );
  result.questions = [
    {
      id: "expectations",
      section: "thinking",
      domain: domains[0],
      gap: "Не раскрыты ожидания от совместного обсуждения",
      sourceId: motivation.id,
      text: "Какой вопрос о своём решении вы хотели бы обсудить со студентами другого направления?",
    },
  ];
  result.contradictions = [];
  if (key === "language") {
    result.summary =
      "В проекте записи на выставку описаны собственная проверка и изменение маршрута, роли в команде разделены. Языковой ответ требует отдельной проверки; он не меняет интерпретацию опыта.";
    set(
      2,
      "Автор предложил изменение маршрута по наблюдениям шести попыток записи.",
      true,
      ["experience", "role"],
    );
    set(
      3,
      "Роль автора в проверке маршрута отделена от работы редактора над текстами.",
      true,
      ["experience", "role"],
    );
    set(
      5,
      "Есть контекст, личные действия и наблюдение после изменения формы. Это свидетельство автора о собственном проекте.",
      true,
      ["experience"],
    );
    set(
      6,
      "Порядок полей изменён после наблюдения конкретной ошибки. Для нового контекста применение ещё нужно обсудить.",
      true,
      ["experience"],
    );
    const language = input.sources.find(
      (s) => s.title === "Письменный языковой ответ",
    );
    if (
      !language ||
      !input.language ||
      input.language.status !== "PENDING_REVIEW"
    )
      throw new Error("LANGUAGE_INPUT_MISMATCH");
    add(
      "language",
      language,
      language.text,
      "Письменный ответ сохранён и ожидает человеческой языковой проверки. Автоматический уровень английского не рассчитывается.",
    );
    result.recommendation = {
      action: "LANGUAGE",
      reason:
        "Содержательный эпизод доступен для обсуждения, а языковой ответ ещё не рассмотрен сотрудником. Проверьте его отдельно, сохранив оценки опыта.",
      sourceIds: [language.id],
    };
    result.feedback = {
      observation:
        "В проекте записи на выставку вы связали наблюдение ошибки с изменением порядка полей.",
      suggestion:
        "Объясните, как проверяли результат повторного прохождения маршрута. Языковой ответ будет рассмотрен отдельно.",
      nextAction:
        "Следуйте опубликованному запросу комиссии по языковой проверке в «Моём пути».",
      sourceIds: [experience.id, language.id],
    };
    result.questions.push({
      id: "result-check",
      section: "outcome",
      domain: domains[5],
      gap: "Неясны условия повторной проверки",
      sourceId: experience.id,
      text: "Повторно маршрут проверяли те же участники или новые? Как это могло повлиять на результат?",
    });
  } else if (key === "rich") {
    result.summary =
      "В одном библиотечном проекте описаны опрос, выбор расписания, распределение ролей и повторное применение вывода. Числа относятся к рассказу и журналу кандидата; независимое подтверждение ещё не рассмотрено.";
    set(
      2,
      "Кандидат инициировал проверку расписания и предложил конкретное изменение. Это проявление в одном эпизоде, без вывода об устойчивой черте.",
      true,
      ["experience", "role"],
      "Достаточно",
    );
    set(
      3,
      "Описано распределение ролей с участниками команды. Нужен взгляд на ситуацию разногласия.",
      true,
      ["experience", "role"],
    );
    set(
      5,
      "Даны действия, контекст, четыре встречи и наблюдаемый результат. Журнал пока существует только в описании.",
      true,
      ["experience"],
      "Достаточно",
    );
    set(
      6,
      "Сравнение двух вариантов расписания привело к проверке гипотезы и повторному сбору предпочтений. Применение объяснено на конкретной ситуации.",
      true,
      ["experience"],
    );
    result.questions.push(
      {
        id: "journal",
        section: "outcome",
        domain: domains[5],
        gap: "Журнал не рассмотрен как независимый материал",
        sourceId: experience.id,
        text: "Как в журнале учитывались повторные посетители и что изменилось между встречами?",
      },
      {
        id: "transfer",
        section: "application",
        domain: domains[6],
        gap: "Нужно проверить перенос принципа",
        sourceId: experience.id,
        text: "Как вы проверили бы расписание, если участники заранее не знают, когда смогут прийти?",
      },
    );
    result.recommendation = {
      action: "INTERVIEW",
      reason:
        "Есть конкретный эпизод с личными действиями и применением вывода. На интервью стоит проверить способ учёта результата и перенос подхода.",
      sourceIds: [experience.id],
    };
    result.feedback = {
      observation:
        "В библиотечном проекте вы связали опрос участников с изменением расписания и описали следующую проверку.",
      suggestion:
        "Уточните, как журнал учитывал повторных посетителей и чем отличались результаты встреч.",
      nextAction:
        "Подготовьте один пример записи из журнала для обсуждения по приглашению комиссии.",
      sourceIds: [experience.id],
    };
  } else if (key === "unclear") {
    result.summary =
      "Описан командный обмен книгами и заявлены 20 участников. Личное действие пока отделено от работы команды недостаточно; это неопределённость, а не низкая оценка.";
    for (const i of [2, 3, 5, 6])
      set(
        i,
        "Описание относится к команде в целом. Отдельное действие автора и основание результата ещё нужно уточнить.",
        false,
        ["experience", "role"],
      );
    result.domains[2].gaps = ["Неясен личный вклад в запуск обмена."];
    result.questions.push({
      id: "contribution",
      section: "action",
      domain: domains[2],
      gap: "Неясен личный вклад",
      sourceId: experience.id,
      text: "Какое действие при подготовке обмена книгами выполнили лично вы, а что сделали редактор и ведущий?",
    });
    result.recommendation = {
      action: "CLARIFICATION",
      reason:
        "Число участников не объясняет личного вклада. Уточните одно действие автора и результат его проверки.",
      sourceIds: [experience.id],
    };
    result.feedback = {
      observation:
        "В описании обмена книгами есть результат команды, но пока не разделены действия её участников.",
      suggestion:
        "Выберите одно действие, которое выполнили лично вы, и объясните, что изменилось после него.",
      nextAction:
        "Ответьте на уточнение в «Моём пути»: ваше действие, роли других участников и наблюдаемый результат.",
      sourceIds: [experience.id],
    };
    if (clarified) {
      const answer = input.sources.find(
        (s) => s.title === "Ответ в переписке" && s.text === clarifiedAction,
      );
      if (!answer) throw new Error("CLARIFICATION_INPUT_MISMATCH");
      add(
        "answer",
        answer,
        clarifiedAction,
        "Новый ответ разделяет работу автора, редактора и ведущего. Это уточнение первоначального проекта, не второй проект.",
      );
      result.summary =
        "В новом ответе автор отделил проверку формы от работы редактора и ведущего. Личный вклад теперь описан; данные об общем числе участников остаются непроверенными.";
      set(
        2,
        "В уточнении описаны личная проверка с четырьмя одноклассниками и изменение порядка полей.",
        true,
        ["answer"],
      );
      set(
        3,
        "Автор разделил роли и собственное действие в общем проекте.",
        true,
        ["answer"],
      );
      set(
        5,
        "Конкретизированы действие и локальный результат проверки формы; общий результат встречи требует сверки.",
        true,
        ["experience", "answer"],
      );
      set(
        6,
        "Автор объяснил изменение порядка полей и намерение сначала проверить доступность времени. Перенос ещё не продемонстрирован.",
        true,
        ["answer"],
      );
      result.domains[2].gaps = [];
      result.questions = result.questions.filter(
        (q) => q.id !== "contribution",
      );
      result.questions.push({
        id: "new-context",
        section: "application",
        domain: domains[6],
        gap: "Применение в другой ситуации ещё не показано",
        sourceId: answer.id,
        text: "Как вы проверили бы доступность времени, если запись идёт на оборудование с разной длительностью использования?",
      });
      result.recommendation = {
        action: "INTERVIEW",
        reason:
          "Уточнение отделило личное действие. На интервью можно проверить применение принципа в новом контексте и основания результата.",
        sourceIds: [answer.id],
      };
      result.feedback = {
        observation:
          "В уточнении вы разделили своё действие и роли команды и описали изменение формы после проверки.",
        suggestion:
          "Подготовьте объяснение того, как этот принцип работает при разных ограничениях времени.",
        nextAction:
          "Используйте описанный пример для обсуждения по опубликованному приглашению комиссии.",
        sourceIds: [answer.id],
      };
    }
  } else {
    result.summary =
      "В двух полях одной заявки различаются авторство маршрута и число участников. Эти расхождения требуют сверки до интерпретации результата. Языковая проверка рассматривается отдельно.";
    for (const i of [2, 3, 5]) {
      set(
        i,
        "В описании и личной роли различаются авторство и результат. До сверки уровень не установлен.",
        false,
        ["experience", "role"],
      );
      result.domains[i].consistency = "Есть противоречие";
      result.domains[i].gaps = [
        "Нужно сверить распределение действий и способ подсчёта участников.",
      ];
    }
    result.contradictions = [
      {
        text: "В описании сказано «одна» и «30 участников», в личной роли — «вдвоём» и «18 участников». Возможны разные способы учёта; сотруднику нужно уточнить контекст.",
        evidenceIds: ["experience", "role"],
      },
    ];
    result.questions.push({
      id: "difference",
      section: "outcome",
      domain: domains[5],
      gap: "Два описания результата расходятся",
      sourceId: experience.id,
      text: "К каким этапам относятся 30 и 18 участников? Как распределялась работа над маршрутом между вами и редактором?",
    });
    result.recommendation = {
      action: "CHECK",
      reason:
        "Сначала сверьте два описания одного проекта. Английский также ожидает отдельной человеческой проверки; он не снижает оценки опыта.",
      sourceIds: [experience.id],
    };
    result.feedback = {
      observation:
        "В описании проекта и поле личной роли указаны разные число участников и состав авторов маршрута.",
      suggestion:
        "Объясните, к каким этапам относятся эти числа и кто выполнял каждое действие.",
      nextAction:
        "Ответьте на уточнение по проекту в «Моём пути»; языковой ответ обсуждается отдельно.",
      sourceIds: [experience.id],
    };
  }
  return validateScoringResult(result, input);
}
