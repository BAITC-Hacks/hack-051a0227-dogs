import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { checkQuality } from "../tests/quality/check";
import { db } from "../src/lib/db";
async function main() {
  try {
    const report = await checkQuality();
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
