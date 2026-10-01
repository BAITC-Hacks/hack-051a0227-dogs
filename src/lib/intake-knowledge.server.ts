import "server-only";
import type { ApplicationFields } from "./types";
import type { User } from "@prisma/client";
import { db } from "./db";
import { intakeRules } from "./intake.server";
import {
  emptyIntake,
  entSubjectPair,
  ruleSchema,
  routeFor,
  preflight,
} from "./intake-contract";
import { fieldsSchema, emptyFields } from "./validation";
export async function intakeKnowledge(user: User) {
  if (!["CANDIDATE", "GUEST"].includes(user.role)) return [];
  const app = await db.application.findUnique({
    where: { userId: user.id },
    include: {
      materials: { select: { id: true, kind: true, purpose: true } },
      language: { select: { status: true } },
      interviews: {
        where: { invitationPublishedAt: { not: null } },
        orderBy: { scheduledAt: "desc" },
        take: 1,
      },
      messages: {
        where: { kind: { in: ["INTERVIEW", "CLARIFICATION", "FEEDBACK"] } },
        select: { id: true },
      },
    },
  });
  const parsed = fieldsSchema.safeParse(app?.fields),
    fields: ApplicationFields = parsed.success ? parsed.data : emptyFields,
    v = fields.intake ?? emptyIntake;
  const frozen = ruleSchema.safeParse(app?.intakeRules),
    rules =
      app?.submittedAt && frozen.success ? frozen.data : await intakeRules(),
    r = routeFor(rules, v.entryType, app?.programSlug ?? "digital-products");
  const docs = r.documents
    .filter(
      (d) =>
        d.required &&
        (d.applies === "ALL" ||
          /^(казахстан|kazakhstan|kz)$/iu.test(fields.citizenship)),
    )
    .map((d) => d.label);
  const issues =
    app && !app.submittedAt
      ? preflight(
          fields,
          app.materials,
          rules,
          app.programSlug,
          app.language?.status,
        ).filter((i) => i.group === "BLOCK")
      : [];
  const remaining = issues.length
    ? `Нужно исправить ${issues.length}: ${issues.map((issue) => issue.text).join(" ")}`
    : "Можно открыть обзор и подтвердить отправку.";
  const records = [
    {
      key: "admissions:rules",
      title: "Правила заявки и набор " + rules.intake,
      text: `${v.entryType === "FOUNDATION" ? "Foundation" : "Бакалавриат"}, набор ${rules.intake}. ${docs.length ? "Документы по условиям набора: " + docs.join("; ") + "." : "Отдельные обязательные документы не установлены этой конфигурацией."} ${r.videoRequired ? "В этой заявке нужна видеопрезентация." : ""} ${r.gpaRequired ? "В этой заявке укажи исходный GPA либо оценки, если твоя система не использует GPA." : "GPA можно указать по желанию."} ${r.essay.required ? "Письменное эссе необходимо для этой заявки." : "Эссе можно добавить по желанию."} ${r.language.required ? "Английский подтверди сертификатом или ответами в приложении." : "Способ проверки английского можно уточнить."} Эти поля заявки не устанавливают новый университетский порог. Источник сведений о наборе проверен ${rules.checkedAt}; версия ${rules.version}. Сроки будущего набора здесь не подтверждены.`,
      href: r.source,
    },
    {
      key: "admissions:gpa",
      title: "Как указать GPA",
      text: "Открой «Образование и результаты». Укажи исходный средний балл, минимум и максимум шкалы, её тип, период и взвешенность. Шкалы не объединяются. Если GPA не используется, выбери «В моей системе нет GPA» и добавь исходные оценки или табель. Отсутствующий результат не равен нулю.",
      href: "/apply?section=1&field=gpa-state",
    },
    {
      key: "admissions:exams",
      title: "Экзамены и исходная шкала",
      text: `Открой «Образование и результаты». ЕНТ для бакалавриата граждан Казахстана: минимум 80 из 140 баллов; профильные предметы выбранной программы — ${entSubjectPair[app?.programSlug ?? "digital-products"] ?? "уточняются у комиссии"}. Укажи результат и дату, затем приложи «Сертификат ЕНТ» в документах. Если ЕНТ ещё не сдавал, можно отдельно добавить SAT (400–1600), ACT (1–36) или IB Diploma (0–45). Эти дополнительные результаты не заменяют ЕНТ без индивидуального решения приёмной комиссии. ${r.exams
        .filter((exam) => exam.required)
        .map(
          (exam) =>
            `${exam.type} применяется к ${exam.applies === "KZ" ? "кандидатам с гражданством Казахстана" : "этому маршруту"}.`,
        )
        .join(" ")}`,
      href: "/apply?section=1&field=exams",
    },
    {
      key: "admissions:english",
      title: "Подтверждение английского",
      text: "Открой «Проверки». Выбери языковой сертификат или ответы в приложении. Для сертификата укажи тип, результат, границы исходной шкалы и дату и прикрепи файл прямо в разделе английского. Результат и документ проверит сотрудник.",
      href: "/apply?section=4&field=certificate",
    },
    {
      key: "admissions:essay",
      title: "Где добавить эссе",
      text: `Открой «Программа и опыт», затем «Эссе». Вопрос ${r.essay.version}: ${r.essay.question} Сохраняется оригинал текста и версия ответа. ${r.essay.required ? "Ответ обязателен по правилам набора." : "Это дополнительный ответ по желанию."} ${r.essay.minWords === null && r.essay.maxWords === null ? "Ограничение числа слов не установлено." : `Объём: от ${r.essay.minWords ?? 0} до ${r.essay.maxWords ?? "неограниченного числа"} слов.`}`,
      href: "/apply?section=2&field=essay",
    },
    {
      key: "admissions:status",
      title: "Состояние твоей заявки",
      text: app?.submittedAt
        ? `Заявка отправлена ${app.submittedAt.toISOString()}. Отправленная версия зафиксирована. Материалов: ${app.materials.length}. Новые документы можно передать отдельно. Опубликованные сообщения и приглашения доступны в разделе заявки.`
        : app
          ? `Сохранён черновик версии ${app.revision}. ${remaining}`
          : "Заявка пока не сохранена. Начни с раздела «О себе». Мастерские и поинты не обязательны для подачи.",
      href: app?.submittedAt
        ? "/apply/status"
        : issues[0]
          ? `/apply?section=${issues[0].section}&field=${encodeURIComponent(issues[0].field)}`
          : "/apply?section=5",
    },
    {
      key: "admissions:interview",
      title: "Приглашение на интервью",
      text: app?.interviews[0]
        ? `Опубликованная встреча: ${new Intl.DateTimeFormat("ru", { dateStyle: "long", timeStyle: "short", timeZone: app.interviews[0].timezone }).format(app.interviews[0].scheduledAt)} (${app.interviews[0].timezone}). ${app.interviews[0].status === "CANCELLED" ? "Встреча отменена." : "Открой подтверждённую ссылку в разделе заявки."}`
        : "Опубликованного приглашения пока нет. Когда комиссия назначит и опубликует встречу, время и подтверждённая ссылка появятся в заявке.",
      href: "/apply/status",
    },
    {
      key: "admissions:unknown",
      title: "Уточнить условия у комиссии",
      text: "В подтверждённых сведениях нет ответа о будущих сроках, индивидуальном освобождении, гранте или гарантии поступления. Передай конкретный вопрос сотруднику через сообщения заявки. До отправки заявки контакт университета доступен на официальном сайте.",
      href: app?.submittedAt
        ? "/apply/status#messages"
        : "https://www.invisionu.education/ru/undergraduate",
    },
  ];
  return records;
}
export function intakeQuestionKey(question: string) {
  if (/экзамен|(?<!\p{L})ент(?!\p{L})|(?<!\p{L})(sat|act|ib)(?!\p{L})/iu.test(question)) return "admissions:exams";
  if (/английск|сертификат|языков/iu.test(question))
    return "admissions:english";
  if (/gpa|средн.{0,4}балл|шкал|оценк.{0,8}школ/iu.test(question))
    return "admissions:gpa";
  if (/эссе|essay/iu.test(question)) return "admissions:essay";
  if (/дедлайн|срок.{0,8}пода|грант|освобожд|гарант/iu.test(question))
    return "admissions:unknown";
  if (/документ|требован|правил.{0,8}поступ/iu.test(question))
    return "admissions:rules";
  if (
    /не отправ|отправить заявк|подать заявк|почему.*кнопк|что.*исправ/iu.test(
      question,
    )
  )
    return "admissions:status";
  if (
    /ссылк.{0,15}(интервью|встреч)|назначен.{0,10}интервью|когда.{0,12}интервью/iu.test(
      question,
    )
  )
    return "admissions:interview";
  if (
    /статус|уже отправ|остал.{0,10}(сделать|заяв)|что.{0,15}заявк|состояни.{0,10}заяв/iu.test(
      question,
    )
  )
    return "admissions:status";
  return null;
}
