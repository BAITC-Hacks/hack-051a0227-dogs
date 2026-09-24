import { z } from "zod";
import { readMission, missionChecks } from "./missions";
import { versionCompleted, meaningfullyChanged, type Work } from "./journey";
import type { AttemptVersion } from "@prisma/client";
import type { Slug } from "./catalog";
import type { drive } from "./profile-contract";

export const treeVersion = "practice-tree-v1";
export const branches = [
  {
    id: "understand",
    title: "Понимать задачу",
    intro: "Раздели вопрос, сведения и ограничения.",
  },
  {
    id: "people",
    title: "Работать с людьми",
    intro: "Выслушай, договорись и распредели работу.",
  },
  {
    id: "ideas",
    title: "Проверять идеи",
    intro: "Сделай предположение проверяемым.",
  },
  {
    id: "decide",
    title: "Принимать решения",
    intro: "Сравни последствия и пересмотри выбор.",
  },
  {
    id: "finish",
    title: "Доводить работу до результата",
    intro: "Сохрани артефакт и проверь его условия.",
  },
] as const;
type Rule =
  | "frame"
  | "evidence"
  | "constraints"
  | "listen"
  | "delegate"
  | "respond"
  | "hypothesis"
  | "test"
  | "context"
  | "tradeoff"
  | "revise"
  | "compare"
  | "media"
  | "engineering"
  | "service";
export type TreeNode = {
  id: Rule;
  branch: (typeof branches)[number]["id"];
  title: string;
  purpose: string;
  practice: string;
  completion: string;
  slug: Slug;
  drive: (keyof typeof drive)[];
  resource: string;
  previous?: Rule;
};
const node = (
  id: Rule,
  branch: TreeNode["branch"],
  title: string,
  purpose: string,
  practice: string,
  completion: string,
  slug: Slug,
  direction: TreeNode["drive"],
  resource: string,
  previous?: Rule,
): TreeNode => ({
  id,
  branch,
  title,
  purpose,
  practice,
  completion,
  slug,
  drive: direction,
  resource,
  previous,
});
// Author-owned exercise mapping, not an official inVision scale or a conversion of admissions scores.
export const treeNodes: TreeNode[] = [
  node(
    "frame",
    "understand",
    "Выделить первую проблему",
    "Не тратить ограниченный ресурс на функцию без задачи.",
    "В сервисе обмена учебниками выбери проблему и функцию. Запиши объяснение выбора.",
    "Сохранены согласованные проблема и функция и объяснение от 30 символов; смысл текста не оценивается.",
    "digital-products",
    ["I", "R"],
    "lean",
  ),
  node(
    "evidence",
    "understand",
    "Отделить свидетельство от вывода",
    "Увидеть, кого ещё не услышали в исследовании.",
    "В исследовании клуба выбери недостающую группу и обозначь границу вывода.",
    "В сохранённой работе выполнены условия выборки и границы вывода.",
    "sociology",
    ["I"],
    "lean",
    "frame",
  ),
  node(
    "constraints",
    "understand",
    "Проверить ограничения схемы",
    "Связать инженерное решение с ресурсом и безопасным маршрутом.",
    "Собери робота и проверь ограничения исходной схемы.",
    "Сохранена проверка исходной схемы с выполненными предметными условиями.",
    "creative-engineering",
    ["I", "R"],
    "programs",
    "evidence",
  ),
  node(
    "listen",
    "people",
    "Услышать две точки зрения",
    "Уточнить задачу до раздачи поручений.",
    "В миссии сервиса спроси двух разных участников команды и сохрани ответы.",
    "В версии работы сохранены ответы двух участников. Это взаимодействие с учебной командой.",
    "digital-products",
    ["V"],
    "leadership",
  ),
  node(
    "delegate",
    "people",
    "Распределить посильную работу",
    "Согласовать поручения с доступным временем.",
    "Назначь три работы в миссии сервиса так, чтобы никто не был перегружен.",
    "Сохранены все поручения без превышения вместимости участников.",
    "digital-products",
    ["V", "E"],
    "leadership",
    "listen",
  ),
  node(
    "respond",
    "people",
    "Вернуться к команде после изменения",
    "Сверить новые ограничения с теми, кто выполняет работу.",
    "Открой новое условие сервиса, запроси ответ участника и заново проверь распределение.",
    "Сохранён ответ команды после нового условия и допустимое распределение поручений.",
    "digital-products",
    ["V", "D"],
    "leadership",
    "delegate",
  ),
  node(
    "hypothesis",
    "ideas",
    "Составить план проверки гипотезы",
    "Выбрать способ получить недостающее свидетельство.",
    "В исследовании клуба выбери способ проверки и опиши, как сопоставишь результаты.",
    "Сохранён допустимый способ проверки и описание проверки от 30 символов; содержание остаётся авторским.",
    "sociology",
    ["R", "I"],
    "lean",
  ),
  node(
    "test",
    "ideas",
    "Проверить исходный маршрут",
    "Получить конкретную обратную связь о решении.",
    "В миссии сервиса запусти проверку исходного решения. Прочитай, какие условия выполнены.",
    "Сохранён результат исходной проверки. Неудачный результат тоже является проведённой проверкой.",
    "digital-products",
    ["R"],
    "lean",
    "hypothesis",
  ),
  node(
    "context",
    "ideas",
    "Применить принцип в бронировании",
    "Проверить решение с другими ограничениями.",
    "Из завершённого сервиса открой существующую задачу бронирования оборудования и сохрани результат.",
    "Связанная попытка бронирования выполняет условия упражнения.",
    "digital-products",
    ["R", "E"],
    "lean",
    "test",
  ),
  node(
    "tradeoff",
    "decide",
    "Объяснить компромисс ресурсов",
    "Сделать последствия распределения явными.",
    "В учебном центре распредели слоты, выбери принцип и запиши компромисс.",
    "В сохранённом плане выполнены ограничения слотов, сопровождения и выбранного принципа; есть объяснение.",
    "public-policy",
    ["I", "V"],
    "foundation",
  ),
  node(
    "revise",
    "decide",
    "Пересмотреть план после нового факта",
    "Изменить решение, когда ограничения изменились.",
    "В миссии центра открой новое условие, пересмотри план и проверь его.",
    "Сохранён завершённый план после нового условия, содержательно отличный от исходного.",
    "public-policy",
    ["D", "I"],
    "lean",
    "tradeoff",
  ),
  node(
    "compare",
    "decide",
    "Сопоставить две версии решения",
    "Увидеть конкретное изменение без выдуманного балла роста.",
    "Сохрани содержательно иной вариант плана центра и открой сравнение версий.",
    "Есть две содержательно различные сохранённые версии. Их можно открыть в сравнении.",
    "public-policy",
    ["I"],
    "programs",
    "revise",
  ),
  node(
    "media",
    "finish",
    "Собрать проверяемый репортаж",
    "Дать читателю понятный результат и корректный источник.",
    "Заверши репортаж после нового условия и сохрани медиапоследовательность.",
    "Сохранён репортаж, выполняющий условия миссии.",
    "digital-media",
    ["E", "R"],
    "video-guide",
  ),
  node(
    "engineering",
    "finish",
    "Сохранить работающую схему",
    "Довести пересмотр до проверенного артефакта.",
    "Заверши инженерную миссию после нового ограничения и сохрани схему.",
    "Сохранена схема, выполняющая условия миссии.",
    "creative-engineering",
    ["E", "D"],
    "programs",
    "media",
  ),
  node(
    "service",
    "finish",
    "Довести сервис до подтверждения",
    "Сделать следующий шаг пользователя ясным.",
    "Заверши маршрут обмена учебниками, проверь новое условие и сохрани результат.",
    "Сохранён маршрут, выполняющий условия миссии.",
    "digital-products",
    ["E"],
    "programs",
    "engineering",
  ),
];
export const treeHref = (id?: string) =>
  `/my?tree=1${id ? `&node=${encodeURIComponent(id)}` : ""}`;
