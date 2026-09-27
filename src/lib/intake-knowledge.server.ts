import "server-only";
import type { ApplicationFields } from "./types";
import type { User } from "@prisma/client";
import { db } from "./db";
import { intakeRules } from "./intake.server";
import {
  emptyIntake,
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
      ? preflight(fields, app.materials, rules, app.programSlug).filter(
          (i) => i.group === "BLOCK",
        )
      : [];
  const records = [
    {
      key: "admissions:rules",
      title: "Требования набора " + rules.intake,
      text: `${v.entryType === "FOUNDATION" ? "Foundation" : "Бакалавриат"}, набор ${rules.intake}. ${docs.length ? "Обязательные документы: " + docs.join("; ") + "." : "Отдельные обязательные документы не установлены этой конфигурацией."} ${r.videoRequired ? "Нужна видеопрезентация." : ""} GPA ${r.gpaRequired ? "обязателен" : "не является обязательным полем"}. Письменное эссе ${r.essay.required ? "обязательно" : "по желанию"}. Источник проверен ${rules.checkedAt}; версия ${rules.version}. Условия относятся к указанному набору. Сроки будущего набора здесь не подтверждены.`,
      href: r.source,
    },
    {
      key: "admissions:gpa",
      title: "Как указать GPA",
      text: "Открой «Образование и результаты». Укажи исходный средний балл, минимум и максимум шкалы, её тип, период и взвешенность. Шкалы не объединяются. Если GPA не используется, выбери «В моей системе нет GPA» и добавь исходные оценки или табель. Отсутствующий результат не равен нулю.",
      href: "/apply?section=1&field=gpa-state",
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
          ? `Сохранён черновик версии ${app.revision}. Обязательных замечаний: ${issues.length}. ${issues[0]?.text ?? "Можно открыть обзор и подтвердить отправку."}`
          : "Заявка пока не сохранена. Начни с раздела «О себе». Мастерские и поинты не обязательны для подачи.",
      href: app?.submittedAt ? "/apply/status" : "/apply?section=5",
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
  if (/gpa|средн.{0,4}балл|шкал|оценк.{0,8}школ/iu.test(question))
    return "admissions:gpa";
  if (/эссе|essay/iu.test(question)) return "admissions:essay";
  if (/дедлайн|срок.{0,8}пода|грант|освобожд|гарант/iu.test(question))
    return "admissions:unknown";
  if (/документ|требован|правил.{0,8}поступ/iu.test(question))
    return "admissions:rules";
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
