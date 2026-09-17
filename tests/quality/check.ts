import assert from "node:assert/strict";
import { domains } from "../../src/lib/catalog";
import {
  qualityCases,
  controlPackage,
  controlInput,
  qualityCaseVersion,
} from "../../src/lib/quality-cases.server";
import {
  validateScoringResult,
  type ScoringResult,
} from "../../src/lib/scoring-contract";
import {
  LocalAssessmentProvider,
  ExternalAssessmentProvider,
  isolatedAssessmentEnvironment,
} from "../../src/lib/scoring-provider.server";
import { digest } from "../../src/lib/scoring-input.server";
import { prepareTwin } from "../../src/lib/twin-cases.server";
import { compareTwin } from "../../src/lib/twin-contract";
import { humanComparisonIssue } from "../../src/lib/comparison";
import { runtimeChecks } from "./runtime";
import { expectations, twinExpectations } from "./expectations";
export const propertyLabels: Record<string, string> = {
  runtime_setup:
    "Изолированный серверный прогон и очистка только своих QA-записей",
  source_access: "Существование и доступность источника в разрешённом пакете",
  quote_binding: "Привязка цитаты к тексту и версии (не истинность вывода)",
  ownership_domain:
    "Принадлежность оснований пакету заявки и допустимая область",
  scale: "Шкала, критерии и допустимость сравнения",
  missing_rating: "Отсутствие оценки представлено без нуля",
  episodes: "Повторы одного эпизода не повышают уровень",
  freshness: "Актуальность после новых сведений",
  human_history: "Сохранение исходной и человеческой интерпретаций",
  role_access: "Права кандидата и сотрудника",
  profile_privacy: "Раздельный контекст и закрытие производной истории",
  twin: "Воспроизводимость контрольных Fairness Twin пар",
  negative_controls: "Обнаружение намеренно повреждённых результатов",
  corrupt_read: "Повторная проверка сохранённого результата при чтении",
  scenario_limits: "Факты и границы конкретной контрольной истории",
  workflow_isolation: "Изоляция режимов и человеческих измерений",
  workflow_persistence: "Сохранение рабочих сессий и расчёт пауз",
  no_network: "Отсутствие внешнего транспорта",
  semantic_support:
    "Человеческое подтверждение смысловой поддержки интерпретации",
};
export type QualityCheck = {
  id: string;
  property: string;
  caseId: string;
  detail: string;
  passed: boolean;
  error?: string;
};
export async function checkQuality() {
  if (!isolatedAssessmentEnvironment())
    throw new Error(
      "quality:check требует ASSESSMENT_ENVIRONMENT=isolated-local и локальную БД",
    );
  const checks: QualityCheck[] = [],
    unchecked: Record<string, string[]> = {
      semantic_support: qualityCases.map(
        (c) => `${c.key}: экспертная смысловая разметка не проводилась`,
      ),
    };
  const probe = async (
    property: string,
    caseId: string,
    detail: string,
    fn: () => unknown | Promise<unknown>,
  ) => {
    const row: QualityCheck = {
      id: `check-${checks.length + 1}`,
      property,
      caseId,
      detail,
      passed: false,
    };
    try {
      await fn();
      row.passed = true;
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    checks.push(row);
  };
  const previous = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls++;
    throw new Error("quality:check forbids network fetch");
  };
  const cases = [];
  try {
    for (const c of qualityCases) {
      const pack = await controlPackage(c.key),
        expected = expectations[c.key];
      cases.push({
        id: c.key,
        title: c.title,
        inputHash: pack.inputHash,
        materialVersion: pack.input.materialVersion,
        criteriaVersion: pack.input.criteria.version,
        caseVersion: pack.version,
        adapter: "local",
        resultOrigin: [
          "generic",
          "missing",
          "unavailable",
          "criteria",
          "unknown",
        ].includes(c.key)
          ? "structured-fields"
          : "prepared-contract-case",
        input: pack.input,
        result: pack.result,
        limits: expected.limits,
        access:
          "fictional staff-only control packet; annotations not in provider input",
      });
      const r = pack.result;
      await probe(
        "scenario_limits",
        c.key,
        "Полный контракт и ожидаемое действие этой истории",
        () => {
          assert.ok(r, pack.issue ?? "Нет результата");
          assert.equal(r.recommendation.action, expected.action);
          assert.equal(!!r.domains[5].rating, expected.experienced);
          for (const fact of expected.facts)
            assert.ok(
              pack.input.sources.some((s) => s.text.includes(fact)),
              fact,
            );
        },
      );
      if (!r) {
        (unchecked.quote_binding ??= []).push(
          `${c.key}: результат не прошёл валидацию`,
        );
        continue;
      }
      if (!r.evidence.length)
        (unchecked.quote_binding ??= []).push(
          `${c.key}: нет цитат для проверки`,
        );
      for (const e of r.evidence) {
        const s = pack.input.sources.find((s) => s.id === e.sourceId);
        await probe("source_access", c.key, e.id, () => assert.ok(s));
        await probe("quote_binding", c.key, e.id, () => {
          assert.ok(s?.text.includes(e.quote));
          assert.equal(s?.version, e.sourceVersion);
        });
      }
      for (const d of r.domains) {
        await probe("ownership_domain", c.key, d.domain, () => {
          assert.ok(domains.includes(d.domain));
          for (const id of d.evidenceIds) {
            const e = r.evidence.find((e) => e.id === id);
            assert.ok(e && pack.input.sources.some((s) => s.id === e.sourceId));
          }
        });
        if (!d.rating)
          await probe("missing_rating", c.key, d.domain, () =>
            assert.equal(d.rating, null),
          );
      }
      await probe("scale", c.key, "Общий валидатор критериев и шкал", () =>
        validateScoringResult(r, pack.input),
      );
      await probe(
        "scenario_limits",
        c.key,
        "Чувствительная область не получает автоматическую оценку или вопрос",
        () => {
          assert.equal(r.domains[8].rating, null);
          assert.ok(!r.questions.some((q) => q.domain === domains[8]));
        },
      );
    }
    await probe(
      "scenario_limits",
      "conflict",
      "Отсутствующий языковой ответ не называется ожидающим проверки",
      async () => {
        const pack = await controlPackage("conflict");
        assert.equal(pack.input.language, null);
        assert.ok(!pack.result!.recommendation.reason.includes("Английский"));
      },
    );
    const rich = await controlPackage("rich"),
      original = rich.result!;
    for (const [name, mutate] of Object.entries({
      foreign_source: (r: ScoringResult) => {
        r.evidence[0].sourceId = "foreign-application-source";
      },
      wrong_quote: (r: ScoringResult) => {
        r.evidence[0].quote = "Не существующий в источнике фрагмент";
      },
      stale_version: (r: ScoringResult) => {
        r.evidence[0].sourceVersion = "old-version";
      },
      wrong_scale: (r: ScoringResult) => {
        r.domains[2].rating = { value: 97, label: "Высокий потенциал" };
      },
    }))
      await probe("negative_controls", "rich", name, () => {
        const broken = structuredClone(original);
        mutate(broken);
        assert.throws(() => validateScoringResult(broken, rich.input));
      });
    await probe(
      "freshness",
      "clarified",
      "Несовпадение хеша не использует подготовленную историю",
      async () => {
        const input = controlInput("clarified"),
          provider = new LocalAssessmentProvider("ASSESSMENT_QA", {
            inputHash: rich.inputHash,
            scenarioVersion: "check",
            result: original,
          });
        const result = validateScoringResult(
          await provider.assess(input, {
            inputHash: digest(input),
            scenarioVersion: "check",
          }),
          input,
        );
        assert.equal(result.state, "REQUIRES_REVIEW");
        assert.ok(result.domains.every((d) => d.rating === null));
      },
    );
    await probe(
      "episodes",
      "duplicate",
      "Несколько источников того же проекта не повышают уровень",
      async () => {
        const d = await controlPackage("duplicate");
        assert.equal(
          new Set(d.input.sources.map((s) => s.episodeId).filter(Boolean)).size,
          1,
        );
        const r = structuredClone(d.result!);
        r.domains[5].rating = { value: null, label: "Устойчивое проявление" };
        assert.throws(
          () => validateScoringResult(r, d.input),
          /REPEATED_EPISODE/,
        );
      },
    );
    await probe(
      "scenario_limits",
      "sensitive",
      "Отказ раскрывать обстоятельства не снижает оценку опыта",
      async () => {
        const s = (await controlPackage("sensitive")).result!;
        assert.deepEqual(
          s.domains.map((d) => d.rating),
          original.domains.map((d) => d.rating),
        );
      },
    );
    await probe(
      "scale",
      "criteria",
      "Историческая и несовместимая человеческая оценка исключены из сравнения",
      () => {
        assert.ok(
          humanComparisonIssue(
            { rubricVersion: 1, materialVersion: "old" },
            "new",
            [],
          ),
        );
        assert.ok(
          humanComparisonIssue(
            { rubricVersion: 1, materialVersion: "current" },
            "current",
            [{ rubricVersion: 2, materialVersion: "current" }],
          ),
        );
      },
    );
    for (const [key, expected] of Object.entries(twinExpectations))
      await probe("twin", "rich", key, () => {
        const pair = prepareTwin(
          controlInput("rich"),
          key as Parameters<typeof prepareTwin>[1],
        );
        const run = (side: "A" | "B") => ({
          status: "COMPLETED",
          inputHash: pair.variants[side].inputHash,
          result: pair.prepared[side].result,
        });
        const first = compareTwin(pair, run("A"), run("B"));
        assert.equal(first.state, expected);
        assert.deepEqual(compareTwin(pair, run("A"), run("B")), first);
      });
    await probe(
      "runtime_setup",
      "unknown",
      "Подготовка, серверный проход и адресная очистка",
      () => runtimeChecks(probe),
    );
    await probe(
      "no_network",
      "unknown",
      "Внешний транспорт закрыт; локальный прогон не вызвал fetch",
      async () => {
        await assert.rejects(
          new ExternalAssessmentProvider().assess(rich.input, {
            inputHash: rich.inputHash,
            scenarioVersion: "check",
          }),
        );
        assert.equal(networkCalls, 0);
      },
    );
  } finally {
    globalThis.fetch = previous;
  }
  const metrics = Object.entries(propertyLabels).map(([property, label]) => {
    const items = checks.filter((c) => c.property === property);
    const numerator = items.filter((c) => c.passed).length,
      denominator = items.length;
    return {
      property,
      label,
      numerator,
      denominator,
      result: denominator
        ? numerator === denominator
          ? "PASS"
          : "FAIL"
        : "UNMEASURED",
      unchecked:
        unchecked[property] ??
        (denominator
          ? []
          : ["Проверки свойства не выполнены; см. ошибки серверного прогона"]),
      errors: items.filter((c) => !c.passed).map((c) => `checks/${c.id}`),
    };
  });
  return {
    version: qualityCaseVersion,
    generatedAt: new Date().toISOString(),
    externalCalls: networkCalls,
    expertAnnotations: 0,
    metrics,
    cases,
    checks,
    limitations: [
      "Подготовленные ответы проверяют контракт и обработку, не извлечение или точность модели.",
      "Принадлежность области проверяется структурно; смысловую поддержку проверяет отдельная человеческая разметка.",
      "Официальные исходы поступления не используются как правильные метки.",
    ],
  };
}