export const treeStateSchema = z.object({
  resourceId: z.string(),
  resourceVersion: z.number().int(),
  openedAt: z.string().optional(),
  studiedAt: z.string().optional(),
  attemptId: z.string().optional(),
  baselineRevision: z.number().int().optional(),
  skipped: z.boolean().default(false),
  events: z
    .array(
      z.object({
        kind: z.string(),
        at: z.string(),
        resourceId: z.string().optional(),
        resourceVersion: z.number().optional(),
        attemptId: z.string().optional(),
      }),
    )
    .default([]),
});
export type TreeState = z.infer<typeof treeStateSchema>;
export const treeStatus = {
  AVAILABLE: "Доступно",
  STARTED: "Начато",
  STUDIED: "Материал изучен",
  PRACTICED: "Практика выполнена",
  APPLIED: "Применено в новой задаче",
} as const;
export function nodeEvidence(n: TreeNode, w: Work): AttemptVersion | undefined {
  return [...w.versions]
    .sort((a, b) => b.revision - a.revision)
    .find((v) => {
      if (v.revision === 0) return false;
      if (n.id === "context")
        return w.context === "EQUIPMENT" && versionCompleted(w, v);
      if (w.context !== "WORKSHOP" || w.slug !== n.slug) return false;
      const m = readMission(v.state);
      if (!m) return false;
      const checks = missionChecks(m);
      const pass = (label: string) =>
        checks.find((c) => c.label === label)?.passed === true;
      if (n.id === "frame")
        return (
          pass("Функция и проблема") && m.plan.explanation.trim().length >= 30
        );
      if (n.id === "listen")
        return (
          new Set(
            m.conversations.filter((c) => c.kind === "ask").map((c) => c.role),
          ).size >= 2
        );
      if (n.id === "delegate") return pass("План команды");
      if (n.id === "respond")
        return (
          m.conversations.some((c) => c.phase === "UPDATED") &&
          pass("План команды")
        );
      if (n.id === "test") return m.tests.some((t) => t.phase === "INITIAL");
      if (n.id === "constraints")
        return m.tests.some(
          (t) =>
            t.phase === "INITIAL" &&
            t.checks.slice(0, -2).every((c) => c.passed),
        );
      if (n.id === "evidence")
        return pass("Недостающие свидетельства") && pass("Границы вывода");
      if (n.id === "hypothesis")
        return (
          pass("Недостающие свидетельства") &&
          m.plan.verification.trim().length >= 30
        );
      if (n.id === "tradeoff")
        return (
          checks.slice(0, 3).every((c) => c.passed) &&
          m.plan.explanation.trim().length >= 30
        );
      if (n.id === "compare")
        return w.versions.some(
          (b) =>
            b.revision > 0 &&
            b.revision < v.revision &&
            meaningfullyChanged(w.slug, b.state, v.state, w.context),
        );
      if (n.id === "revise")
        return (
          versionCompleted(w, v) &&
          !!m.baseline &&
          meaningfullyChanged(
            w.slug,
            { mission: { ...m, plan: m.baseline } },
            v.state,
            w.context,
          )
        );
      return versionCompleted(w, v);
    });
}
