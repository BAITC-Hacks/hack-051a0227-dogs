import { z } from "zod";
const text = (max = 200) => z.string().max(max);
export const credentialSchema = z.object({
  type: text(),
  value: text(80),
  scaleMin: text(30),
  scaleMax: text(30),
  date: text(30),
  materialId: text(),
  period: text(),
});
export const intakeFieldsSchema = z.object({
  entryType: z.enum(["BACHELOR", "FOUNDATION"]),
  intake: text(80),
  phone: text(60),
  education: z.object({
    institution: text(300),
    system: text(200),
    graduationYear: text(4),
    status: z.enum(["ONGOING", "COMPLETED"]),
    materialId: text(),
  }),
  gpa: z.object({
    state: z.enum(["UNSPECIFIED", "PROVIDED", "NOT_USED"]),
    value: text(40),
    min: text(40),
    max: text(40),
    scaleType: text(100),
    period: text(200),
    weighted: z.enum(["NOT_APPLICABLE", "YES", "NO"]),
    originalGrades: text(6000),
    materialId: text(),
  }),
  exams: z.array(credentialSchema).max(8),
  english: z.object({
    method: z.enum(["INTERNAL", "CERTIFICATE", "UNDECIDED"]),
    certificate: credentialSchema,
  }),
  universityReason: text(6000),
  goals: text(6000),
  experienceTitle: text(300),
  experiencePeriod: text(200),
  experienceResult: text(4000),
  essay: z.object({
    questionId: text(),
    questionVersion: z.number().int().min(1),
    language: text(60),
    text: text(40000),
    materialId: text(),
  }),
  aiConsent: z.boolean(),
});
export type IntakeFields = z.infer<typeof intakeFieldsSchema>;
export const emptyCredential = {
  type: "",
  value: "",
  scaleMin: "",
  scaleMax: "",
  date: "",
  materialId: "",
  period: "",
};
export const emptyIntake: IntakeFields = {
  entryType: "BACHELOR",
  intake: "2026",
  phone: "",
  education: {
    institution: "",
    system: "",
    graduationYear: "",
    status: "ONGOING",
    materialId: "",
  },
  gpa: {
    state: "UNSPECIFIED",
    value: "",
    min: "",
    max: "",
    scaleType: "",
    period: "",
    weighted: "NOT_APPLICABLE",
    originalGrades: "",
    materialId: "",
  },
  exams: [],
  english: { method: "UNDECIDED", certificate: { ...emptyCredential } },
  universityReason: "",
  goals: "",
  experienceTitle: "",
  experiencePeriod: "",
  experienceResult: "",
  essay: {
    questionId: "experience-reflection",
    questionVersion: 1,
    language: "ru",
    text: "",
    materialId: "",
  },
  aiConsent: false,
};
export const materialPurposes = {
  GENERAL: "Дополнительный материал",
  EDUCATION: "Аттестат или документ об образовании",
  GRADES: "Табель или выписка оценок",
  EXAM: "Сертификат ЕНТ",
  OTHER_EXAM: "Результат другого экзамена",
  LANGUAGE: "Сертификат английского языка",
  ESSAY: "Эссе",
  IDENTITY: "Удостоверение личности",
  SUPPORT: "Административные сведения о поддержке",
  VIDEO: "Видеопрезентация",
} as const;
/** These are recognizable additional results, not university-approved ЕНТ equivalents. */
export const additionalExamTypes = {
  SAT: { label: "SAT", min: "400", max: "1600" },
  ACT: { label: "ACT", min: "1", max: "36" },
  IB: { label: "IB Diploma", min: "0", max: "45" },
} as const;
export const entSubjectPair: Record<string, string> = {
  "digital-products": "Математика + Информатика",
  "creative-engineering": "Математика + Физика",
  "digital-media": "Математика + География",
  sociology: "Математика + География",
};
export type MaterialPurpose = keyof typeof materialPurposes;
export const privatePurposes = ["IDENTITY", "SUPPORT"];
export const ruleSchema = z.object({
  version: z.string().min(1).max(100),
  intake: z.string().min(1).max(80),
  checkedAt: z.string().max(30),
  routes: z
    .array(
      z.object({
        entryType: z.enum(["BACHELOR", "FOUNDATION"]),
        programs: z.array(z.string()).max(5),
        source: z
          .url()
          .refine((v) => new URL(v).hostname === "www.invisionu.education"),
        videoRequired: z.boolean(),
        educationRequired: z.boolean(),
        gpaRequired: z.boolean(),
        forcedChoiceRequired: z.boolean(),
        documents: z
          .array(
            z.object({
              purpose: z.enum(
                Object.keys(materialPurposes) as [
                  MaterialPurpose,
                  ...MaterialPurpose[],
                ],
              ),
              required: z.boolean(),
              applies: z.enum(["ALL", "KZ"]),
              origin: z.enum(["UNIVERSITY", "ADDITIONAL", "AUTHORED"]),
              label: z.string().max(300),
            }),
          )
          .max(10),
        exams: z
          .array(
            z.object({
              type: z.string().max(100),
              required: z.boolean(),
              applies: z.enum(["ALL", "KZ"]),
              minimum: z.number().nullable(),
              source: z.string().max(500),
            }),
          )
          .max(8),
        essay: z.object({
          id: z.string().max(100),
          version: z.number().int().positive(),
          question: z.string().max(2000),
          required: z.boolean(),
          minWords: z.number().int().min(0).nullable(),
          maxWords: z.number().int().positive().nullable(),
          allowFile: z.boolean(),
          origin: z.enum(["UNIVERSITY", "ADDITIONAL", "AUTHORED"]),
        }),
        language: z.object({
          required: z.boolean().default(false),
          methods: z.array(z.enum(["INTERNAL", "CERTIFICATE"])),
          certificates: z.array(z.string().max(100)),
          note: z.string().max(1500),
          exemption: z.enum(["STAFF_REVIEW", "NONE"]),
          validityMonths: z.number().int().positive().nullable(),
        }),
      }),
    )
    .min(2)
    .max(10),
});
export type IntakeRules = z.infer<typeof ruleSchema>;
const essay = {
  id: "experience-reflection",
  version: 1,
  question:
    "Опиши решение, которое ты пересмотрел после нового факта. Что ты сделал и чему научился?",
  required: true,
  minWords: null,
  maxWords: null,
  allowFile: true,
  origin: "ADDITIONAL" as const,
};
export const defaultIntakeRules: IntakeRules = {
  version: "invision-2026-20260929-v2",
  intake: "2026",
  checkedAt: "2026-09-27",
  routes: [
    {
      entryType: "BACHELOR",
      programs: [],
      source: "https://www.invisionu.education/ru/undergraduate",
      videoRequired: true,
      educationRequired: true,
      gpaRequired: true,
      forcedChoiceRequired: false,
      documents: [
        {
          purpose: "IDENTITY",
          required: true,
          applies: "ALL",
          origin: "UNIVERSITY",
          label: "Удостоверение личности или паспорт",
        },
        {
          purpose: "EXAM",
          required: true,
          applies: "KZ",
          origin: "UNIVERSITY",
          label: "Сертификат ЕНТ",
        },
      ],
      exams: [
        {
          type: "ЕНТ",
          required: true,
          applies: "KZ",
          minimum: 80,
          source: "https://www.invisionu.education/ru/undergraduate",
        },
      ],
      essay,
      language: {
        required: true,
        methods: ["CERTIFICATE", "INTERNAL"],
        certificates: ["IELTS", "TOEFL iBT", "Duolingo"],
        note: "На странице набора 2026 указаны IELTS 6.0, TOEFL iBT 60–78, Duolingo 105–115 для иностранных кандидатов без возможности сдать IELTS/TOEFL. Применимость и освобождение от внутренней проверки подтверждает сотрудник. Внутренняя проверка дополняет сертификат.",
        exemption: "STAFF_REVIEW",
        validityMonths: null,
      },
    },
    {
      entryType: "FOUNDATION",
      programs: [],
      source: "https://www.invisionu.education/ru/foundation",
      videoRequired: true,
      educationRequired: true,
      gpaRequired: true,
      forcedChoiceRequired: false,
      documents: [],
      exams: [],
      essay: {
        ...essay,
        id: "foundation-goal",
        question:
          "Какую задачу ты хочешь научиться решать за подготовительный год?",
      },
      language: {
        required: true,
        methods: ["INTERNAL", "CERTIFICATE"],
        certificates: ["IELTS", "TOEFL iBT", "Duolingo"],
        note: "Foundation предусматривает собеседование на английском, казахском или русском. Страница описывает ЕНТ и предметные сочетания, но не устанавливает отдельный порог Foundation. Применимость уточняет комиссия.",
        exemption: "STAFF_REVIEW",
        validityMonths: null,
      },
    },
  ],
};
export const routeFor = (rules: IntakeRules, entry: string, program: string) =>
  rules.routes.find(
    (r) => r.entryType === entry && r.programs.includes(program),
  ) ?? rules.routes.find((r) => r.entryType === entry && !r.programs.length)!;
