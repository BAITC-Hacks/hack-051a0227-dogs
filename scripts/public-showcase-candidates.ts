import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security";
import { emptyFields } from "../src/lib/validation";
import { emptyIntake, routeFor } from "../src/lib/intake-contract";
import { intakeRules } from "../src/lib/intake.server";
import { scoringInput, digest } from "../src/lib/scoring-input.server";
import { factualAssessment } from "../src/lib/scoring-provider.server";
import { validateScoringResult } from "../src/lib/scoring-contract";
import { domains } from "../src/lib/catalog";
import { makePdf } from "../prisma/seed-materials";

/** Explicit, additive fictional records for the public presentation. Never called at startup. */
const origin = "SHOWCASE_PUBLIC_20260930";
const stories = [
  {
    alias: "mira", name: "Мира Сарсенова", avatar: "1", city: "Бишкек", citizenship: "Кыргызстан", school: "Школа № 13, Бишкек", program: "digital-products", stage: "INTERVIEW", gpa: "4.7", exam: null, english: ["IELTS", "6.5", "0", "9", "2026-05-16"] as const, score: 78, englishScore: 76, axis: [2, 2, 1, 2, 2, 2, 2, 1, 1],
    experience: "В выпускном классе я собирала группу для совместной подготовки к математике и информатике. Первые встречи превращались в разбор самых сложных задач, и ребята с разным уровнем подготовки перестали приходить. Я спросила, какие темы каждому нужны, разделила встречи на два уровня и сама вела разбор базовых задач раз в неделю.",
    role: "Я собрала группу, опросила участников, изменила формат встреч и вела базовый разбор; сложные задачи объяснял другой ученик.",
    motivation: "Мне нравится математика, но я не хочу ограничиваться только кодом. На вводном курсе по цифровым продуктам я увидела, что хорошее решение начинается с понимания человека и его задачи. Хочу в inVision U научиться сочетать аналитику, интерфейсы и разговор с пользователями.",
    essay: "После неудачи на городской олимпиаде по информатике я решила, что просто недостаточно способна. Учитель предложил разобрать мои решения: я знала формулы, но часто не дочитывала условие и сразу писала код. Я стала сначала объяснять задачу словами и проверять решение на маленьком примере. Это не превратило меня в победителя за месяц, зато вернуло интерес к учёбе. Сейчас я лучше понимаю, зачем мне университет, где техническую идею учат проверять вместе с людьми.",
    result: "После изменения формата встречи продолжились до конца учебного года; уровень подготовки участников оставался разным.",
  },
  {
    alias: "dana", name: "Дана Нурланова", avatar: "3", city: "Алматы", citizenship: "Казахстан", school: "Лицей № 134, Алматы", program: "digital-media", stage: "REVIEW", gpa: "4.8", exam: 112, english: ["IELTS", "6.0", "0", "9", "2026-04-22"] as const, score: 74, englishScore: 72, axis: [2, 2, 1, 2, 2, 2, 2, 1, 1],
    experience: "Я писала для школьного медиа истории выпускников о выборе университета. В одной заметке я сократила цитату так, что смысл ответа изменился. Героиня заметила это при согласовании. Я вернулась к записи разговора, восстановила контекст и переписала абзац до публикации.",
    role: "Я проводила интервью, расшифровывала запись и сама исправила неточную цитату после замечания героини.",
    motivation: "Я хочу изучать цифровые медиа, потому что мне интересны интервью, монтаж и то, как одна форма меняет восприятие истории. В inVision U хочу научиться работать с героями уважительно и проверять смысл материала до публикации.",
    essay: "Раньше я думала, что при редактировании главное — сделать текст короче и выразительнее. Когда героиня школьной заметки увидела свою цитату, она сказала, что я убрала важное «пока не решила» и превратила сомнение в уверенное решение. Я переслушала запись, извинилась и вернула эту оговорку. Теперь я спрашиваю себя, не меняет ли хороший заголовок чужую мысль. Ошибка заставила меня серьёзнее относиться к ответственности автора.",
    result: "Неточная цитата исправлена до публикации; героиня согласовала итоговый абзац.",
  },
  {
    alias: "amir", name: "Амир Талгатов", avatar: "2", city: "Шымкент", citizenship: "Казахстан", school: "Лицей № 9, Шымкент", program: "creative-engineering", stage: "CHECK", gpa: "4.5", exam: 105, english: ["TOEFL iBT", "78", "0", "120", "2026-03-18"] as const, score: 68, englishScore: 69, axis: [1, 2, 1, 2, 1, 2, 2, 1, 1],
    experience: "На районной олимпиаде по физике я выполнял лабораторный тур в паре. Наши измерения напряжения не совпали с расчётом. Я хотел отбросить первое значение, но напарница предложила проверить предел измерения прибора. Мы нашли неверный режим и повторили серию измерений.",
    role: "Я записывал показания и пересчитывал результат; напарница заметила настройку прибора, а исправление мы сделали вместе.",
    motivation: "Я выбираю креативную инженерию, потому что мне нравится физика там, где расчёт встречается с реальным измерением. Хочу глубже изучить электронику и научиться проверять гипотезы аккуратно, а не подгонять данные под ожидаемый ответ.",
    essay: "В лабораторном туре я впервые увидел, как легко убедить себя, что неудобное измерение просто ошибочное. Мы с напарницей получили число, которое не подходило к расчёту. Я предложил его вычеркнуть, но она попросила сначала проверить прибор. Оказалось, что мы выбрали не тот предел измерения. После повторной серии результат стал ближе к расчёту. Для меня главным было не место на олимпиаде, а привычка искать причину расхождения до того, как исправлять таблицу.",
    result: "После проверки режима прибора пара повторила измерения и объяснила расхождение в протоколе лабораторного тура.",
  },
  {
    alias: "leya", name: "Лея Соколова", avatar: "5", city: "Алматы", citizenship: "Казахстан", school: "Гимназия № 25, Алматы", program: "sociology", stage: "FINAL_REVIEW", gpa: "4.6", exam: 101, english: ["IELTS", "6.5", "0", "9", "2026-06-02"] as const, score: 72, englishScore: 75, axis: [2, 2, 1, 2, 2, 2, 2, 1, 1],
    experience: "Я волонтёрила в городском молодёжном центре и помогала записывать школьников на бесплатные занятия. Мы считали, что ребята не приходят из-за неудобного расписания. Я поговорила с шестью участниками, которые пропускали встречи: двое говорили о времени, остальные — о дороге и стоимости проезда.",
    role: "Я предложила поговорить с теми, кто пропускал занятия, задала вопросы шести участникам и отдельно записала причины.",
    motivation: "Социология привлекает меня тем, что за общей цифрой всегда стоят разные обстоятельства людей. В inVision U я хочу научиться строить исследование, выбирать собеседников и не выдавать несколько разговоров за мнение целого города.",
    essay: "Когда на занятие пришло меньше половины записавшихся, я сразу повторила привычное объяснение: всем неудобно время. Разговоры с шестью ребятами показали другую картину. Дорога до центра для некоторых была дороже, чем мы думали, а один ученик не знал, как добраться после школы. Я рассказала об этом координатору, но не стала утверждать, что нашла причину для всех. Этот случай научил меня задавать вопрос прежде, чем предлагать готовый ответ.",
    result: "Координатор получил раздельные причины пропусков; вывод ограничен шестью разговорами.",
  },
  {
    alias: "alina", name: "Алина Юн", avatar: "9", city: "Усть-Каменогорск", citizenship: "Казахстан", school: "Школа-лицей № 11, Усть-Каменогорск", program: "digital-products", stage: "REVIEW", gpa: "4.9", exam: 119, english: ["Duolingo", "115", "10", "160", "2026-05-09"] as const, score: 81, englishScore: 80, axis: [2, 2, 2, 2, 2, 2, 2, 1, 1],
    experience: "Я прошла летнюю школу по математике и цифровому дизайну. На групповом разборе мы объясняли первокурсникам, как выбрать элективы. Я написала инструкцию из длинных правил, но участники всё равно спрашивали одно и то же. Я сократила её до трёх решений и проверила новую версию на другой группе.",
    role: "Я написала первую инструкцию, записала повторяющиеся вопросы и переработала текст; выбор элективов объясняли также два наставника.",
    motivation: "В цифровых продуктах меня интересует не только интерфейс, но и момент, когда человек впервые пытается разобраться в сложном выборе. Хочу научиться проводить исследования и делать понятные сервисы вместе с дизайнерами и разработчиками.",
    essay: "На летней школе я гордилась инструкцией, которую написала для новых участников: в ней было всё, что я знала. Но люди продолжали спрашивать, с чего начать выбор элективов. Я стала слушать их вопросы и поняла, что подробность мешает первому шагу. Мы оставили три понятных решения и ссылку на полные правила. Новая группа реже терялась в начале, хотя я не измеряла это системно. Мне стало интересно, как проверять подобные изменения честнее.",
    result: "После сокращения инструкции новая группа быстрее находила первый шаг; количественной проверки не проводилось.",
  },
  {
    alias: "ruslan", name: "Руслан Абдиев", avatar: "8", city: "Актау", citizenship: "Казахстан", school: "Школа № 17, Актау", program: "creative-engineering", stage: "LANGUAGE", gpa: "4.3", exam: 87, english: ["IELTS", "6.0", "0", "9", "2026-02-11"] as const, score: 59, englishScore: 63, axis: [1, 2, 1, 1, 1, 2, 1, 1, 1],
    experience: "По выходным я помогал родственнику в мастерской бытовой техники: записывал неисправности и под наблюдением проверял простые электрические цепи. Однажды я решил, что у чайника сломан нагреватель, но мастер попросил проверить контакт и провод. Причина оказалась в разъёме.",
    role: "Я записал симптомы и проверил цепь под наблюдением; окончательный диагноз и ремонт выполнил мастер.",
    motivation: "Я хочу изучать инженерию, потому что мне интересно понимать, почему устройство работает или ломается, а не просто заменять деталь наугад. В университете хочу освоить физику, схемотехнику и безопасную практику измерений.",
    essay: "В мастерской я однажды слишком быстро назвал причину поломки чайника. Мне казалось очевидным, что проблема в нагревателе. Мастер попросил сначала пройти всю цепь и измерить контакт. Нагреватель оказался исправен. Мне было неловко, зато я увидел разницу между догадкой и проверкой. Теперь, когда помогаю в мастерской, записываю сначала симптомы и измерения, а вывод делаю позже. Хочу учиться этому системно.",
    result: "Причина неисправности обнаружена в разъёме; ремонт выполнил мастер после проверки цепи.",
  },
] as const;

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const sentence = (value: string, index = 0) => value.match(/[^.!?]+[.!?]?/gu)?.map((part) => part.trim()).filter(Boolean)[index] ?? value.trim();
const db = new PrismaClient();
async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  const site = new URL(process.env.APP_ORIGIN ?? "http://invalid");
  if (process.argv[2] !== "--apply" ||
      process.env.PUBLIC_SHOWCASE_DATABASE !== database.pathname.slice(1) ||
      process.env.PUBLIC_SHOWCASE_ORIGIN !== site.origin ||
      !(site.hostname === "dogs.govtech-kz.com" && site.protocol === "https:" ||
        ["127.0.0.1", "localhost"].includes(site.hostname)))
    throw new Error("Explicit database and origin confirmation required for showcase records.");
  const staff = await db.user.findFirst({ where: { role: "STAFF" }, orderBy: { createdAt: "asc" } });
  if (!staff) throw new Error("Verified staff account is required.");
  const rules = await intakeRules();
  for (const [index, story] of stories.entries()) {
    const email = `${story.alias}.showcase@invision.invalid`;
    const existing = await db.user.findUnique({ where: { email }, include: { application: true } });
    if (existing) {
      if (existing.origin !== origin || existing.application?.origin !== origin) throw new Error(`Existing account is not a showcase fixture: ${email}`);
      console.log(`Preserved ${story.name}`);
      continue;
    }
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: {
        name: story.name, email, role: "CANDIDATE", origin,
        avatarCharacter: story.avatar, passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        interests: [story.program],
      } });
      const date = new Date(Date.UTC(2026, 8, 26 + index % 3, 7 + index, 15));
      const route = routeFor(rules, "BACHELOR", story.program);
      const intake = structuredClone(emptyIntake);
      intake.entryType = "BACHELOR";
      intake.intake = rules.intake;
      intake.phone = `+7 700 8${String(index + 12).padStart(2, "0")} ${String(10 + index).padStart(2, "0")} ${String(20 + index).padStart(2, "0")}`;
      intake.education = { institution: story.school, system: "Среднее образование", graduationYear: "2026", status: "COMPLETED", materialId: "" };
      intake.gpa = { state: "PROVIDED", value: story.gpa, min: "0", max: "5", scaleType: "Пятибалльная шкала", period: "2024–2026", weighted: "NO", originalGrades: "", materialId: "" };
      intake.universityReason = story.motivation;
      intake.goals = "Освоить исследование, совместную работу и проверку решений на реальных задачах университета.";
      intake.experienceTitle = "Личный опыт перед поступлением";
      intake.experiencePeriod = "2025–2026";
      intake.experienceResult = story.result;
      intake.essay = { questionId: route.essay.id, questionVersion: route.essay.version, language: "ru", text: story.essay, materialId: "" };
      intake.english = { method: "CERTIFICATE", certificate: { type: story.english[0], value: story.english[1], scaleMin: story.english[2], scaleMax: story.english[3], date: story.english[4], period: "2026", materialId: "" } };
      const fields = { ...emptyFields, name: story.name, email, city: story.city, citizenship: story.citizenship,
        experience: story.experience, personalRole: story.role, motivation: story.motivation, processing: true,
        documentNote: "Документы и исходные результаты приложены к заявке.", intake };
      const app = await tx.application.create({ data: { userId: user.id, programSlug: story.program, fields: json(fields),
        stage: story.stage, origin, revision: 1, submittedAt: date, createdAt: date, intakeRules: json(rules), formSection: 5 } });
      const files: string[] = [];
      const addFile = async (purpose: string, name: string, lines: string[]) => {
        const bytes = makePdf(lines), material = await tx.material.create({ data: {
          userId: user.id, applicationId: app.id, name, kind: "document", purpose, section: "education",
          mime: "application/pdf", bytes, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
          extractedText: lines.join("\n"),
        } });
        files.push(material.id);
        return material.id;
      };
      intake.education.materialId = await addFile("EDUCATION", "Аттестат и справка об обучении.pdf", ["Academic record submitted by applicant", story.name, story.school, "Graduation: 2026"]);
      intake.gpa.materialId = await addFile("GRADES", "Выписка оценок.pdf", ["Original school average", story.name, `${story.gpa} / 5 for 2024-2026`, "Submitted for staff verification"]);
      if (story.exam !== null) {
        const materialId = await addFile("EXAM", "Сертификат ЕНТ.pdf", ["UNT examination result submitted by applicant", story.name, `${story.exam} / 140`, "Year: 2026", "Staff verification pending"]);
        intake.exams.push({ type: "ЕНТ", value: String(story.exam), scaleMin: "0", scaleMax: "140", date: "2026-06-22", period: "2026", materialId });
      }
      intake.english.certificate.materialId = await addFile("LANGUAGE", `${story.english[0]} · результат.pdf`, ["English certificate result submitted by applicant", story.name, `${story.english[0]}: ${story.english[1]} / ${story.english[3]}`, `Date: ${story.english[4]}`, "Staff verification pending"]);
      await addFile("IDENTITY", "Документ личности.pdf", ["Identity summary submitted by applicant", story.name, `Citizenship: ${story.citizenship}`, "Administrative review only"]);
      const complete = { ...fields, intake };
      await tx.application.update({ where: { id: app.id }, data: { fields: json(complete) } });
      await tx.applicationVersion.create({ data: { applicationId: app.id, revision: 1, kind: "SUBMITTED", snapshot: json({ fields: complete, programSlug: story.program, intakeRules: rules, materialIds: files, origin }) } });
      const storyEpisode = await tx.episode.create({ data: { applicationId: app.id, title: "Личный опыт перед поступлением", personalRole: story.role } });
      await tx.source.createMany({ data: [
        { applicationId: app.id, episodeId: storyEpisode.id, title: "Опыт и личная роль", kind: "Анкета", content: `${story.experience}\n\nЛичная роль: ${story.role}`, provenance: origin },
        { applicationId: app.id, title: "Мотивация", kind: "Анкета", content: story.motivation, provenance: origin },
        { applicationId: app.id, title: "Программа, цели и действия", kind: "Анкета", content: `${story.program}. ${intake.goals} ${story.result}`, provenance: origin },
        { applicationId: app.id, title: "Эссе · ответ", kind: "Эссе", content: story.essay, provenance: origin },
      ] });
      await tx.languageCheck.create({ data: { applicationId: app.id, state: json({ certificate: intake.english.certificate }), status: "PENDING_REVIEW", result: `${story.english[0]} ${story.english[1]} — документ кандидата, проверка сотрудником ожидается`, revision: 1 } });
      if (story.stage === "INTERVIEW") await tx.interview.create({ data: { applicationId: app.id,
        scheduledAt: new Date("2026-10-03T10:00:00Z"), timezone: "Asia/Almaty", durationMinutes: 30,
        status: "SCHEDULED", calendarStatus: "MANUAL", invitationPublishedAt: date,
        attendees: json({ interviewers: [{ id: staff.id }], recipients: [] }), notes: json({ observation: "Обсудить личную роль и источники результата." }) } });
      const input = await scoringInput(tx, app.id);
    const episode = input.sources.find((source) => source.title === "Опыт и личная роль" && source.assessable);
    const motivation = input.sources.find((source) => source.title === "Мотивация" && source.assessable);
    const essaySource = input.sources.find((source) => source.title === "Эссе · ответ" && source.assessable);
    const outcome = input.sources.find((source) => source.title === "Программа, цели и действия" && source.assessable);
    if (!episode || !motivation || !essaySource || !outcome) throw new Error(`Missing sources for ${story.name}`);
    const result = factualAssessment(input);
    result.summary = `${sentence(story.motivation)} ${sentence(story.experience)} ${sentence(story.role)} Заявленный результат и подтверждающие материалы требуют проверки комиссии.`;
    result.evidence = [
      { id: "experience", sourceId: episode.id, sourceVersion: episode.version, quote: episode.text.slice(0, 180), explanation: "Фрагмент сохранённой заявки кандидата." },
      { id: "motivation", sourceId: motivation.id, sourceVersion: motivation.version, quote: motivation.text.slice(0, 180), explanation: "Заявленная мотивация кандидата." },
      { id: "essay", sourceId: essaySource.id, sourceVersion: essaySource.version, quote: essaySource.text.slice(0, 180), explanation: "Эссе кандидата о пересмотренном решении." },
      { id: "outcome", sourceId: outcome.id, sourceVersion: outcome.version, quote: story.result, explanation: "Заявленный результат, сохранённый в заявке." },
    ];
    result.domains[0].evidenceIds = ["motivation"];
    result.domains[0].interpretation = "Кандидат связал выбор университета с собственным опытом и дальнейшими целями.";
    result.domains[5].evidenceIds = ["experience"];
    result.domains[5].interpretation = `Описано конкретное действие: ${story.role}`;
    validateScoringResult(result, input);
    const axisBases = [
      [`Выбор университета: ${sentence(story.motivation)}`, "motivation"],
      [`Связь с программой: ${sentence(story.motivation, 1)}`, "motivation"],
      [`Личная инициатива: ${sentence(story.role)}`, "experience"],
      [`Работа с другими: ${sentence(story.experience)}`, "experience"],
      [`Пересмотр после нового факта: ${sentence(story.essay)}`, "essay"],
      [`Конкретное действие: ${sentence(story.role)}`, "experience"],
      [`Вывод из опыта: ${sentence(story.essay, 1)}`, "essay"],
      [`Цель развития: ${sentence(story.motivation, 1)}`, "motivation"],
      [`Граница результата: ${sentence(story.result)}`, "outcome"],
    ] as const;
    const axis = domains.map((criterionId, i) => ({ criterionId, value: story.axis[i], scaleVersion: "prepared-axis-v1",
      basis: axisBases[i][0], evidenceIds: [axisBases[i][1]] }));
    await tx.scoringRun.create({ data: { applicationId: app.id, identity: `public-showcase:${story.alias}:v1`, inputHash: digest(input),
      materialVersion: input.materialVersion, criteriaVersion: input.criteria.version, provider: "local", scenarioVersion: "showcase-scoring-v1",
      input: json(input), result: json(result), status: "COMPLETED", requestedBy: staff.id, completedAt: new Date(),
      showcaseScore: story.score, showcaseScoreBasis: "Подготовленная предварительная оценка по материалам вымышленной заявки; требует человеческой проверки.",
      showcaseScoreEvidenceIds: ["experience", "motivation"], showcaseEnglishScore: story.englishScore, showcaseAxis: json(axis) } });
      return app.id;
    }).then((applicationId) => console.log(`Created ${story.name}: ${applicationId}`));
  }
}
main().finally(() => db.$disconnect());
