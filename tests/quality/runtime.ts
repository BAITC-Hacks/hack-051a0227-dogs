import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../../src/lib/db";
import { cleanupRun } from "../cleanup";
import { controlInput } from "../../src/lib/quality-cases.server";
import { emptyFields } from "../../src/lib/validation";
import { initialState } from "../../src/lib/projects";
import {
  scoringAction,
  processScoringRun,
  scoringView,
  requireCurrentScoring,
} from "../../src/lib/scoring-service.server";
import { scoringInput, digest } from "../../src/lib/scoring-input.server";
import { collectProfile } from "../../src/lib/profile-context.server";
import {
  profileAction,
  profileView,
} from "../../src/lib/profile-service.server";
import type { ProfileTurnView } from "../../src/lib/profile-contract";
import type { ScoringResult } from "../../src/lib/scoring-contract";
import { assertApplication } from "../../src/lib/security";
import {
  workflowAction,
  workflowView,
  workflowRows,
} from "../../src/lib/workflow-service.server";
import {
  workflowSummary,
  workflowTime,
  type WorkflowView,
} from "../../src/lib/workflow-contract";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export type Probe = (
  property: string,
  caseId: string,
  detail: string,
  fn: () => unknown | Promise<unknown>,
) => Promise<void>;
export async function runtimeChecks(probe: Probe) {
  const emails: string[] = [];
  const create = async (role: string) => {
    const email = `quality-${randomUUID()}@qa.local`;
    emails.push(email);
    return db.user.create({
      data: { email, name: "Контроль проверки", role, origin: "QA" },
    });
  };
  try {
    const candidate = await create("CANDIDATE"),
      other = await create("CANDIDATE"),
      staff = await create("STAFF");
    const fields = {
      ...emptyFields,
      ...controlInput("unknown").facts,
      email: candidate.email!,
      processing: true,
    };
    const app = await db.application.create({
      data: {
        userId: candidate.id,
        origin: "QA",
        programSlug: "digital-products",
        fields: json(fields),
        submittedAt: new Date(),
        revision: 1,
        stage: "REVIEW",
        versions: {
          create: {
            kind: "SUBMITTED",
            revision: 1,
            snapshot: json({ fields, transferredIds: [] }),
          },
        },
      },
    });
    const source = await db.source.create({
      data: {
        applicationId: app.id,
        title: "Опыт и личная роль",
        kind: "Анкета",
        content: `${fields.experience}\n\nЛичная роль: ${fields.personalRole}`,
      },
    });
    const work = await db.projectAttempt.create({
      data: {
        userId: candidate.id,
        slug: "digital-products",
        revision: 1,
        state: json(initialState),
        versions: {
          create: {
            revision: 1,
            state: json(initialState),
            feedback: json({
              title: "Личная работа",
              checks: [],
              next: "Доработать",
            }),
          },
        },
      },
    });
    const scope = { applicationId: app.id };
    const run = (await scoringAction("scoring.launch", scope, staff)) as {
      id: string;
    };
    await processScoringRun(run.id);
    const initial = (await scoringView(app.id)).runs[0];
    if (!initial.result)
      throw new Error("Контрольная обработка не завершилась");
    const human = structuredClone(initial.result);
    human.summary =
      "Сотрудник сохранил собственную интерпретацию: личное действие нужно обсудить.";
    await scoringAction(
      "scoring.review",
      {
        ...scope,
        runId: run.id,
        baseReviewId: null,
        requestKey: randomUUID(),
        reason: "Результат просмотрен; личное действие требует уточнения.",
        rejectedEvidenceIds: [],
        result: human,
      },
      staff,
    );
    await probe(
      "human_history",
      "unknown",
      "Исходное предложение и человеческая версия сохранены отдельно",
      async () => {
        const v = (await scoringView(app.id)).runs[0];
        assert.equal(v.result!.summary, initial.result!.summary);
        assert.equal(v.reviews[0].result.summary, human.summary);
      },
    );
    await probe(
      "role_access",
      "unknown",
      "Кандидат не запускает скоринг и не открывает чужую заявку",
      async () => {
        await assert.rejects(scoringAction("scoring.launch", scope, candidate));
        await assert.rejects(assertApplication(app.id, other));
        await assert.rejects(collectProfile(other, scope));
      },
    );
    await probe(
      "profile_privacy",
      "unknown",
      "Разные контексты собраны до провайдера",
      async () => {
        const c = await collectProfile(candidate, scope),
          s = await collectProfile(staff, scope);
        assert.ok(
          !c.sources.some((x) =>
            ["scoring", "human", "review"].includes(x.group),
          ),
        );
        assert.equal(s.works.length, 0);
        assert.ok(!JSON.stringify(s).includes(work.id));
        await assert.rejects(
          profileAction(
            "profile.ask",
            {
              scope,
              topic: "assessment",
              question: "Объяснить оценку",
              requestKey: randomUUID(),
            },
            candidate,
          ),
        );
      },
    );
    const answer = (await profileAction(
      "profile.ask",
      {
        scope,
        topic: "grounds",
        question: "Показать основания",
        requestKey: randomUUID(),
      },
      staff,
    )) as ProfileTurnView;
    const beforeInput = await scoringInput(db, app.id);
    await db.source.create({
      data: {
        applicationId: app.id,
        title: "Ответ в переписке",
        kind: "Уточнение",
        content: "Два дежурства изменены после проверки расписания групп.",
      },
    });
    await probe(
      "freshness",
      "clarified",
      "Новое уточнение меняет хеш, старый результат и действие не актуальны",
      async () => {
        assert.notEqual(
          digest(await scoringInput(db, app.id)),
          digest(beforeInput),
        );
        assert.equal((await scoringView(app.id)).runs[0].current, false);
        await assert.rejects(requireCurrentScoring(db, app.id, run.id));
        const old = await db.applicationVersion.findFirstOrThrow({
          where: { applicationId: app.id },
        });
        assert.deepEqual((old.snapshot as { fields: unknown }).fields, fields);
      },
    );
    await probe(
      "human_history",
      "clarified",
      "Новое уточнение не удаляет человеческую версию",
      async () =>
        assert.equal(
          (await scoringView(app.id)).runs[0].reviews[0].result.summary,
          human.summary,
        ),
    );
    await db.source.delete({ where: { id: source.id } });
    await probe(
      "profile_privacy",
      "unavailable",
      "Удалённый источник закрывает производный ответ в истории",
      async () => {
        const history = (await profileView(staff, scope)).history;
        const old = history.find((r) => r.id === answer.id);
        assert.ok(old);
        assert.equal(old.answer, null);
      },
    );
    await probe(
      "source_access",
      "unavailable",
      "Чужой пользователь не открывает источник из профильного ответа",
      async () => {
        const stored = await db.profileAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        });
        assert.equal(stored.userId, staff.id);
        await assert.rejects(
          profileAction(
            "profile.source",
            { scope, answerId: answer.id, sourceKey: `source:${source.id}` },
            other,
          ),
        );
      },
    );
    await probe(
      "corrupt_read",
      "rich",
      "Повреждённая сохранённая цитата не отображается в карточке",
      async () => {
        const bad = structuredClone(initial.result) as ScoringResult;
        bad.evidence[0].quote = "Несуществующая цитата";
        await db.scoringRun.update({
          where: { id: run.id },
          data: { result: json(bad) },
        });
        const v = (await scoringView(app.id)).runs[0];
        assert.equal(v.status, "UNAVAILABLE");
        assert.equal(v.result, null);
      },
    );
    const officialBefore = await db.application.findUniqueOrThrow({
      where: { id: app.id },
      include: {
        assessments: true,
        decisions: true,
        versions: true,
        feedback: true,
        scoringRuns: true,
      },
    });
    const key = randomUUID(),
      start = {
        caseKey: "rich",
        participant: `auto-${randomUUID().slice(0, 8)}`,
        technical: true,
        familiar: false,
        familiarityNote: "Автоматическая контрактная проверка",
        mode: "MATERIALS",
        requestKey: key,
      };
    let s = (await workflowAction(
      "workflow.start",
      start,
      staff,
    )) as WorkflowView;
    await probe(
      "workflow_isolation",
      "rich",
      "Базовый режим не передаёт профиль; запуск идемпотентен; права проверяются",
      async () => {
        assert.equal(s.profile, null);
        assert.equal(s.profileVersion, null);
        assert.equal(
          (
            (await workflowAction(
              "workflow.start",
              start,
              staff,
            )) as WorkflowView
          ).id,
          s.id,
        );
        await assert.rejects(workflowView(s.id, candidate));
        await assert.rejects(
          workflowAction("workflow.start", start, candidate),
        );
      },
    );
    const entered = {
      evidence: "Личное действие связано с проверкой двух расписаний.",
      sourceIds: [s.input.sources[0].id],
      questions: "Как учитывали повторных посетителей?",
      nextAction: "INTERVIEW",
      reason: "Обсудить учёт результата и применение вывода.",
      errors: "",
      corrections: "Уточнено: один эпизод, а не четыре независимых проекта.",
    };
    s = (await workflowAction(
      "workflow.pause",
      { id: s.id, revision: s.revision, work: entered },
      staff,
    )) as WorkflowView;
    await probe(
      "workflow_persistence",
      "rich",
      "Пауза и заметки сохранены; конфликт не перезаписывает ответ",
      async () => {
        assert.equal((await workflowView(s.id, staff)).status, "PAUSED");
        assert.deepEqual((await workflowView(s.id, staff)).work, entered);
        await assert.rejects(
          workflowAction(
            "workflow.save",
            { id: s.id, revision: s.revision - 1, work: entered },
            staff,
          ),
        );
        await assert.rejects(
          workflowAction(
            "workflow.complete",
            { id: s.id, revision: s.revision, work: entered },
            staff,
          ),
        );
      },
    );
    s = (await workflowAction(
      "workflow.resume",
      { id: s.id, revision: s.revision, work: entered },
      staff,
    )) as WorkflowView;
    s = (await workflowAction(
      "workflow.complete",
      { id: s.id, revision: s.revision, work: entered },
      staff,
    )) as WorkflowView;
    await probe(
      "workflow_persistence",
      "rich",
      "Завершение неизменно; время исключает только явные паузы",
      async () => {
        assert.equal(s.status, "COMPLETED");
        const t = workflowTime(s);
        assert.equal(t.withoutPausesMs + t.pausedMs, t.elapsedMs);
        await assert.rejects(
          workflowAction(
            "workflow.save",
            { id: s.id, revision: s.revision, work: entered },
            staff,
          ),
        );
      },
    );
    const profile = (await workflowAction(
      "workflow.start",
      { ...start, requestKey: randomUUID(), mode: "PROFILE" },
      staff,
    )) as WorkflowView;
    await probe(
      "workflow_isolation",
      "rich",
      "Режимы имеют те же материалы, знакомство отмечено, официальная заявка неизменна",
      async () => {
        assert.deepEqual(profile.input, s.input);
        assert.ok(profile.profile);
        assert.equal(profile.familiar, true);
        assert.equal(profile.order, 2);
        assert.deepEqual(
          await db.application.findUniqueOrThrow({
            where: { id: app.id },
            include: {
              assessments: true,
              decisions: true,
              versions: true,
              feedback: true,
              scoringRuns: true,
            },
          }),
          officialBefore,
        );
      },
    );
    await probe(
      "workflow_isolation",
      "rich",
      "Технические сессии исключены из человеческих показателей",
      async () => {
        const own = (await workflowRows(staff)).filter(
          (r) => r.participant === start.participant,
        );
        assert.equal(workflowSummary(own).completed, 0);
        assert.equal(workflowSummary(own).technical, 2);
      },
    );
  } finally {
    await cleanupRun(db, emails.slice(0, 2));
    await cleanupRun(db, emails.slice(2));
  }
}
