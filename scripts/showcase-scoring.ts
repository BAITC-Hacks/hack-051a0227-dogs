import "dotenv/config";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { domains } from "../src/lib/catalog";
import { digest, scoringInput } from "../src/lib/scoring-input.server";
import { factualAssessment } from "../src/lib/scoring-provider.server";
import { validateScoringResult } from "../src/lib/scoring-contract";
import { makePdf } from "../prisma/seed-materials";

/** Exact fictional acceptance records only. This script never runs from seed/build/start. */
const stories = [
  {
    email: "aigerim@candidate.local",
    origin: "SEED",
    score: 68,
    english: 71,
    axis: [2, 2, 1, 2, 1, 2, 1, 1, 1],
    ready: false,
    overview: "Провела разговоры со школьниками и предложила маршрут обмена учебниками. Видна инициатива в поиске потребностей; расхождение в числе бесед важно разобрать вместе с журналом.",
    quote:
      "Я провела 12 разговоров со школьниками и собрала маршрут обмена учебниками.",
    leadership:
      "Кандидат описала личную организацию разговоров и изменение маршрута; расхождение между 12 разговорами и восемью записями нужно уточнить.",
    file: "Eight interviews are recorded in detail; four shorter talks are not documented.",
  },
  {
    email: "timur@candidate.local",
    origin: "SEED",
    score: 62,
    english: 58,
    axis: [1, 2, 1, 2, 1, 2, 2, 1, 1],
    ready: false,
    overview: "Собрал датчик влажности и сравнил его показания с ручными измерениями. Техническая настойчивость видна, но самостоятельность выбора порога и роль учителя требуют уточнения.",
    quote: "Я собрал датчик влажности вместе с учителем физики.",
    leadership:
      "Сборка и недельная проверка описаны, но выбор порога срабатывания и распределение решений в команде пока не установлены.",
    file: "Sensor readings were compared with manual measurements for one week.",
  },
  {
    email: "sofia@candidate.local",
    origin: "SEED",
    score: 72,
    english: 76,
    axis: [2, 2, 2, 2, 1, 2, 2, 2, 1],
    ready: true,
    overview: "Подготовила материал о школьной библиотеке и исправила ошибку после замечания библиотекаря. Сильная сторона — готовность менять публичный результат после проверки; согласие участников ещё нужно подтвердить.",
    quote: "После замечания библиотекаря исправила неверную дату открытия.",
    leadership:
      "Кандидат описала принятие замечания и исправление публикации; согласие участников на использование записей требует проверки.",
    file: "The opening date was corrected after the librarian's comment.",
  },
  {
    email: "alikhan@candidate.local",
    origin: "SEED",
    score: 61,
    english: 64,
    axis: [1, 2, 1, 1, 1, 2, 2, 1, 1],
    ready: false,
    overview: "Сравнил варианты освещения и расходы, чтобы вынести предложение на обсуждение. В заявке есть последовательная работа с вариантами, но пока нет ответа организации и подтверждённого эффекта.",
    quote:
      "Я сравнил два варианта размещения светильников и подготовил таблицу расходов.",
    leadership:
      "Кандидат подготовил сравнение для обсуждения, но ответ управляющей организации и результат решения не представлены.",
    file: "Two lighting placements were compared; the managing organization has not responded.",
  },
  {
    email: "madina@candidate.local",
    origin: "SEED",
    score: 71,
    english: 69,
    axis: [2, 2, 2, 1, 2, 2, 2, 1, 1],
    ready: false,
    overview: "Пересмотрела вывод небольшого исследования, заметив ограничение выборки одним классом. Это показывает внимательность к данным; следующий вопрос — как изменился план исследования.",
    quote:
      "Первоначальный вывод о всём районе пересмотрела: участники были только из одного класса.",
    leadership:
      "Кандидат пересмотрела слишком широкий вывод после проверки состава выборки; пример изменённого исследовательского вопроса стоит уточнить.",
    file: "The sample included classmates from one class, not the whole district.",
  },
  {
    email: "daniil@candidate.local",
    origin: "SEED",
    score: 82,
    english: 78,
    axis: [2, 2, 2, 2, 2, 2, 2, 2, 1],
    ready: true,
    overview: "Координировал смены команды из девяти человек и изменил процесс после обратной связи участников. Материалы показывают способность учитывать ограничения других людей; личные решения уже обсуждались на интервью.",
    quote:
      "Сначала назначал смены сам, затем стал собирать доступность участников заранее.",
    leadership:
      "Кандидат изменил способ согласования смен с командой из девяти человек после обнаруженного ограничения; личную роль сотрудник уточнил на интервью.",
    file: "The team of nine shared availability before shifts were assigned.",
  },
  {
    email: "aruzhan@candidate.local",
    origin: "SEED",
    score: 65,
    english: 73,
    axis: [1, 2, 1, 2, 1, 2, 1, 1, 1],
    ready: false,
    overview: "Предложила выпуск о профессиях, нашла гостей и подготовила вопросы. Инициатива и редакторская работа описаны конкретно; монтаж и итоговый охват относятся также к другим участникам.",
    quote:
      "Я предложила выпуск о выборе профессии, нашла двух гостей и подготовила вопросы.",
    leadership:
      "Кандидат описала редакторскую инициативу и приглашение гостей; монтаж выполнили другие участники, границы личной роли надо уточнить.",
    file: "Two guests were invited; sound editing was done by other team members.",
  },
  {
    email: "nurislam@candidate.local",
    origin: "SEED",
    score: 66,
    english: 62,
    axis: [1, 2, 1, 2, 1, 2, 2, 1, 1],
    ready: true,
    overview: "Сравнил два способа сборки стойки и записал результаты для команды. Кандидат показывает практический подход к проверке идеи; безопасность при нагрузке пока не установлена.",
    quote: "Я сравнил два крепления и записал, какое было удобнее собирать.",
    leadership:
      "Кандидат сравнил варианты сборки и оформил инструкцию; безопасность стойки по нагрузке не подтверждена.",
    file: "Two plywood joints were compared; maximum load was not measured.",
  },
  {
    email: "zhanel@candidate.local",
    origin: "SEED",
    score: 63,
    english: 67,
    axis: [2, 1, 1, 1, 2, 2, 2, 1, 1],
    ready: false,
    overview: "После разговоров с семью знакомыми отказалась от общей рекомендации и выделила разные потребности. Это сильный пример пересмотра вывода, хотя группа собеседников слишком мала для широкого обобщения.",
    quote: "Вместо общей рекомендации описала три разных потребности.",
    leadership:
      "Кандидат изменила вывод после разных ответов семи знакомых; эта группа не представляет всех жителей.",
    file: "Seven acquaintances described different reading-place needs.",
  },
  {
    email: "emir@candidate.local",
    origin: "SEED",
    score: 60,
    english: 61,
    axis: [1, 2, 1, 1, 1, 2, 1, 1, 1],
    ready: false,
    overview: "Собрал запросы жителей и подготовил сравнительную таблицу для обсуждения бюджета. Работа с ограничениями понятна; не хватает записи о поддержке вариантов и последующем решении.",
    quote: "Я подготовил сравнительную таблицу запросов.",
    leadership:
      "Кандидат подготовил основу для обсуждения ограниченного бюджета; число поддержавших каждый вариант не зафиксировано.",
    file: "Requests for shade, benches and sports equipment were compared.",
  },
  {
    email: "alina@candidate.local",
    origin: "SEED",
    score: 69,
    english: 74,
    axis: [2, 2, 1, 2, 1, 2, 2, 1, 1],
    ready: false,
    overview: "Проверила навигацию сервиса с четырьмя посетителями и изменила два названия разделов. Видна работа с обратной связью, но эффект для остальных пользователей ещё не проверен.",
    quote: "После наблюдения изменила названия двух разделов.",
    leadership:
      "Кандидат организовала проверку навигации с четырьмя посетителями и пересмотрела решение; общий эффект за пределами этой группы не установлен.",
    file: "Four visitors tried the navigation; two section names were changed.",
  },
  {
    email: "ruslan@candidate.local",
    origin: "SEED",
    score: 43,
    english: 52,
    axis: [1, 2, 1, 1, 1, 1, 1, 1, 1],
    ready: false,
    overview: "Участвовал в поиске ошибки проводки и нашёл неисправное соединение с помощью руководителя. Технический интерес подтверждён эпизодом; самостоятельное ведение работы пока не видно.",
    quote:
      "После сбоя проводки нашёл ошибку соединения с помощью руководителя кружка.",
    leadership:
      "Поиск ошибки с помощью руководителя описан; самостоятельное ведение команды или независимая проверка решения не подтверждены.",
    file: "The wiring fault was found with help from the club supervisor.",
  },
  {
    email: "intake.leya@candidate.local",
    origin: "INTAKE_EXAMPLES_20260927",
    score: 64,
    english: 59,
    axis: [2, 2, 1, 1, 2, 2, 2, 1, 1],
    ready: false,
    overview: "Сверила журнал книжного обмена и отделила повторные обращения от завершённых выдач. Кандидат замечает ошибку в подсчёте и корректирует метод; объём личной ответственности нужно проверить.",
    quote: "Я сверила их с журналом и заметила повторы.",
    leadership: "Лея описала сверку журнала и изменение способа подсчёта. Личное решение и подтверждение количества выдач требуют отдельной проверки.",
    file: "The book-exchange journal separates completed handoffs from repeated requests.",
  },
  {
    email: "intake.amir@candidate.local",
    origin: "INTAKE_EXAMPLES_20260927",
    score: 67,
    english: 66,
    axis: [2, 2, 1, 1, 1, 2, 2, 1, 1],
    ready: false,
    overview: "Проверил два материала для крепления датчика в пяти испытаниях. Видна аккуратная фиксация опыта и сравнений; условия за пределами помещения пока не исследованы.",
    quote: "Я сравнил два материала и записал положение датчика после пяти запусков.",
    leadership: "Амир описал сравнение материалов и пять испытаний внутри помещения. Работа конструкции вне этих условий не установлена.",
    file: "The sensor mount stayed in place during five indoor trials; outdoor use was not tested.",
  },
  {
    email: "intake.dana@candidate.local",
    origin: "INTAKE_EXAMPLES_20260927",
    score: 70,
    english: 72,
    axis: [2, 2, 1, 2, 2, 2, 2, 1, 1],
    ready: false,
    overview: "Сохранила две противоречивые записи и исправила дату в статье после разговора с библиотекарем. В заявке прослеживается бережная проверка источников; масштаб инициативы предстоит уточнить.",
    quote: "Я спросила библиотекаря, сохранила обе исходные записи и исправила дату перед публикацией.",
    leadership: "Дана описала проверку двух противоречащих записей и исправление публикации. Масштаб инициативы и роль других участников уточняются отдельно.",
    file: "Both original records were preserved before the library article date was corrected.",
  },
  {
    email: "intake.browser.20260927@candidate.local",
    origin: "INTAKE_BROWSER_20260927",
    score: 63,
    english: 57,
    axis: [2, 2, 1, 1, 1, 2, 2, 1, 1],
    ready: false,
    overview: "Организовала учёт книжного обмена, заметила повторные запросы и разделила их с завершёнными выдачами. Это показывает внимание к результату, но подтверждение исходных записей и личной роли ещё важно получить.",
    quote: "Я сверила записи выдачи и обнаружила, что обращения повторяются.",
    leadership: "Мира описала сверку журнала и разделение запросов и завершённых выдач. Личная ответственность за исходное решение и итоговый результат ещё не подтверждены.",
    file: "Repeated book-exchange requests were separated from completed handoffs.",
  },
  {
    email: "vision.desk.20260925@qa.local",
    origin: "QA",
    score: 76,
    english: 68,
    axis: [2, 2, 2, 2, 2, 2, 2, 2, 1],
    ready: true,
    overview: "Организовала обмен книгами, собрала отзывы и изменила время выдачи. В уточнении отделила свою работу от передачи книг другими участниками; материалы дают основу для разговора о масштабе результата.",
    quote:
      "Организовала обмен книгами в учебной группе: составила таблицу наличия, собрала пять отзывов и изменила время выдачи.",
    leadership:
      "Кандидат организовала обмен, собрала пять отзывов и изменила время выдачи; ответ на уточнение разделяет её работу и выдачу книг другими участниками.",
    file: "Five book-exchange records were checked; other participants handled handoff.",
  },
] as const;

