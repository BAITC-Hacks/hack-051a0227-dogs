import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { skillNode } from "../src/lib/skill-tree-catalog";
const db = new PrismaClient();
const scenarios: Record<string, { done: string[]; draft?: string }> = {
  "intake.browser.20260927@candidate.local": { done: ["l-choice", "l-own", "l-delegate", "t-quiet", "t-roles", "t-feedback", "t-ideas", "c-one", "c-scene", "c-simple", "c-question", "c-slide", "e-listen", "e-detail", "e-clear", "e-discuss"], draft: "e-speak" },
  "intake.leya@candidate.local": { done: ["t-quiet", "t-roles", "t-paraphrase", "t-feedback", "t-ideas", "t-common", "c-one", "c-scene", "c-turn", "e-listen", "e-clear"], draft: "t-receive" },
  "intake.amir@candidate.local": { done: ["l-choice", "l-own", "l-open", "l-delegate", "l-repair", "c-one", "c-simple", "e-listen", "e-discuss"], draft: "l-start" },
  "intake.dana@candidate.local": { done: ["c-one", "c-scene", "c-simple", "c-question", "c-slide", "c-turn", "t-quiet", "t-paraphrase", "e-listen", "e-detail", "e-clear"], draft: "c-pitch" },
  "sofia@candidate.local": { done: ["t-quiet", "t-roles", "t-feedback", "c-one", "c-scene", "c-question", "e-listen", "e-discuss"], draft: "t-ideas" },
};
const stories: Record<string, { project: string; action: string; result: string }> = {
  "Мира Книжная": { project: "обмен книгами между общежитиями", action: "сверила записи выдачи и разделила повторные запросы", result: "команда стала видеть, какие книги уже обещаны другим" },
  "Лея Соколова": { project: "студенческий клуб дискуссий", action: "собрала вопросы тихих участников до встречи", result: "в обсуждении появились аргументы, которые раньше не звучали" },
  "Амир Таласов": { project: "открытая мастерская электроники", action: "проверил безопасность рабочих мест и распределил инструменты", result: "новички смогли закончить сборку без очереди к одному столу" },
  "Дана Озёрная": { project: "короткая серия интервью со студентами", action: "сократила вопросы и сравнила ответы с исходной гипотезой", result: "команда изменила тему следующего выпуска" },
  "София Ким": { project: "навигация для новых студентов", action: "проверила маршрут вместе с двумя первокурсниками", result: "выявила место, где указатель был непонятен" },
};
function response(id: string, name: string) {
  const n = skillNode(id)!;
  if (["QUIZ", "READING", "VIDEO"].includes(n.type)) return { choice: n.choices!.find((c) => c.correct)!.id };
  if (["BRANCHING_SCENARIO", "DIALOGUE"].includes(n.type)) return { choice: n.choices![0].id, followup: n.followup!.choices[0].id };
  if (n.type === "SORTING") return { order: n.expectedOrder };
  const story = stories[name] ?? { project: "студенческий проект", action: "проверила исходные сведения", result: "увидела, что нужно уточнить следующий шаг" };
  const specific: Record<string, string> = {
    "c-one": `Первокурснику: в проекте «${story.project}» тебе будет проще найти нужную помощь. Преподавателю: я ${story.action}, чтобы предложение опиралось на наблюдение. Человеку, который поддерживает проект: ${story.result}; дальше мы проверим это на небольшой группе.`,
    "c-turn": `Сначала я думала, что достаточно рассказать о проекте «${story.project}». Потом я ${story.action} и заметила конкретное изменение: ${story.result}. В выступлении я назову этот поворот и скажу, какие выводы ещё нельзя делать.`,
    "t-common": `Общий результат встречи — сделать проект «${story.project}» полезным для новых участников. От первой идеи возьмём понятный личный разговор, от второй — короткую открытую инструкцию. Я ${story.action}. Через неделю сравним вопросы участников и проверим, стало ли им легче начать.`,
    "l-start": `Я предложу за неделю проверить маленькое улучшение проекта «${story.project}». Сначала узнаю, кому мешает текущий порядок, затем ${story.action}. Команде покажу одну понятную запись результата: ${story.result}. Если изменений не будет, пересмотрю идею вместе с участниками.`,
    "c-pitch": `Проблема: новым участникам трудно понять, как работает проект «${story.project}». Мы предлагаем ясный первый шаг и короткую проверку на месте. Я ${story.action}. После этого ${story.result}. Это небольшой пример, а не доказательство для всех. Какие вопросы остались бы у вас перед следующим тестом?`,
    "t-receive": `Если мне скажут, что мой вклад в проект «${story.project}» трудно использовать, я попрошу показать конкретный момент. Я ${story.action}, но могла упустить взгляд новичка. Исправлю объяснение и попрошу проверить, помогает ли новый вариант; ожидаемый признак — ${story.result}.`,
  };
  return { text: specific[id] ?? `В проекте «${story.project}» я ${story.action}. Сначала уточню ограничение и предложу команде два возможных действия. Через неделю проверю, произошло ли ожидаемое изменение: ${story.result}. Если факт не подтвердится, назову это честно и изменю план.` };
}
async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  const app = new URL(process.env.APP_ORIGIN ?? "http://invalid");
  if (process.argv[2] !== "--apply" || process.env.SKILL_DEMO_DB !== database.pathname.slice(1) || !["localhost", "127.0.0.1"].includes(database.hostname) || !["localhost", "127.0.0.1"].includes(app.hostname)) throw new Error("Use --apply with explicit local SKILL_DEMO_DB and APP_ORIGIN");
  for (const [email, plan] of Object.entries(scenarios)) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !["SEED", "INTAKE_BROWSER_20260927", "INTAKE_EXAMPLES_20260927"].includes(user.origin)) continue;
    for (const [index, id] of plan.done.entries()) {
      const node = skillNode(id)!;
      const existing = await db.learningCompletion.findUnique({ where: { userId_nodeId: { userId: user.id, nodeId: id } } });
      if (existing) {
        const oldAttempt = await db.learningAttempt.findUnique({ where: { id: existing.attemptId } });
        if (oldAttempt?.origin === "DEVELOPMENT_SEED_20260928" && ["TEXT_RESPONSE", "REFLECTION", "SUBMISSION"].includes(node.type))
          await db.learningAttempt.update({ where: { id: oldAttempt.id }, data: { response: response(id, user.name) as Prisma.InputJsonValue } });
        continue;
      }
      const at = new Date(Date.UTC(2026, 8, 12 + index, 10 + (index % 5)));
      await db.$transaction(async (tx) => {
        const attempt = await tx.learningAttempt.create({ data: { userId: user.id, nodeId: id, contentVersion: node.version, response: response(id, user.name) as Prisma.InputJsonValue, status: "COMPLETED", origin: "DEVELOPMENT_SEED_20260928", requestKey: randomUUID(), createdAt: at, completedAt: at } });
        const completion = await tx.learningCompletion.create({ data: { userId: user.id, nodeId: id, contentVersion: node.version, attemptId: attempt.id, origin: "DEVELOPMENT_SEED_20260928", completedAt: at } });
        await tx.uPointEntry.create({ data: { userId: user.id, source: "SKILL_TREE", nodeId: id, rewardVersion: node.rewardVersion, amount: node.reward, reason: `Завершён шаг «${node.title}»`, idempotencyKey: `skill:${user.id}:${id}`, completionId: completion.id, createdAt: at } });
      });
    }
    const priorDraft = plan.draft ? await db.learningAttempt.findFirst({ where: { userId: user.id, nodeId: plan.draft, status: "DRAFT" } }) : null;
    if (plan.draft && priorDraft?.origin === "DEVELOPMENT_SEED_20260928" && skillNode(plan.draft)?.type !== "AUDIO_RESPONSE")
      await db.learningAttempt.update({ where: { id: priorDraft.id }, data: { response: response(plan.draft, user.name) as Prisma.InputJsonValue } });
    if (plan.draft && !priorDraft) {
      const node = skillNode(plan.draft)!;
      await db.learningAttempt.create({ data: { userId: user.id, nodeId: node.id, contentVersion: node.version, response: node.type === "AUDIO_RESPONSE" ? {} : response(node.id, user.name) as Prisma.InputJsonValue, status: "DRAFT", origin: "DEVELOPMENT_SEED_20260928", requestKey: randomUUID() } });
    }
    const points = await db.uPointEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } });
    console.log(`${user.name}: ${plan.done.length} шагов, ${points._sum.amount ?? 0} U`);
  }
}
main().finally(() => db.$disconnect());
