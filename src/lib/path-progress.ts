import {
  nodeEvidence,
  treeNodes,
  treeVersion,
  treeStateSchema,
} from "./development-tree";
import { programFor } from "./catalog";
import { versionCompleted, workHref, type Work } from "./journey";
import type { DevelopmentRecommendation } from "./profile-contract";
export const pathProgressRule = "personal-path-v2";
export const deepeningPrompts: Record<string, string> = {
  "digital-products":
    "Какой шаг маршрута ты изменил и зачем? Назови другой порядок и ситуацию, в которой он удобнее для пользователя.",
  "digital-media":
    "Какой материал ты выбрал для истории и почему? Назови другой ракурс и факт, который понадобится проверить перед публикацией.",
  "creative-engineering":
    "Какое ограничение определило твою схему? Предложи замену одного элемента и объясни, что придётся пересчитать.",
  sociology:
    "Какой вывод позволяют сделать твои свидетельства? Запиши альтернативное объяснение и вопрос человеку, которого ещё не услышали.",
  "public-policy":
    "Чему ты отдал приоритет при распределении ресурса? Предложи другой вариант и объясни, для кого изменится результат.",
};
export type PathAward = {
  key: string;
  points: number;
  title: string;
  reason: string;
  href: string;
  ruleVersion: string;
  attemptId: string;
  revision: number;
};
/** Owner-filtered facts only. No application, language, assessment or staff context. Repeated events do not add points. */
export function pathProgress(
  works: Work[],
  steps: {
    recommendation: unknown;
    selfCompletedAt: Date | null;
    note: string;
    treeNode?: string | null;
    treeConfig?: string | null;
    treeState?: unknown;
  }[],
) {
  const awards: PathAward[] = [];
  const add = (
    key: string,
    points: number,
    title: string,
    reason: string,
    work: Work,
    revision: number,
  ) => {
    if (!awards.some((a) => a.key === key))
      awards.push({
        key,
        points,
        title,
        reason,
        href: workHref(work, revision),
        ruleVersion: pathProgressRule,
        attemptId: work.id,
        revision,
      });
  };
  for (const work of [...works].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  )) {
    const program = programFor(work.slug);
    if (!program) continue;
    const complete = [...work.versions]
      .sort((a, b) => a.revision - b.revision)
      .find((v) => versionCompleted(work, v));
    if (!complete) continue;
    if (work.context === "WORKSHOP")
      add(
        `work:${work.slug}`,
        10,
        program.shortTitle,
        "Сохранена работа, выполняющая условия мини-практики.",
        work,
        complete.revision,
      );
    if (
      work.context === "EQUIPMENT" &&
      works.some((p) =>
        p.versions.some(
          (v) => v.id === work.parentVersionId && versionCompleted(p, v),
        ),
      )
    )
      add(
        "context:equipment",
        5,
        "Принцип в новом контексте",
        "Выполнены условия бронирования оборудования в связанной задаче.",
        work,
        complete.revision,
      );
    for (const step of steps) {
      const r = step.recommendation as DevelopmentRecommendation | null;
      const source = work.versions.find(
        (v) => v.id === r?.versionId && versionCompleted(work, v),
      );
      if (
        work.context === "WORKSHOP" &&
        r?.kind === "EXPLAIN" &&
        r.attemptId === work.id &&
        source &&
        step.selfCompletedAt &&
        step.note.trim().length >= 20
      )
        add(
          `deepen:${work.slug}`,
          5,
          `Объяснение выбора · ${program.shortTitle}`,
          "Ты сохранил объяснение и отметил выполнение личного шага. Это отметка действия, не оценка навыка.",
          work,
          source.revision,
        );
    }
  }
  for (const step of steps) {
    if (
      step.treeConfig !== treeVersion ||
      !step.treeNode ||
      step.treeNode === "context"
    )
      continue;
    const state = treeStateSchema.safeParse(step.treeState),
      node = treeNodes.find((n) => n.id === step.treeNode);
    if (!state.success || !node) continue;
    const work = works.find((w) => w.id === state.data.attemptId);
    const evidence = work && nodeEvidence(node, work);
    if (work && evidence)
      add(
        `practice:${node.id}`,
        5,
        node.title,
        "Сохранён результат выбранной практики.",
        work,
        evidence.revision,
      );
  }
  return {
    total: awards.reduce((sum, a) => sum + a.points, 0),
    awards,
    ruleVersion: pathProgressRule,
  };
}
