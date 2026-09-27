import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { checkQuality } from "../tests/quality/check";
import { db } from "../src/lib/db";
async function main() {
  try {
    const report = await checkQuality();
    const detector = JSON.parse(await readFile("data/essay-detector/model.json", "utf8")) as {
      source: string; scope: string; sampleCounts: { train: number; validation: number; test: number };
      baseline: string;
      baselineTestMetrics: { n: number; f1_binary: number | null; falsePositiveRate: number | null; confusion: Record<string, number> };
      testMetrics: { n: number; precision: number | null; recall: number | null; f1_binary: number | null;
        falsePositiveRate: number | null; averagePrecision: number | null; brier: number | null;
        confusion: Record<string, number> };
      crossValidation: { n: number; f1_binary: number | null; falsePositiveRate: number | null }[];
    };
    await mkdir(".local/quality", { recursive: true });
    await writeFile(
      ".local/quality/report.json",
      JSON.stringify(report, null, 2),
    );
    const summary = [
      "# Контрольная проверка",
      `Набор ${report.version}. Случаев: ${report.cases.length}. Внешних вызовов: ${report.externalCalls}.`,
      "",
      ...report.metrics.map(
        (m) =>
          `- ${m.label}: ${m.denominator ? `${m.numerator}/${m.denominator} · ${m.result}` : "Не измерено (знаменатель 0)"}.${m.unchecked.length ? ` Не проверено: ${m.unchecked.join("; ")}.` : ""}${m.errors.length ? ` Ошибки: ${m.errors.join(", ")}.` : ""}`,
      ),
      "",
      ...report.limitations,
      "",
      "## Детектор текста: технический набор, не заявки",
      `Источник: ${detector.source}. Область: ${detector.scope}.`,
      `Разбиение: обучение ${detector.sampleCounts.train}, подбор ${detector.sampleCounts.validation}, финальная проверка ${detector.sampleCounts.test}.`,
      `Групповая CV на обучающей части: ${detector.crossValidation.map((fold, index) => `fold ${index + 1}: n=${fold.n}, F1=${fold.f1_binary ?? "не определён"}, FPR=${fold.falsePositiveRate ?? "не определён"}`).join("; ")}.`,
      `Baseline (${detector.baseline}) на том же финальном разбиении: n=${detector.baselineTestMetrics.n}, F1=${detector.baselineTestMetrics.f1_binary ?? "не определён"}, FPR=${detector.baselineTestMetrics.falsePositiveRate ?? "не определён"}. Матрица: ${JSON.stringify(detector.baselineTestMetrics.confusion)}.`,
      `Финальная проверка n=${detector.testMetrics.n}: precision=${detector.testMetrics.precision ?? "не определён"}, recall=${detector.testMetrics.recall ?? "не определён"}, F1=${detector.testMetrics.f1_binary ?? "не определён"}, FPR=${detector.testMetrics.falsePositiveRate ?? "не определён"}, Average Precision=${detector.testMetrics.averagePrecision ?? "не определён"}, Brier=${detector.testMetrics.brier ?? "не определён"}. Матрица: ${JSON.stringify(detector.testMetrics.confusion)}.`,
      "Эти метрики не подтверждают пригодность для вступительных эссе и не используются как основание решения.",
      "",
      ...report.checks
        .filter((c) => !c.passed)
        .map((c) => `## checks/${c.id}\n${c.caseId}: ${c.detail}\n${c.error}`),
    ].join("\n");
    await writeFile(".local/quality/report.md", summary);
    console.log(summary);
    console.log(
      "\nJSON: .local/quality/report.json\nОтчёт: .local/quality/report.md",
    );
    if (report.metrics.some((m) => m.result === "FAIL")) process.exitCode = 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
