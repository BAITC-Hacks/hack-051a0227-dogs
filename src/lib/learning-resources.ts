import { z } from "zod";
import { treeNodes } from "./development-tree";
const publicUrl = z
  .string()
  .url()
  .max(1800)
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !/^(localhost|\[|\d)/i.test(u.hostname) &&
      u.hostname.includes(".")
    );
  }, "Нужна публичная HTTPS-ссылка без пароля и порта.");
export const resourceSchema = z
  .object({
    title: z.string().trim().min(5).max(180),
    author: z.string().trim().min(2).max(180),
    source: z.string().trim().min(2).max(180),
    url: publicUrl,
    sourceUrl: publicUrl,
    type: z.enum(["ARTICLE", "GUIDE", "PROGRAM", "CATALOG", "VIDEO"]),
    language: z.enum(["ru", "en", "kk"]),
    topic: z.string().trim().min(5).max(300),
    nodes: z
      .array(z.string())
      .max(15)
      .refine(
        (ids) => ids.every((id) => treeNodes.some((n) => n.id === id)),
        "Выберите существующие узлы.",
      ),
    checkedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          v <=
            new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Asia/Almaty",
            }).format(new Date()),
        "Укажите действительную дату проверки.",
      ),
    reason: z.string().trim().min(20).max(700),
    description: z.string().trim().min(20).max(1000),
    origin: z.enum(["INVISION", "EXTERNAL", "PARTNER"]),
    embedding: z.enum(["LINK_ONLY", "YOUTUBE"]),
    embedUrl: z.union([z.literal(""), publicUrl]),
    available: z.boolean(),
    published: z.boolean(),
  })
  .superRefine((r, ctx) => {
    if (
      r.origin === "INVISION" &&
      ![r.url, r.sourceUrl].every((v) =>
        ["www.invisionu.education", "invisionu.education"].includes(
          new URL(v).hostname,
        ),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Материал inVision должен вести на официальный домен.",
      });
    if (
      r.embedding === "YOUTUBE" &&
      (r.type !== "VIDEO" ||
        !/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}$/.test(
          r.embedUrl,
        ))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Для разрешённого плеера нужна проверенная ссылка youtube-nocookie.com/embed/… без параметров.",
      });
    if (r.embedding === "LINK_ONLY" && r.embedUrl)
      ctx.addIssue({
        code: "custom",
        message: "Уберите адрес плеера или подтвердите встраивание.",
      });
  });
export type LearningResource = z.infer<typeof resourceSchema>;
export type ResourceVersion = LearningResource & {
  version: number;
  authorId: string;
  publishedAt: string;
};
export type ResourceRecord = { id: string; versions: ResourceVersion[] };
export type ResourceCatalog = { revision: number; records: ResourceRecord[] };
export const resourceTypes = {
  ARTICLE: "Статья",
  GUIDE: "Руководство",
  PROGRAM: "Описание программы",
  CATALOG: "Каталог",
  VIDEO: "Видео",
};
const foundation = "https://www.invisionu.education/ru/foundation";
const programs = "https://www.invisionu.education/ru/undergraduate";
const guide =
  "https://www.invisionu.education/blog-ru/razbiraem-chto-smotrit-priyomnaya-komissiya-v-video-6-voprosov-sovety-po-svetu-i-zvuku-vsyo-dlya-teh-kto-gotovitsya-k-postupleniyu";
const leadership = "https://codethechange.stanford.edu/guides/leadership.html";
const corner = "https://stvp.stanford.edu/ecorner";
const lean = "https://stvp.stanford.edu/news/interrogating-lean-startup-method";
function resource(
  id: string,
  title: string,
  author: string,
  url: string,
  type: LearningResource["type"],
  language: LearningResource["language"],
  origin: LearningResource["origin"],
  topic: string,
  description: string,
  reason: string,
): ResourceRecord {
  return {
    id,
    versions: [
      {
        title,
        author,
        url,
        type,
        language,
        origin,
        topic,
        description,
        reason,
        source: author,
        sourceUrl: url,
        nodes: treeNodes.filter((n) => n.resource === id).map((n) => n.id),
        embedding: "LINK_ONLY",
        embedUrl: "",
        available: true,
        published: true,
        checkedAt: "2026-09-25",
        version: 1,
        authorId: "catalog-editorial-2026-09-25",
        publishedAt: "2026-09-25T00:00:00.000Z",
      },
    ],
  };
}
export const initialCatalog: ResourceCatalog = {
  revision: 1,
  records: [
    resource(
      "foundation",
      "Foundation Year и подход D.R.I.V.E.",
      "inVision U",
      foundation,
      "PROGRAM",
      "ru",
      "INVISION",
      "Действия, ценности и видение",
      "Официальная страница описывает рамку D.R.I.V.E. и подготовительную программу. Это контекст направлений развития, а не инструкция для решения упражнения.",
      "Сопоставь собственный компромисс с идеей взвешенного решения. Связь с практикой задана приложением, а не официальной формулой университета.",
    ),
    resource(
      "programs",
      "Пять программ бакалавриата",
      "inVision U",
      programs,
      "PROGRAM",
      "ru",
      "INVISION",
      "Связь деятельности с программами",
      "Официальное описание пяти программ бакалавриата. Используй раздел выбранного направления для сопоставления с деятельностью в своей учебной работе.",
      "Помогает назвать, какую деятельность ты попробовал. Переход на страницу не сохраняет интерес и не меняет программу заявки.",
    ),
    resource(
      "video-guide",
      "Видеопрезентация для inVision U — как снять и что говорить?",
      "inVision U",
      guide,
      "GUIDE",
      "ru",
      "INVISION",
      "Свет, звук и ясная подача",
      "Текстовое руководство. Для учебного репортажа полезен раздел о свете, звуке и положении камеры. Разбор вступительных ответов здесь не предлагается.",
      "Проверь условия понятной подачи учебного материала. Не копируй ответы на вопросы отбора; практика посвящена репортажу о событии.",
    ),
    resource(
      "leadership",
      "Team Leadership Guide",
      "Christopher Skalnik · Stanford Code the Change",
      leadership,
      "GUIDE",
      "en",
      "EXTERNAL",
      "Слушание, распределение и обратная связь",
      "Руководство команды Code the Change о слушании участников, ясных ожиданиях и реакции на обратную связь. Доступный текст, лицензия CC BY 4.0.",
      "После разделов Listening и Response to Feedback задай участникам учебной команды предметный вопрос и проверь посильность поручений.",
    ),
    resource(
      "ecorner",
      "eCorner",
      "Stanford Technology Ventures Program",
      corner,
      "CATALOG",
      "en",
      "EXTERNAL",
      "Предпринимательство и проверка идей",
      "Публичный каталог STVP с отдельными статьями, видео и подкастами. Каталог не считается одним просмотренным курсом; для практики выбрана конкретная статья ниже.",
      "Позволяет проверить происхождение отдельной статьи STVP. Автоматическая рекомендация произвольных видео из каталога не выполняется.",
    ),
    resource(
      "lean",
      "Interrogating the Lean Startup Method",
      "Stanford Technology Ventures Program",
      lean,
      "ARTICLE",
      "en",
      "EXTERNAL",
      "Гипотезы и пересмотр решения",
      "Статья STVP о явных предположениях, проверке гипотез и пересмотре решения после обратной связи. Используется доступный текст статьи, не просмотр связанного видео.",
      "Перед проверкой запиши, какое предположение проверяешь. После неё сравни предметное изменение решения; само число попыток не измеряет обучение.",
    ),
  ],
};
