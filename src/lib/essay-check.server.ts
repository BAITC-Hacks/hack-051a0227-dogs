import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "./db";

export const essayModelVersion = "ru-essay-tfidf-v1";
type Essay = { text: string; language: string };
function submittedEssay(snapshot: unknown): Essay | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const fields = (snapshot as { fields?: { intake?: { essay?: Essay } } }).fields;
  const essay = fields?.intake?.essay;
  return essay && typeof essay.text === "string" && typeof essay.language === "string" && essay.text.trim()
    ? { text: essay.text, language: essay.language }
    : null;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function infer(script: string, artifact: string, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, "infer", artifact], {
      stdio: ["pipe", "pipe", "pipe"] as const,
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1" },
    });
    let output = "";
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 64 * 1024) child.kill();
    });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error("MODEL_PROCESS_FAILED"));
    });
    child.stdin.end(text);
  });
}

async function processEssayCheck(id: string) {
  const claimed = await db.essayCheck.updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING" } });
  if (!claimed.count) return;
  const check = await db.essayCheck.findUniqueOrThrow({ where: { id } });
  try {
    const version = await db.applicationVersion.findFirst({
      where: { id: check.applicationVersionId, applicationId: check.applicationId, kind: "SUBMITTED" },
      select: { snapshot: true },
    });
    const essay = submittedEssay(version?.snapshot);
    if (!essay || hash(essay.text) !== check.textHash) throw new Error("ESSAY_VERSION_CHANGED");
    const words = essay.text.match(/[\p{L}]+/gu) ?? [];
    const cyrillic = essay.text.match(/[а-яё]/giu)?.length ?? 0;
    const latin = essay.text.match(/[a-z]/giu)?.length ?? 0;
    if (check.language.toLowerCase() !== "ru" || !cyrillic || latin > cyrillic * .3) {
      await db.essayCheck.update({ where: { id }, data: { status: "UNSUPPORTED_LANGUAGE", completedAt: new Date() } });
      return;
    }
    if (words.length < 100) {
      await db.essayCheck.update({ where: { id }, data: { status: "TOO_SHORT", completedAt: new Date() } });
      return;
    }
    const root = process.cwd();
    const script = path.join(root, "scripts", "essay-detector.py");
    const artifact = path.join(root, "data", "essay-detector", "model.json");
    const output = JSON.parse(await infer(script, artifact, essay.text)) as { status?: string; score?: number; modelVersion?: string };
    if (output.status !== "TECHNICAL_SIGNAL" || output.modelVersion !== essayModelVersion ||
        typeof output.score !== "number" || !Number.isFinite(output.score) || output.score < 0 || output.score > 1)
      throw new Error("INVALID_MODEL_OUTPUT");
    await db.essayCheck.update({ where: { id }, data: {
      status: "OUT_OF_DOMAIN", signalScore: output.score, completedAt: new Date(),
    } });
  } catch (error) {
    await db.essayCheck.update({ where: { id }, data: {
      status: "FAILED", errorCode: error instanceof Error ? error.message.slice(0, 80) : "PROCESSING_FAILED",
      completedAt: new Date(),
    } });
  }
}

/** Uses the intake event watermark; no model work runs during drafting or rendering. */
export async function runEssayQueueOnce() {
  const applications = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Application" WHERE "submittedAt" IS NOT NULL
      AND "preparationEvent" > "essayPreparedEvent"
    ORDER BY "updatedAt" ASC LIMIT 2`;
  for (const { id } of applications) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${id} FOR UPDATE`;
      const app = await tx.application.findUniqueOrThrow({ where: { id }, select: { preparationEvent: true, essayPreparedEvent: true } });
      if (app.preparationEvent <= app.essayPreparedEvent) return;
      const version = await tx.applicationVersion.findFirst({
        where: { applicationId: id, kind: "SUBMITTED" }, orderBy: { revision: "desc" },
        select: { id: true, snapshot: true },
      });
      const essay = submittedEssay(version?.snapshot);
      if (essay && version) {
        const textHash = hash(essay.text);
        const identity = hash(`${id}:${version.id}:${textHash}:${essayModelVersion}`);
        await tx.essayCheck.upsert({ where: { identity }, update: {}, create: {
          applicationId: id, applicationVersionId: version.id, textHash, modelVersion: essayModelVersion,
          identity, language: essay.language, wordCount: (essay.text.match(/[\p{L}]+/gu) ?? []).length,
        } });
      }
      await tx.application.update({ where: { id }, data: { essayPreparedEvent: app.preparationEvent } });
    });
  }
  const queued = await db.essayCheck.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (queued) await processEssayCheck(queued.id);
}
