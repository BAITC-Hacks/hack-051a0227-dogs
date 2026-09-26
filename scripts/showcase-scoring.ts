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
    ready: false,
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
    ready: false,
    quote: "Я собрал датчик влажности вместе с учителем физики.",
    leadership:
      "Сборка и недельная проверка описаны, но выбор порога срабатывания и распределение решений в команде пока не установлены.",
    file: "Sensor readings were compared with manual measurements for one week.",
  },
  {
    email: "sofia@candidate.local",
    origin: "SEED",
    score: 72,
    ready: true,
    quote: "После замечания библиотекаря исправила неверную дату открытия.",
    leadership:
      "Кандидат описала принятие замечания и исправление публикации; согласие участников на использование записей требует проверки.",
    file: "The opening date was corrected after the librarian's comment.",
  },
  {
    email: "alikhan@candidate.local",
    origin: "SEED",
    score: 61,
    ready: false,
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
    ready: false,
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
    ready: true,
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
    ready: false,
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
    ready: true,
    quote: "Я сравнил два крепления и записал, какое было удобнее собирать.",
    leadership:
      "Кандидат сравнил варианты сборки и оформил инструкцию; безопасность стойки по нагрузке не подтверждена.",
    file: "Two plywood joints were compared; maximum load was not measured.",
  },
  {
    email: "zhanel@candidate.local",
    origin: "SEED",
    score: 63,
    ready: false,
    quote: "Вместо общей рекомендации описала три разных потребности.",
    leadership:
      "Кандидат изменила вывод после разных ответов семи знакомых; эта группа не представляет всех жителей.",
    file: "Seven acquaintances described different reading-place needs.",
  },
  {
    email: "emir@candidate.local",
    origin: "SEED",
    score: 60,
    ready: false,
    quote: "Я подготовил сравнительную таблицу запросов.",
    leadership:
      "Кандидат подготовил основу для обсуждения ограниченного бюджета; число поддержавших каждый вариант не зафиксировано.",
    file: "Requests for shade, benches and sports equipment were compared.",
  },
  {
    email: "alina@candidate.local",
    origin: "SEED",
    score: 69,
    ready: false,
    quote: "После наблюдения изменила названия двух разделов.",
    leadership:
      "Кандидат организовала проверку навигации с четырьмя посетителями и пересмотрела решение; общий эффект за пределами этой группы не установлен.",
    file: "Four visitors tried the navigation; two section names were changed.",
  },
  {
    email: "ruslan@candidate.local",
    origin: "SEED",
    score: 43,
    ready: false,
    quote:
      "После сбоя проводки нашёл ошибку соединения с помощью руководителя кружка.",
    leadership:
      "Поиск ошибки с помощью руководителя описан; самостоятельное ведение команды или независимая проверка решения не подтверждены.",
    file: "The wiring fault was found with help from the club supervisor.",
  },
  {
    email: "vision.desk.20260925@qa.local",
    origin: "QA",
    score: 76,
    ready: true,
    quote:
      "Организовала обмен книгами в учебной группе: составила таблицу наличия, собрала пять отзывов и изменила время выдачи.",
    leadership:
      "Кандидат организовала обмен, собрала пять отзывов и изменила время выдачи; ответ на уточнение разделяет её работу и выдачу книг другими участниками.",
    file: "Five book-exchange records were checked; other participants handled handoff.",
  },
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
  for (const story of stories) {
    const user = await db.user.findUnique({
      where: { email: story.email },
      include: { application: { include: { materials: true } } },
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
    const input = await scoringInput(db, app.id);
    const experience = input.sources.find(
      (s) => s.text.includes(story.quote) && s.assessable,
    );
    const motivation = input.sources.find(
      (s) => s.text === input.facts.motivation && s.assessable,
    );
    if (!experience || !motivation)
      throw new Error(`SHOWCASE_SOURCES:${story.email}`);
    const result = factualAssessment(input);
    result.state = story.ready ? "READY" : "REQUIRES_REVIEW";
    result.summary = `В переданной истории описано конкретное действие: «${story.quote}» Это сообщение кандидата; результат и личную роль нужно сверить с материалами и вопросами рассмотрения.`;
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
    await db.scoringFixture.upsert({
      where: { applicationId_inputHash: { applicationId: app.id, inputHash } },
      create: {
        applicationId: app.id,
        inputHash,
        scenarioVersion,
        result: json(result),
      },
      update: {},
    });
    const identity = digest({
      applicationId: app.id,
      inputHash,
      provider: "local",
      scenarioVersion,
    });
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
        showcaseScoreBasis: story.leadership,
        showcaseScoreEvidenceIds: ["episode"],
      },
      update: {},
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