const axisNotes = [
  "Интерес к университету указан кандидатом; уровень требует проверки мотивации.",
  "Связь выбранной программы с личными целями пока проверяется.",
  "Инициатива и пределы личной роли требуют подтверждения по проекту.",
  "Совместные действия и вклад других участников нужно сверить.",
  "Ценности нельзя надёжно вывести из одной истории; нужна предметная проверка.",
  "Описанный проект служит исходным эпизодом; результат проверяется отдельно.",
  "Способ работы с ограничениями и выводами требует дополнительного разбора.",
  "Ориентацию на цель следует обсудить по конкретному решению.",
  "Личный трудный опыт не требуется раскрывать; это значение не является выводом о человеке.",
] as const;

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    process.argv[2] !== "--apply" ||
    process.env.ASSESSMENT_ENVIRONMENT !== "isolated-local" ||
    process.env.SHOWCASE_DATA_DB !== url.pathname.slice(1) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.APP_ORIGIN ?? "http://invalid").hostname,
    )
  )
    throw new Error(
      "Explicit isolated-local showcase database and --apply are required.",
    );
  const staff = await db.user.findUniqueOrThrow({
    where: { email: "admissions@invision.local" },
  });
  if (staff.role !== "STAFF" || staff.origin !== "SEED")
    throw new Error("SHOWCASE_STAFF");
  for (const [index, story] of stories.entries()) {
    const user = await db.user.findUnique({
      where: { email: story.email },
      include: { application: { include: { materials: true, sources: true } } },
    });
    const app = user?.application;
    if (!user || !app) continue;
    if (
      user.origin !== story.origin ||
      app.origin !== story.origin ||
      !app.submittedAt
    )
      throw new Error(`SHOWCASE_SCOPE:${story.email}`);
    const fields = app.fields as { experience?: string };
    if (!fields.experience?.includes(story.quote))
      throw new Error(`SHOWCASE_STORY_CHANGED:${story.email}`);
    if (!user.avatarPhoto && !user.avatarCharacter) {
      await db.user.update({ where: { id: user.id }, data: { avatarCharacter: String(index % 12 + 1) } });
    }
    const submittedFields = app.fields as Record<string, unknown>;
    if (!submittedFields.iin || !submittedFields.phone) {
      await db.application.update({ where: { id: app.id }, data: { fields: json({
        ...submittedFields,
        iin: submittedFields.iin ?? `08${String(index % 12 + 1).padStart(2, "0")}15${String(index % 2 + 5)}${String(index + 41000).padStart(5, "0")}`,
        phone: submittedFields.phone ?? `+7 700 900 ${String(index).padStart(2, "0")} ${String(index + 10).padStart(2, "0")}`,
      }) } });
    }
    const existingLanguage = await db.languageCheck.findUnique({ where: { applicationId: app.id } });
    if (!existingLanguage) {
      await db.languageCheck.create({ data: {
        applicationId: app.id,
        state: json({ comprehension: "", oralId: "", followupId: "", writtenNote: "" }),
        status: "REVIEWED",
        result: `Языковая работа рассмотрена · ${story.english} из 100`,
        reviewerId: staff.id,
        reviewedAt: new Date(),
      } });
    }
    if (!app.materials.length) {
      const lines = ["Submitted project note", story.file];
      const bytes = makePdf(lines);
      await db.material.create({
        data: {
          userId: user.id,
          applicationId: app.id,
          name: "Запись о проекте.pdf",
          mime: "application/pdf",
          size: bytes.length,
          kind: "document",
          bytes,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          sources: {
            create: {
              applicationId: app.id,
              title: "Приложенная запись о проекте",
              kind: "Документ",
              content: lines.join("\n"),
              provenance: "SHOWCASE_PREPARED",
            },
          },
        },
      });
    }
    if (!app.materials.some((material) => material.name === "Материал о проекте.pdf")) {
      const lines = ["Applicant project record", `Record ${index + 1}`, story.file, "The personal role is described in the submitted application."];
      const bytes = makePdf(lines);
      await db.material.create({ data: {
        userId: user.id,
        applicationId: app.id,
        name: "Материал о проекте.pdf",
        mime: "application/pdf",
        size: bytes.length,
        kind: "document",
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sources: { create: {
          applicationId: app.id,
          title: "Материал о проекте",
          kind: "Документ",
          content: story.file,
          provenance: "SHOWCASE_PREPARED",
        } },
      } });
    }
    if (!app.sources.some((source) => source.kind === "Эссе")) {
      const motivation = String(submittedFields.motivation ?? "").trim();
      const experience = String(submittedFields.experience ?? "").trim();
      await db.source.create({ data: {
        applicationId: app.id,
        title: "Эссе о выборе программы",
        kind: "Эссе",
        provenance: "SHOWCASE_PREPARED",
        content: `Я выбираю программу «${app.programSlug}», потому что хочу научиться превращать идеи в проверяемые решения. ${motivation} В своей заявке я описываю опыт, который повлиял на этот выбор: ${experience} Для меня важно отделять собственные действия от работы других участников и не приписывать проекту результат, который ещё не проверен. В университете я хочу продолжить учиться задавать вопросы людям, фиксировать ограничения и улучшать решение после обратной связи.`,
      } });
    }
    const input = await scoringInput(db, app.id);
    const experience = input.sources.find(
      (s) => s.text.includes(story.quote) && s.assessable,
    );
    const motivation = input.sources.find(
      (s) => s.text === input.facts.motivation && s.assessable,
    );
    if (!experience || !motivation)
      throw new Error(`SHOWCASE_SOURCES:${story.email}`);
    const essay = input.sources.find((source) => source.kind === "Эссе" && source.text.trim());
    const result = factualAssessment(input);
    result.state = story.ready ? "READY" : "REQUIRES_REVIEW";
    result.summary = story.overview;
    result.evidence = [
      {
        id: "episode",
        sourceId: experience.id,
        sourceVersion: experience.version,
        quote: story.quote,
        explanation:
          "Фрагмент переданного кандидатом описания одного проекта. Цитата подтверждает содержание рассказа, а не независимую достоверность события.",
      },
      {
        id: "motivation",
        sourceId: motivation.id,
        sourceVersion: motivation.version,
        quote: input.facts.motivation,
        explanation:
          "Заявленная кандидатом мотивация; не доказательство будущего результата.",
      },
      ...(essay ? [{
        id: "essay",
        sourceId: essay.id,
        sourceVersion: essay.version,
        quote: essay.text.slice(0, 180),
        explanation: "В эссе кандидат связывает выбор программы с собственным опытом; стиль текста не доказывает авторство.",
      }] : []),
    ];
    const motivationDomain = result.domains[0];
    motivationDomain.rating = { label: "Есть проявление", value: null };
    motivationDomain.sufficiency = "Частично";
    motivationDomain.evidenceIds = ["motivation"];
    motivationDomain.interpretation =
      "Кандидат объясняет интерес к выбранной программе. Это заявленная мотивация, которую сотрудник может уточнить.";
    const leadership = result.domains[2];
    leadership.rating = story.ready
      ? { label: "Есть проявление", value: null }
      : null;
    leadership.sufficiency = story.ready ? "Частично" : "Недостаточно";
    leadership.evidenceIds = ["episode"];
    leadership.interpretation = story.leadership;
    const experienceDomain = result.domains[5];
    experienceDomain.rating = { label: "Есть проявление", value: null };
    experienceDomain.sufficiency = "Частично";
    experienceDomain.evidenceIds = ["episode"];
    experienceDomain.interpretation =
      "Описано личное действие в одном проекте. Приложенный материал не считается вторым независимым достижением.";
    if (essay) {
      result.domains[6].evidenceIds = ["essay", "episode"];
      result.domains[6].interpretation = `Эссе связывает обучение с описанным проектом. ${story.overview}`;
    }
    result.questions = [
      {
        id: "leadership-episode",
        section: "action",
        sourceId: experience.id,
        domain: domains[2],
        gap: story.leadership,
        text: "Какое решение в этом эпизоде вы приняли лично и по какому материалу можно проверить его результат?",
      },
    ];
    result.recommendation = {
      action:
        app.stage === "INTERVIEW"
          ? "INTERVIEW"
          : app.stage === "CLARIFICATION"
            ? "CLARIFICATION"
            : app.stage === "LANGUAGE"
              ? "LANGUAGE"
              : "CHECK",
      reason: story.leadership,
      sourceIds: [experience.id],
    };
    result.feedback = {
      observation: story.leadership,
      suggestion:
        "Уточнить собственное действие и пределы вывода по этому проекту.",
      nextAction: "Открыть переданный материал и обсудить конкретный эпизод.",
      sourceIds: [experience.id],
    };
    validateScoringResult(result, input);
    const inputHash = digest(input);
    const scenarioVersion = "showcase-scoring-v1";
    const showcaseAxis = domains.map((criterionId, domainIndex) => ({
      criterionId,
      value: story.axis[domainIndex],
      scaleVersion: "prepared-axis-v1",
      basis: `${axisNotes[domainIndex]} ${domainIndex < 2 ? `Из заявления: ${input.facts.motivation.slice(0, 170)}` : domainIndex === 2 || domainIndex === 5 || domainIndex === 6 ? story.leadership : `Из описанного опыта: ${story.quote}`}`,
      evidenceIds: domainIndex < 2 ? ["motivation"] : ["episode"],
    }));
    await db.scoringFixture.upsert({
      where: { applicationId_inputHash: { applicationId: app.id, inputHash } },
      create: {
        applicationId: app.id,
        inputHash,
        scenarioVersion,
        result: json(result),
      },
      update: { result: json(result) },
    });
    const identity = digest({
      applicationId: app.id,
      inputHash,
      provider: "local",
      scenarioVersion,
    });
    const existingRun = await db.scoringRun.findUnique({ where: { identity }, include: { reviews: { select: { id: true }, take: 1 } } });
    await db.scoringRun.upsert({
      where: { identity },
      create: {
        applicationId: app.id,
        identity,
        inputHash,
        materialVersion: input.materialVersion,
        criteriaVersion: input.criteria.version,
        provider: "local",
        scenarioVersion,
        input: json(input),
        result: json(result),
        status: "COMPLETED",
        requestedBy: staff.id,
        completedAt: new Date(),
        showcaseScore: story.score,
        showcaseEnglishScore: story.english,
        showcaseEssaySignal: essay ? [19, 34, 22, 41, 17, 29, 36, 24, 31, 43, 26, 38, 21, 33, 28, 25, 23][index] : null,
        showcaseEssaySourceId: essay?.id,
        showcaseScoreBasis: story.leadership,
        showcaseScoreEvidenceIds: ["episode"],
        showcaseAxis: json(showcaseAxis),
      },
      update: {
        ...(existingRun?.reviews?.length ? {} : { result: json(result) }),
        showcaseAxis: json(showcaseAxis),
        showcaseScore: existingRun?.showcaseScore ?? story.score,
        showcaseEnglishScore: existingRun?.showcaseEnglishScore ?? story.english,
        showcaseEssaySignal: essay ? [19, 34, 22, 41, 17, 29, 36, 24, 31, 43, 26, 38, 21, 33, 28, 25, 23][index] : null,
        showcaseEssaySourceId: essay?.id,
        showcaseScoreBasis: existingRun?.showcaseScoreBasis ?? story.leadership,
        showcaseScoreEvidenceIds: existingRun?.showcaseScoreEvidenceIds ?? ["episode"],
      },
    });
    console.log(`${story.email}: ${story.score}/100, ${app.stage}`);
  }
}
main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