export const wordCount = (value: string) =>
  value.trim().split(/\s+/u).filter(Boolean).length;
const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type CertificateIssue = { text: string; field: string };
export function certificateScaleIssue(
  certificate: Pick<
    z.infer<typeof credentialSchema>,
    "type" | "value" | "scaleMin" | "scaleMax" | "date"
  >,
): CertificateIssue | null {
  const { type, value, scaleMin, scaleMax, date } = certificate;
  if (![value, scaleMin, scaleMax, date].every((part) => part.trim()))
    return null;
  const parse = (part: string) => {
    const normalized = part.trim().replace(",", ".");
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(normalized))
      return { kind: "number", value: Number(normalized) };
    const level = cefrLevels.indexOf(
      part.trim().toUpperCase() as (typeof cefrLevels)[number],
    );
    return level < 0 ? null : { kind: "cefr", value: level };
  };
  const result = parse(value),
    min = parse(scaleMin),
    max = parse(scaleMax);
  const numericType = ["ielts", "toefl ibt", "duolingo"].includes(
    type.trim().toLowerCase(),
  );
  if (!result || (numericType && result.kind !== "number"))
    return {
      field: "language-value",
      text: "Укажи результат как в сертификате: число для IELTS, TOEFL или Duolingo; для другого документа возможен уровень A1–C2.",
    };
  if (!min || min.kind !== result.kind)
    return {
      field: "language-scaleMin",
      text: "Минимум шкалы должен быть в том же формате, что результат: число или уровень A1–C2.",
    };
  if (!max || max.kind !== result.kind)
    return {
      field: "language-scaleMax",
      text: "Максимум шкалы должен быть в том же формате, что результат: число или уровень A1–C2.",
    };
  if (max.value <= min.value)
    return {
      field: "language-scaleMax",
      text: "Максимум шкалы должен быть больше минимума.",
    };
  if (result.value < min.value || result.value > max.value)
    return {
      field: "language-value",
      text: "Результат должен находиться между минимумом и максимумом исходной шкалы.",
    };
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(date)))
    return {
      field: "language-date",
      text: "Укажи действительную дату экзамена.",
    };
  return null;
}
export type PreflightIssue = {
  key: string;
  group: "BLOCK" | "SUGGEST" | "PENDING";
  text: string;
  section: number;
  field: string;
  rule: string;
};
type Fields = {
  name: string;
  email: string;
  city: string;
  citizenship: string;
  processing: boolean;
  experience: string;
  personalRole: string;
  motivation: string;
  videoUrl: string;
  most: string;
  least: string;
  intake?: IntakeFields;
};
type Material = { id: string; kind: string; purpose?: string; name?: string };
export function preflight(
  fields: Fields,
  materials: Material[],
  rules: IntakeRules,
  program: string,
  languageStatus?: string | null,
): PreflightIssue[] {
  const v = fields.intake ?? emptyIntake,
    r = routeFor(rules, v.entryType, program),
    out: PreflightIssue[] = [];
  const add = (
    key: string,
    group: PreflightIssue["group"],
    text: string,
    section: number,
    field = key,
    rule = rules.version,
  ) => out.push({ key, group, text, section, field, rule });
  const applies = (a: string) =>
    a === "ALL" ||
    /^(казахстан|kazakhstan|kz)$/iu.test(fields.citizenship.trim());
  if (!fields.name.trim() || !z.email().safeParse(fields.email).success)
    add(
      "name",
      "BLOCK",
      "Укажи имя и корректную почту.",
      0,
      "name",
      "Контакт для рассмотрения",
    );
  if (!fields.processing)
    add("processing", "BLOCK", "Подтверди обработку заявки комиссией.", 5);
  if (v.intake !== rules.intake)
    add(
      "intake",
      "BLOCK",
      "Выбери действующий набор и проверь его правила.",
      0,
    );
  if (
    r.videoRequired &&
    !fields.videoUrl &&
    !materials.some((m) => m.kind === "video")
  )
    add(
      "videoUrl",
      "BLOCK",
      "Добавь видеопрезентацию: ссылку или файл.",
      3,
      "videoUrl",
      r.source,
    );
  if (fields.videoUrl) {
    try {
      const u = new URL(fields.videoUrl);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      add(
        "video-format",
        "BLOCK",
        "Укажи полную https-ссылку без логина и пароля в адресе.",
        3,
        "videoUrl",
      );
    }
  }
  if (fields.videoUrl)
    add(
      "video-review",
      "PENDING",
      "Доступность и содержание видео по ссылке проверит сотрудник. Автоматически ссылка не открывалась.",
      3,
      "videoUrl",
      r.source,
    );
  for (const d of r.documents.filter(
    (d) =>
      d.required &&
      applies(d.applies) &&
      (d.purpose !== "LANGUAGE" || v.english.method === "CERTIFICATE"),
  ))
    if (!materials.some((m) => m.purpose === d.purpose))
      add(
        "document-" + d.purpose,
        "BLOCK",
        `Приложи: ${d.label}.`,
        3,
        "material-purpose",
        d.origin === "UNIVERSITY" ? r.source : rules.version,
      );
  if (r.educationRequired && !v.education.institution.trim())
    add("institution", "BLOCK", "Укажи учебное заведение.", 1);
  if (
    v.education.institution &&
    (!v.education.system || !/^\d{4}$/.test(v.education.graduationYear))
  )
    add(
      "education",
      "BLOCK",
      "Укажи образовательную систему и год окончания четырьмя цифрами, например 2026.",
      1,
      "education-system",
      "Полнота указанного образования",
    );
  if (r.gpaRequired && v.gpa.state === "UNSPECIFIED")
    add(
      "gpa-state",
      "BLOCK",
      "Укажи результат или отметь, что система не использует GPA.",
      1,
    );
  if (v.gpa.state === "PROVIDED") {
    const n = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN),
      x = n(v.gpa.value),
      lo = n(v.gpa.min),
      hi = n(v.gpa.max);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(lo) ||
      !Number.isFinite(hi) ||
      hi <= lo ||
      x < lo ||
      x > hi ||
      !v.gpa.scaleType ||
      !v.gpa.period
    )
      add(
        "gpa",
        "BLOCK",
        "У GPA нужны исходный балл, минимум и максимум шкалы, её тип и период. Значение должно быть в пределах шкалы.",
        1,
        "gpa-value",
        "Корректность исходной шкалы",
      );
    else
      add(
        "gpa-check",
        "PENDING",
        "GPA сохранён в исходной шкале. Результат ещё не проверен сотрудником.",
        1,
        "gpa-value",
      );
  }
  if (
    v.gpa.state === "NOT_USED" &&
    !v.gpa.originalGrades.trim() &&
    !v.gpa.materialId
  )
    add(
      "grades",
      r.gpaRequired ? "BLOCK" : "SUGGEST",
      r.gpaRequired
        ? "Если твоя система не использует GPA, добавь исходные оценки или табель."
        : "Можно добавить исходные оценки или табель вместо GPA.",
      1,
      "original-grades",
    );
  for (const e of r.exams.filter((e) => e.required && applies(e.applies)))
    if (
      !v.exams.some(
        (x) => x.type.toLowerCase() === e.type.toLowerCase() && x.value,
      )
    )
      add(
        "exam-required-" + e.type,
        "BLOCK",
        `Для выбранного типа поступления и гражданства укажи результат ${e.type}.`,
        1,
        "exams",
        e.source,
      );
  for (const requirement of r.exams.filter((e) => e.applies === "KZ" && applies(e.applies) && e.minimum !== null)) {
    const submitted = v.exams.find((e) => e.type.toLowerCase() === requirement.type.toLowerCase());
    if (submitted?.value && Number.isFinite(Number(submitted.value.replace(",", "."))) && Number(submitted.value.replace(",", ".")) < requirement.minimum!)
      add(
        "exam-minimum-" + requirement.type,
        "BLOCK",
        `${requirement.type}: для бакалавриата на странице университета указан минимум ${requirement.minimum} баллов. Проверь результат; если данные требуют уточнения, обратись в приёмную комиссию.`,
        1,
        "exams",
        requirement.source,
      );
  }
  for (const [i, e] of v.exams.entries()) {
    if (!e.type || !e.value || !e.scaleMin || !e.scaleMax || !e.date)
      add(
        "exam-" + i,
        "BLOCK",
        `Экзамен ${i + 1}: укажи тип, результат, границы шкалы и дату или убери незаполненную строку.`,
        1,
        "exams",
      );
    else if (
      ![e.value, e.scaleMin, e.scaleMax].every((n) =>
        Number.isFinite(Number(n.replace(",", "."))),
      ) ||
      Number(e.scaleMax.replace(",", ".")) <=
        Number(e.scaleMin.replace(",", ".")) ||
      Number(e.value.replace(",", ".")) <
        Number(e.scaleMin.replace(",", ".")) ||
      Number(e.value.replace(",", ".")) >
        Number(e.scaleMax.replace(",", ".")) ||
      !Number.isFinite(Date.parse(e.date))
    )
      add(
        "exam-scale-" + i,
        "BLOCK",
        "Проверь исходный результат, границы шкалы и дату экзамена.",
        1,
        "exams",
      );
    else
      add(
        "exam-check-" + i,
        "PENDING",
        `${e.type}: результат и применимость проверит сотрудник.`,
        1,
        "exams",
      );
  }
  if (!fields.personalRole.trim())
    add(
      "personalRole",
      "SUGGEST",
      "Опиши свой личный вклад, чтобы комиссия отличила его от работы команды.",
      2,
    );
  if (!fields.motivation.trim())
    add("motivation", "SUGGEST", "Расскажи, почему выбрал это направление.", 2);
  const words = wordCount(v.essay.text),
    file = materials.some(
      (m) => m.id === v.essay.materialId && m.purpose === "ESSAY",
    );
  if (
    (v.essay.text || file || r.essay.required) &&
    (v.essay.questionId !== r.essay.id ||
      v.essay.questionVersion !== r.essay.version)
  )
    add(
      "essay-question",
      "BLOCK",
      "Тема эссе изменилась. Сверь вопрос и сохрани ответ для выбранного набора.",
      2,
      "essay",
    );
  if (r.essay.required && !words && !(r.essay.allowFile && file))
    add("essay-empty", "BLOCK", "Добавь эссе по теме набора.", 2, "essay");
  if (
    words &&
    ((r.essay.minWords !== null && words < r.essay.minWords) ||
      (r.essay.maxWords !== null && words > r.essay.maxWords))
  )
    add(
      "essay-length",
      "BLOCK",
      `Объём эссе: ${words} слов. Условия: ${r.essay.minWords ?? 0}–${r.essay.maxWords ?? "без верхнего ограничения"}.`,
      2,
      "essay",
    );
  if (
    v.english.method !== "UNDECIDED" &&
    !r.language.methods.includes(v.english.method)
  )
    add(
      "language-method",
      "BLOCK",
      "Выбери доступный для этого набора способ проверки.",
      4,
      "certificate",
    );
  if (r.language.required && v.english.method === "UNDECIDED")
    add(
      "language-choice",
      "BLOCK",
      "Выбери способ подтверждения английского: сертификат или ответы в приложении.",
      4,
      "certificate",
    );
  if (
    v.english.method === "CERTIFICATE" &&
    (!v.english.certificate.type ||
      !v.english.certificate.value ||
      !v.english.certificate.scaleMin ||
      !v.english.certificate.scaleMax ||
      !v.english.certificate.date)
  )
    add(
      "certificate",
      "BLOCK",
      "У сертификата укажи тип, результат, шкалу и дату.",
      4,
    );
  if (v.english.method === "CERTIFICATE") {
    const c = v.english.certificate,
      issue = certificateScaleIssue(c);
    if (
      r.language.required &&
      !materials.some(
        (m) =>
          m.id === c.materialId &&
          ["LANGUAGE", "GENERAL"].includes(m.purpose ?? ""),
      )
    )
      add(
        "certificate-file",
        "BLOCK",
        "Приложи файл языкового сертификата под результатом английского.",
        4,
        "certificate",
      );
    if (issue) add("certificate-scale", "BLOCK", issue.text, 4, issue.field);
    if (r.language.validityMonths !== null && c.date) {
      const expiry = new Date(c.date);
      expiry.setUTCMonth(expiry.getUTCMonth() + r.language.validityMonths);
      if (expiry < new Date())
        add(
          "certificate-expiry",
          "PENDING",
          "Срок сертификата по правилам набора истёк. Сотрудник уточнит доступный способ проверки.",
          4,
          "certificate",
        );
    }
  }
  if (
    r.language.required &&
    v.english.method === "INTERNAL" &&
    !["PENDING_REVIEW", "REVIEWED"].includes(languageStatus ?? "")
  )
    add(
      "language-response",
      "BLOCK",
      "Заверши ответы на английском в заявке.",
      4,
      "certificate",
    );
  if (v.english.method !== "UNDECIDED")
    add(
      "language-check",
      "PENDING",
      "Языковой результат и возможное освобождение проверяет сотрудник отдельно от опыта и лидерских оценок.",
      4,
      "certificate",
    );
  if (
    r.forcedChoiceRequired &&
    (!fields.most || !fields.least || fields.most === fields.least)
  )
    add("choice", "BLOCK", "Выбери разные MOST и LEAST.", 4);
  for (const m of materials)
    if (m.kind === "document")
      add(
        "material-" + m.id,
        "PENDING",
        `${m.name ?? "Документ"}: принят, содержание ещё требует проверки.`,
        3,
        "material-" + m.id,
      );
  return out;
}
