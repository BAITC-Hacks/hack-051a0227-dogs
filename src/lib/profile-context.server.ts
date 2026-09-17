import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { describeWork } from "./presentation";
import { programFor, SOURCE_URL, stageLabels } from "./catalog";
import {
  workChanges,
  workHref,
  workTitle,
  versionCompleted,
  type Work,
} from "./journey";
import { digest, scoringInput } from "./scoring-input.server";
import { scoringView } from "./scoring-service.server";
import {
  validateScoringResult,
  type ScoringInput,
  type ScoringResult,
} from "./scoring-contract";
import { planSchema, resultSchema } from "./review-contract";
import type { Feedback, ProjectState } from "./types";
import {
  profileVersion,
  type ProfileScope,
  type ProfileSource,
  type ProfileAction,
} from "./profile-contract";

export type ProfileWork = {
  id: string;
  title: string;
  slug: string;
  context: string;
  revision: number;
  versionId: string;
  sourceKey: string;
  beforeKey?: string;
  changes: string[];
  complete: boolean;
  feedback: Feedback;
  href: string;
  current: boolean;
};
export type ProfileContext = {
  audience: "CANDIDATE" | "STAFF";
  applicationId?: string;
  scopeKey: string;
  hash: string;
  sources: ProfileSource[];
  works: ProfileWork[];
  questions: {
    text: string;
    gap: string;
    sourceKey: string;
    action: ProfileAction;
  }[];
  consistency: { sourceKey: string; text: string }[];
  feedbackAction?: ProfileAction;
};
export function profileSource(
  key: string,
  title: string,
  text: string,
  group: ProfileSource["group"],
  origin: string,
  extra: Partial<ProfileSource> = {},
): ProfileSource {
  const { current: _current, ...versionData } = extra;
  void _current;
  return {
    key,
    title,
    text,
    group,
    origin,
    kind: "Текст",
    current: true,
    dependencies: [],
    ...extra,
    version: digest({ text, ...versionData }),
  };
}
export function sourceRef(s: ProfileSource, quote = s.text) {
  return { key: s.key, version: s.version, quote };
}
const date = (d: Date | string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(new Date(d));
function scoringText(r: ScoringResult, domain?: string) {
  return [
    r.summary,
    ...r.domains
      .filter((d) => !domain || d.domain === domain)
      .map(
        (d) =>
          `${d.domain}: ${d.rating ? d.rating.label + (d.rating.value === null ? "" : ` (${d.rating.value})`) : "Оценка не установлена"}. Достаточность: ${d.sufficiency}. ${d.consistency}. ${d.interpretation}`,
      ),
    ...r.contradictions.map((c) => `Противоречие: ${c.text}`),
    ...r.questions.map((q) => `Пробел: ${q.gap}\nВопрос: ${q.text}`),
    `Рекомендация: ${r.recommendation.reason}`,
  ].join("\n\n");
}
/** Access branches precede collection. No candidate scoring query, no staff private-work query. */
export async function collectProfile(
  user: User,
  scope: ProfileScope,
): Promise<ProfileContext> {
  const staff = user.role === "STAFF";
  if (
    staff &&
    (!scope.applicationId ||
      scope.attemptId ||
      scope.revision !== undefined ||
      scope.feedbackId)
  )
    throw new AppError(
      "Выберите отправленную заявку в карточке комиссии.",
      403,
    );
  if (scope.applicationId) await assertApplication(scope.applicationId, user);
  const app = staff
    ? await db.application.findUniqueOrThrow({
        where: { id: scope.applicationId },
      })
    : await db.application.findUnique({ where: { userId: user.id } });
  if (!staff && scope.applicationId && app?.id !== scope.applicationId)
    throw new AppError("Заявка недоступна.", 404);
  const sources: ProfileSource[] = [],
    works: ProfileWork[] = [];
  const questions: ProfileContext["questions"] = [];
  const consistency: ProfileContext["consistency"] = [];
  const add = (s: ProfileSource) => {
    sources.push(s);
    return s;
  };
  const dep = (keys: string[]) =>
    keys.map((key) => {
      const s = sources.find((s) => s.key === key);
      if (!s) throw new Error("PROFILE_DEPENDENCY_MISSING");
      return { key, version: s.version };
    });
  let feedbackAction: ProfileAction | undefined;
  if (!staff) {
    const owned: Work[] = await db.projectAttempt.findMany({
      where: { userId: user.id },
      include: { versions: { orderBy: { revision: "desc" } } },
      orderBy: { updatedAt: "desc" },
    });
    if (scope.attemptId && !owned.some((w) => w.id === scope.attemptId))
      throw new AppError("Работа недоступна.", 404);
    for (const w of owned.filter(
      (w) =>
        !scope.feedbackId && (!scope.attemptId || w.id === scope.attemptId),
    )) {
      const p = programFor(w.slug)!;
      for (const v of w.versions) {
        const feedback = v.feedback as unknown as Feedback;
        const text = [
          describeWork(w.slug, v.state as unknown as ProjectState, w.context),
          `Условия: ${w.conditions}`,
          `Разбор по правилам упражнения: ${feedback.summary}`,
          ...feedback.checks.map(
            (c) =>
              `${c.passed ? "Выполнено" : "Нужно проверить"}: ${c.label}. ${c.detail}`,
          ),
          `Версия правил: ${v.ruleVersion}. Использованные подсказки: ${v.hintsUsed.length}.`,
        ].join("\n\n");
        add(
          profileSource(
            `work:${v.id}`,
            `${workTitle(w, p.action)} · версия ${v.revision}`,
            text,
            "work",
            "Авторская учебная работа и проверка условий",
            {
              kind: "Учебное упражнение",
              href: workHref(w, v.revision),
              current: v.revision === w.revision,
            },
          ),
        );
      }
      const selected =
        scope.attemptId && scope.revision !== undefined
          ? w.versions.find((v) => v.revision === scope.revision)
          : w.versions[0];
      if (!selected) throw new AppError("Версия работы недоступна.", 404);
      const before = w.versions.find(
        (v) =>
          v.revision === (selected.basedOnRevision ?? selected.revision - 1),
      );
      works.push({
        id: w.id,
        title: workTitle(w, p.action),
        slug: w.slug,
        context: w.context,
        revision: selected.revision,
        versionId: selected.id,
        sourceKey: `work:${selected.id}`,
        beforeKey: before ? `work:${before.id}` : undefined,
        changes: before
          ? workChanges(w.slug, before.state, selected.state, w.context)
          : [],
        complete: versionCompleted(w, selected),
        feedback: selected.feedback as unknown as Feedback,
        href: workHref(w, selected.revision),
        current: selected.revision === w.revision,
      });
      add(
        profileSource(
          `program:${w.slug}`,
          p.title,
          `${p.description}\nНаправления изучения: ${p.disciplines.join(", ")}.`,
          "program",
          "Проверенное описание программы",
          { href: SOURCE_URL },
        ),
      );
    }
    add(
      profileSource(
        "interests",
        "Явно сохранённые интересы",
        user.interests.length
          ? user.interests.map((s) => programFor(s)?.title ?? s).join("; ")
          : "Интересы ещё не выбраны.",
        "interest",
        "Выбор кандидата",
      ),
    );
  }
  if (app) {
    const [versions, transfers, publicFeedback, sourceRows, messages] =
      await Promise.all([
        db.applicationVersion.findMany({
          where: {
            applicationId: app.id,
            ...(staff ? { kind: "SUBMITTED" } : {}),
          },
          orderBy: { revision: "desc" },
        }),
        db.workTransfer.findMany({
          where: { applicationId: app.id },
          orderBy: { consentAt: "asc" },
        }),
        db.feedbackPublication.findMany({
          where: { applicationId: app.id, publishedAt: { not: null } },
          include: { decision: { select: { toStage: true } } },
          orderBy: { publishedAt: "desc" },
        }),
        db.source.findMany({
          where: { applicationId: app.id, kind: { not: "Forced-choice" } },
          include: {
            material: {
              select: { id: true, applicationId: true, name: true, mime: true },
            },
            corrections: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        db.message.findMany({
          where: { applicationId: app.id },
          include: { author: { select: { role: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);
    const submitted = versions.find((v) => v.kind === "SUBMITTED");
    const snap = submitted?.snapshot as
      { transfers?: { id: string }[]; materialIds?: string[] } | undefined;
    const allowedTransfers = transfers.filter(
      (t) => !staff || snap?.transfers?.some((s) => s.id === t.id),
    );
    const transferTexts = allowedTransfers.map((t) => {
      const s = t.snapshot as {
        slug: string;
        context?: string;
        state: ProjectState;
        conditions?: string;
      };
      return { t, s, description: describeWork(s.slug, s.state, s.context) };
    });
    for (const { t, s, description } of transferTexts)
      add(
        profileSource(
          `transfer:${t.id}`,
          `Переданная учебная работа · версия ${t.revision}`,
          `${programFor(s.slug)?.action}\n${description}\nУсловия: ${s.conditions}\nПередана кандидатом ${date(t.consentAt)}. Это учебное упражнение, не жизненное достижение.`,
          "transfer",
          "Кандидат разрешил передачу конкретной версии",
          { kind: "Учебное упражнение" },
        ),
      );
    const sourceKeys = new Map<string, string>();
    for (const s of sourceRows) {
      if (
        s.materialId &&
        (!s.material ||
          s.material.applicationId !== app.id ||
          (staff && !snap?.materialIds?.includes(s.materialId)))
      )
        continue;
      const transfer =
        s.kind === "Учебное упражнение"
          ? transferTexts.find(
              (t) =>
                s.content ===
                `Учебное упражнение. Версия ${t.t.revision}\n\n${t.description}`,
            )
          : undefined;
      if (s.kind === "Учебное упражнение" && !transfer) continue;
      // Staff-produced derived material is not implicitly candidate-visible.
      if (
        !staff &&
        s.provenance !== "CANDIDATE_ACCOUNT" &&
        !messages.some((m) => m.id === s.messageId && m.authorId === user.id)
      )
        continue;
      const key = `source:${s.id}`;
      sourceKeys.set(s.id, key);
      const corrections = s.corrections.filter(
        (c) => staff || c.authorId === user.id,
      );
      add(
        profileSource(
          key,
          s.title,
          s.material
            ? `Материал: ${s.material.name}. Извлечённого текста нет; содержание здесь не прочитано.`
            : s.content,
          s.messageId ? "clarification" : "source",
          "Кандидат сообщил; независимое подтверждение не установлено",
          {
            kind: s.kind,
            href: s.material ? `/api/files/${s.material.id}` : undefined,
            dependencies: transfer ? dep([`transfer:${transfer.t.id}`]) : [],
            // Correction versions affect access to cached interpretations without rewriting original text.
            version: digest(
              corrections.map((c) => ({ id: c.id, text: c.explanation })),
            ),
          },
        ),
      );
    }
    const latest = versions[0];
    if (latest) {
      const f =
        (latest.snapshot as { fields?: Record<string, unknown> }).fields ?? {};
      add(
        profileSource(
          `application:${latest.id}`,
          `Заявка · версия ${latest.revision}`,
          `Программа: ${programFor(app.programSlug)?.title}.\nМотивация: ${String(f.motivation ?? "")}\nОпыт: ${String(f.experience ?? "")}\nЛичная роль: ${String(f.personalRole ?? "")}`,
          "application",
          "Кандидат сообщил в сохранённой версии",
        ),
      );
    }
    const publicStage =
      publicFeedback[0]?.decision.toStage ??
      (app.submittedAt ? "REVIEW" : "DRAFT");
    add(
      profileSource(
        "application-state",
        "Состояние заявки",
        `Состояние: ${stageLabels[staff ? app.stage : publicStage]}. ${app.submittedAt ? "Отправленная версия зафиксирована; новые работы не переписывают её." : "Заявку можно продолжить независимо от мастерских."}`,
        "application",
        staff
          ? "Текущий процесс рассмотрения"
          : "Опубликованное состояние заявки",
      ),
    );
    for (const f of publicFeedback) {
      if (scope.feedbackId && f.id !== scope.feedbackId) continue;
      if (f.sourceIds.some((id) => !sourceKeys.has(id))) continue;
      add(
        profileSource(
          `publication:${f.id}`,
          `Обратная связь · ${date(f.publishedAt!)}`,
          `Наблюдение: ${f.observation}\n\nЧто уточнить или развивать: ${f.suggestion}\n\nСледующий шаг: ${f.nextAction}`,
          "publication",
          "Опубликовано сотрудником комиссии",
          { dependencies: dep(f.sourceIds.map((id) => sourceKeys.get(id)!)) },
        ),
      );
    }
    if (
      scope.feedbackId &&
      !sources.some((s) => s.key === `publication:${scope.feedbackId}`)
    )
      throw new AppError("Опубликованное сообщение недоступно.", 404);
    if (staff) {
      const [scoring, currentInput, assessments, reviews, interviews, rawRuns] =
        await Promise.all([
          scoringView(app.id),
          scoringInput(db, app.id),
          db.assessment.findMany({
            where: { applicationId: app.id },
            include: { author: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          }),
          db.domainReview.findMany({
            where: { applicationId: app.id },
            orderBy: { createdAt: "desc" },
          }),
          db.interview.findMany({
            where: { applicationId: app.id },
            orderBy: { scheduledAt: "desc" },
          }),
          db.scoringRun.findMany({
            where: {
              applicationId: app.id,
              context: "OFFICIAL",
              status: "COMPLETED",
            },
            select: { id: true, input: true },
          }),
        ]);
      for (const run of scoring.runs.filter(
        (r) => r.status === "COMPLETED" && r.result,
      )) {
        const input = rawRuns.find((r) => r.id === run.id)
          ?.input as unknown as ScoringInput;
        if (
          !input ||
          input.sources.some(
            (s) =>
              !sourceKeys.has(s.id) ||
              currentInput.sources.find((c) => c.id === s.id)?.text !== s.text,
          )
        )
          continue;
        let result: ScoringResult;
        try {
          result = validateScoringResult(run.result, input);
        } catch {
          continue;
        }
        const dependencies = dep(
          input.sources.map((s) => sourceKeys.get(s.id)!),
        );
        const key = `scoring:${run.id}`;
        add(
          profileSource(
            key,
            `Предложение системы · ${date(run.createdAt)}`,
            scoringText(result, scope.domain),
            "scoring",
            "Система предложила предварительную интерпретацию",
            {
              dependencies,
              current: run.current,
              kind: `Критерии ${run.criteriaVersion}`,
            },
          ),
        );
        for (const e of result.evidence) {
          const own = input.sources.find((s) => s.id === e.sourceId)!;
          add(
            profileSource(
              `evidence:${run.id}:${e.id}`,
              own.title,
              e.quote,
              "source",
              e.explanation,
              {
                dependencies: dep([sourceKeys.get(e.sourceId)!]),
                current: run.current,
                kind: own.kind,
              },
            ),
          );
        }
        for (const h of run.reviews)
          add(
            profileSource(
              `human:${h.id}`,
              `Интерпретация сотрудника · ${h.author} · ${date(h.createdAt)}`,
              `${h.reason}\n\n${scoringText(h.result, scope.domain)}`,
              "human",
              "Сотрудник подтвердил или изменил интерпретацию; это не публикация",
              { dependencies: dep([key]), current: run.current },
            ),
          );
        if (run.current) {
          const effective = run.reviews[0]?.result ?? result;
          consistency.push({
            sourceKey: run.reviews[0] ? `human:${run.reviews[0].id}` : key,
            text: [
              ...effective.domains
                .filter((d) => !scope.domain || d.domain === scope.domain)
                .map((d) => `${d.domain}: ${d.consistency}.`),
              ...effective.contradictions.map((x) => x.text),
            ].join("\n"),
          });
          for (const q of (run.reviews[0]?.result ?? result).questions)
            questions.push({
              text: q.text,
              gap: q.gap,
              sourceKey: sourceKeys.get(q.sourceId)!,
              action: {
                key: `atola:${run.id}:${q.id}`,
                label: `В ATOLA: ${q.text}`,
                kind: "ATOLA",
                runId: run.id,
                questionId: q.id,
                sourceId: q.sourceId,
              },
            });
          if (run.reviews.length)
            feedbackAction = {
              key: `feedback:${run.id}`,
              kind: "FEEDBACK",
              label: "Подготовить сообщение кандидату",
              runId: run.id,
            };
        }
      }
      for (const a of assessments.filter(
        (a) =>
          (!scope.domain || a.domain === scope.domain) &&
          a.sourceIds.length &&
          a.sourceIds.every((id) => sourceKeys.has(id)),
      ))
        add(
          profileSource(
            `assessment:${a.id}`,
            `${a.domain} · ${a.author.name} · ${date(a.createdAt)}`,
            `Уровень: ${a.level}. Достаточность: ${a.sufficiency}. ${a.contradiction}. ${a.interpretation}\nКритерии: ${a.rubricVersion}`,
            "human",
            "Человеческая оценка материалов",
            {
              dependencies: dep(a.sourceIds.map((id) => sourceKeys.get(id)!)),
              current: a.materialVersion === currentInput.materialVersion,
            },
          ),
        );
      for (const r of reviews.filter(
        (r) =>
          (!scope.domain || r.domain === scope.domain) &&
          r.sourceIds.length &&
          r.sourceIds.every((id) => sourceKeys.has(id)),
      ))
        add(
          profileSource(
            `review:${r.id}`,
            r.domain,
            `${r.sufficiency}. ${r.consistency}.\n${r.observation}\nВопрос: ${r.question}`,
            "review",
            "Заметка сотрудника по материалам",
            {
              dependencies: dep(r.sourceIds.map((id) => sourceKeys.get(id)!)),
              current: r.materialVersion === currentInput.materialVersion,
            },
          ),
        );
      for (const i of interviews) {
        const p = planSchema.safeParse(i.plan),
          r = resultSchema.safeParse(i.result);
        if (
          p.success &&
          p.data.questions.every(
            (q) => !q.sourceId || sourceKeys.has(q.sourceId),
          )
        )
          add(
            profileSource(
              `plan:${i.id}`,
              `Подготовка ATOLA · версия ${i.revision}`,
              `${p.data.notes}\n${p.data.questions.map((q) => q.text).join("\n")}`,
              "plan",
              "Подготовка; не наблюдение состоявшейся встречи",
              {
                dependencies: dep(
                  p.data.questions
                    .filter((q) => q.sourceId)
                    .map((q) => sourceKeys.get(q.sourceId)!),
                ),
                href: `/admissions/interviews/${i.id}`,
              },
            ),
          );
        if (i.status === "COMPLETED" && r.success)
          add(
            profileSource(
              `interview:${i.id}`,
              `Состоявшаяся встреча · ${i.performedAt ? date(i.performedAt) : "дата не указана"}`,
              `${Object.values(r.data.answers).join("\n")}\n${r.data.observation}\n${r.data.conclusion}`,
              "interview",
              "Зафиксировано сотрудником после явного подтверждения встречи",
              {
                dependencies: dep([...sourceKeys.values()]),
                href: `/admissions/interviews/${i.id}`,
              },
            ),
          );
      }
    }
  }
  // Stable scope and hash exclude viewer names and private data from the opposite audience.
  const unique = [...new Map(sources.map((s) => [s.key, s])).values()];
  const audience = staff ? "STAFF" : "CANDIDATE";
  const scopeKey = `${audience}:${staff ? app!.id : "self"}:${scope.attemptId ?? "all"}:${scope.revision ?? "latest"}:${scope.feedbackId ?? "all"}:${scope.domain ?? "all"}`;
  const hash = digest({
    version: profileVersion,
    audience,
    sources: unique,
    works,
    questions,
    consistency,
    feedbackAction,
  });
  return {
    audience,
    applicationId: app?.id,
    scopeKey,
    hash,
    sources: unique,
    works,
    questions,
    consistency,
    feedbackAction,
  };
}
