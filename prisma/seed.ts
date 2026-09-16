import { supplementSeed } from "./seed-materials";
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { programs, SOURCE_URL, domains } from "../src/lib/catalog";
import { emptyFields } from "../src/lib/validation";
const db = new PrismaClient();
const hash = (p: string) => {
  const s = randomBytes(16).toString("hex");
  return s + ":" + scryptSync(p, s, 64).toString("hex");
};
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const stories = [
  [
    "Айгерим Садыкова",
    "Алматы",
    "digital-products",
    "CLARIFICATION",
    "aigerim",
    "Сервис обмена учебниками",
    "Я провела 12 разговоров со школьниками и собрала маршрут обмена учебниками. В команде нас было трое. После первых встреч убрали обязательную регистрацию по телефону.",
    "Исследование пользователей и проверка маршрута; код написал другой участник.",
    "Хочу изучать исследование пользователей и управление продуктом. В inVision U мне близка работа над общей задачей с людьми из разных направлений.",
    "В анкете указаны 12 разговоров, в дневнике подробно описаны 8. Уточнить состав выборки.",
  ],
  [
    "Тимур Омаров",
    "Караганда",
    "creative-engineering",
    "REVIEW",
    "timur",
    "Датчик влажности для школьной теплицы",
    "Я собрал датчик влажности вместе с учителем физики. Проверял показания неделю, сравнивая их с ручным измерением. Корпус напечатал участник кружка.",
    "Сборка электронной схемы, журнал измерений.",
    "Интересует связь электроники с проектированием. Хочу научиться проверять инженерные решения в команде.",
    "Неясно, кто выбрал порог срабатывания датчика.",
  ],
  [
    "София Ким",
    "Астана",
    "digital-media",
    "INTERVIEW",
    "sofia",
    "Истории районной библиотеки",
    "Я записала три разговора с посетителями библиотеки и смонтировала короткие истории. После замечания библиотекаря исправила неверную дату открытия.",
    "Интервью, редактирование и монтаж.",
    "Хочу освоить визуальный сторителлинг и журналистскую этику, чтобы точнее рассказывать истории сообществ.",
    "Уточнить, как согласовано использование записей участников.",
  ],
  [
    "Алихан Нурлан",
    "Шымкент",
    "public-policy",
    "LANGUAGE",
    "alikhan",
    "Инициатива освещения двора",
    "Мы собрали обращения 24 жителей о плохо освещённом проходе. Я сравнил два варианта размещения светильников и подготовил таблицу расходов.",
    "Сбор обращений и сравнение затрат; закупками занималась управляющая организация.",
    "Интересует, как данные помогают обсуждать приоритеты города. Хочу изучить экономику и разработку общественной политики.",
    "Нет ответа управляющей организации; результат пока описан только кандидатом.",
  ],
  [
    "Мадина Асанова",
    "Тараз",
    "sociology",
    "REVIEW",
    "madina",
    "Исследование поездок в школу",
    "Я опросила 20 одноклассников о поездках в школу. Первоначальный вывод о всём районе пересмотрела: участники были только из одного класса.",
    "Составление вопросов, сбор и описание ограничений выборки.",
    "Хочу изучать качественные и количественные исследования и понимать, чьи голоса отсутствуют в данных.",
    "Размер выборки указан последовательно; нужен пример изменённого вопроса.",
  ],
  [
    "Даниил Петров",
    "Павлодар",
    "digital-products",
    "DECIDED",
    "daniil",
    "Расписание волонтёрской команды",
    "Я собрал календарь смен для команды из девяти человек. Сначала назначал смены сам, затем стал собирать доступность участников заранее.",
    "Согласование требований и настройка календаря.",
    "Хочу лучше понимать командную разработку и то, как измерять полезность небольшого сервиса.",
    "Сотрудник уточнил личную роль на интервью.",
  ],
  [
    "Аружан Ермек",
    "Костанай",
    "digital-media",
    "CLARIFICATION",
    "aruzhan",
    "Школьный подкаст",
    "Я предложила выпуск о выборе профессии, нашла двух гостей и подготовила вопросы. Звук монтировали два других участника.",
    "Редактор темы, приглашение гостей и подготовка вопросов.",
    "Интересуют редактура и медиапроизводство. Хочу научиться задавать вопросы и проверять факты.",
    "В видеопрезентации сказано «сделала подкаст»; границы роли требуют уточнения.",
  ],
  [
    "Нурислам Бек",
    "Семей",
    "creative-engineering",
    "INTERVIEW",
    "nurislam",
    "Разборная стойка для выставки",
    "В кружке мы собрали стойку из фанеры. Я сравнил два крепления и записал, какое было удобнее собирать. Стойку использовали на школьной выставке.",
    "Сравнение соединений и инструкция сборки.",
    "Хочу соединять дизайн с инженерным проектированием и делать вещи удобными для разных пользователей.",
    "Нет сведений о нагрузке; не делать вывод о безопасности конструкции.",
  ],
  [
    "Жанель Мурат",
    "Кызылорда",
    "sociology",
    "LANGUAGE",
    "zhanel",
    "Карта мест для чтения",
    "Я поговорила с семью знакомыми о местах для чтения. Их ответы оказались разными. Вместо общей рекомендации описала три разных потребности.",
    "Разговоры, тематическая группировка ответов.",
    "Мне интересно, как люди используют общее пространство. Хочу научиться исследовать без слишком быстрых обобщений.",
    "Знакомые не представляют всех жителей.",
  ],
  [
    "Эмир Токтосун",
    "Бишкек",
    "public-policy",
    "REVIEW",
    "emir",
    "План школьного двора",
    "Мы обсуждали, на что направить небольшой бюджет двора: тень, скамейки или спортивный инвентарь. Я подготовил сравнительную таблицу запросов.",
    "Сбор запросов и фасилитация обсуждения.",
    "Хочу изучать общественную политику и прозрачные способы выбирать между ограниченными ресурсами.",
    "Число поддержавших инициативы не зафиксировано.",
  ],
  [
    "Алина Юн",
    "Усть-Каменогорск",
    "digital-products",
    "REVIEW",
    "alina",
    "Навигация школьной выставки",
    "Я нарисовала навигацию по выставке и попросила четырёх посетителей найти нужный стенд. После наблюдения изменила названия двух разделов.",
    "Сценарии проверки и изменение навигации.",
    "Хочу изучать UX/UI и научиться превращать наблюдения в решения, которые можно проверить.",
    "Проверка с четырьмя людьми — конкретный эпизод, а не доказательство общего эффекта.",
  ],
  [
    "Руслан Абдиев",
    "Актау",
    "creative-engineering",
    "DECIDED",
    "ruslan",
    "Автоматический полив",
    "Я собрал систему полива по открытой инструкции. После сбоя проводки нашёл ошибку соединения с помощью руководителя кружка.",
    "Сборка по инструкции и поиск ошибки под руководством.",
    "Интересует электроника. Хочу глубже понимать решения, которые пока могу только повторять по схеме.",
    "Готовность обсуждена сотрудником; решение требует дополнительной подготовки по документам.",
  ],
] as const;
async function main() {
  if (process.env.ENABLE_LOCAL_SEED !== "true")
    throw new Error("Set ENABLE_LOCAL_SEED=true for the isolated local seed.");
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1"].includes(host))
    throw new Error("Local seed requires a local database.");
  const staff = await db.user.upsert({
    where: { email: "admissions@invision.local" },
    create: {
      email: "admissions@invision.local",
      name: "Алия Нурова",
      passwordHash: hash("LeaderDesk2026!"),
      role: "STAFF",
      origin: "SEED",
    },
    update: {},
  });
  for (const p of programs)
    await db.program.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        shortTitle: p.shortTitle,
        description: p.description,
        disciplines: [...p.disciplines],
        sourceUrl: SOURCE_URL,
        checkedAt: new Date("2026-09-14"),
      },
      update: {},
    });
  await db.setting.upsert({
    where: { key: "rubric" },
    create: {
      key: "rubric",
      value: {
        version: 1,
        guidance:
          "Рассматривайте существенный вывод, личную роль и конкретный источник. «Есть проявление» — действие описано в одном эпизоде; «Устойчивое проявление» требует нескольких разных эпизодов. Достаточность источников и противоречия фиксируются отдельно. Рассказ кандидата не является независимым подтверждением. Чувствительные области оцениваются только человеком; травматические подробности не требуются. Формы ATOLA и D.R.I.V.E. здесь служат организации разговора, а не официальной психометрической шкале.",
      },
    },
    update: {},
  });
  for (const [i, s] of stories.entries()) {
    const [
      name,
      city,
      programSlug,
      stage,
      alias,
      title,
      experience,
      personalRole,
      motivation,
      contradiction,
    ] = s;
    const email = alias + "@candidate.local";
    if (await db.user.findUnique({ where: { email } })) continue;
    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash: hash("MyPath2026!"),
        role: "CANDIDATE",
        origin: "SEED",
        interests: [programSlug],
      },
    });
    const fields = {
      ...emptyFields,
      name,
      email,
      city,
      experience,
      personalRole,
      motivation,
      most: String(i % 4),
      least: String((i + 1) % 4),
      processing: true,
      audioConsent: true,
      documentNote: "Материалы рассмотрены в составе заявки.",
    };
    const submittedAt = new Date(Date.UTC(2026, 8, 9 + (i % 4), 5 + (i % 6)));
    const app = await db.application.create({
      data: {
        userId: user.id,
        programSlug,
        fields: json(fields),
        stage,
        origin: "SEED",
        revision: 1,
        submittedAt,
        createdAt: submittedAt,
        versions: {
          create: {
            revision: 1,
            kind: "SUBMITTED",
            snapshot: json({ fields, programSlug, origin: "SEED" }),
          },
        },
      },
    });
    const ep = await db.episode.create({
      data: { applicationId: app.id, title, personalRole },
    });
    const source = await db.source.create({
      data: {
        applicationId: app.id,
        episodeId: ep.id,
        title: "Опыт · " + title,
        kind: "Анкета",
        content: experience + "\n\nМоя роль: " + personalRole,
        provenance: "SEED_CANDIDATE_ACCOUNT",
      },
    });
    const motive = await db.source.create({
      data: {
        applicationId: app.id,
        title: "Почему inVision U",
        kind: "Мотивация",
        content: motivation,
        provenance: "SEED_CANDIDATE_ACCOUNT",
      },
    });
    await db.source.create({
      data: {
        applicationId: app.id,
        episodeId: ep.id,
        title: "Рабочие заметки · " + title,
        kind: "Дневник проекта",
        content:
          i === 0
            ? "Восемь разговоров подробно записаны в дневнике. После наблюдения убрали обязательный телефон. Короткие разговоры на перемене отдельно не записывала."
            : `Эпизод: ${title}.\n${personalRole}\nСледующий вопрос: ${contradiction}`,
        provenance: "SEED_CANDIDATE_ACCOUNT",
      },
    });
    const audioPending = stage === "LANGUAGE";
    await db.languageCheck.create({
      data: {
        applicationId: app.id,
        state: {
          comprehension: "later",
          oralId: "",
          followupId: "",
          writtenNote: "",
        },
        status: audioPending ? "IN_PROGRESS" : "REVIEWED",
        result: audioPending
          ? "Ожидает устного ответа"
          : i % 3 === 0
            ? "Сотрудник рекомендует уточнить развёрнутый устный ответ."
            : "Документ о языке рассмотрен сотрудником; требования обсуждены отдельно.",
        reviewerId: audioPending ? null : staff.id,
        reviewedAt: audioPending ? null : submittedAt,
      },
    });
    for (const [domain, interpretation, sourceId] of [
      [domains[0], motivation, motive.id],
      [domains[3], `Личная роль описана: ${personalRole}`, source.id],
      [
        domains[5],
        `Описан один эпизод «${title}». ${contradiction}`,
        source.id,
      ],
    ])
      await db.assessment.create({
        data: {
          applicationId: app.id,
          authorId: staff.id,
          domain,
          level: "Есть проявление",
          sufficiency: i % 3 === 0 ? "Частично" : "Достаточно",
          contradiction:
            domain === domains[5]
              ? contradiction
              : "Не обнаружено в рассмотренных источниках",
          interpretation,
          sourceIds: [sourceId],
          createdAt: submittedAt,
        },
      });
    await db.message.create({
      data: {
        applicationId: app.id,
        authorId: staff.id,
        body:
          stage === "CLARIFICATION"
            ? contradiction + " Расскажите подробнее в ответном сообщении."
            : "Материалы получены. Следующие действия и обратная связь будут доступны здесь.",
        kind: stage === "CLARIFICATION" ? "CLARIFICATION" : "MESSAGE",
      },
    });
    if (stage === "INTERVIEW")
      await db.interview.create({
        data: {
          applicationId: app.id,
          scheduledAt: new Date("2026-09-18T09:00:00+05:00"),
          notes: {
            a1: "Обсудить эпизод «" + title + "».",
            t: "",
            o: "",
            l: "",
            a2: "",
            observation: "",
            assessment: "",
          },
        },
      });
    if (stage === "DECIDED")
      await db.decision.create({
        data: {
          applicationId: app.id,
          authorId: staff.id,
          action: i === 5 ? "ACCEPT" : "DECLINE",
          reason:
            i === 5
              ? "Сотрудник рассмотрел документы, уточнил личную роль и завершил интервью. Предложить зачисление."
              : "Сотрудник рассмотрел заявку и недостаточные документы о готовности. Решение обсуждено с кандидатом.",
          fromStage: "INTERVIEW",
          toStage: "DECIDED",
        },
      });
  }
  await supplementSeed(db);
  console.log(
    "Созданы связанные истории 12 кандидатов и учётная запись комиссии.",
  );
}
main().finally(() => db.$disconnect());
