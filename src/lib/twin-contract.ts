import {
  validateScoringResult,
  type ScoringInput,
  type ScoringResult,
} from "./scoring-contract";

export const twinRulesVersion = "controlled-pairs-v1";
export const twinStates = {
  MATCH: "Совпадает по проверяемым показателям",
  DIFFERENT: "Есть различия — нужен разбор",
  INCOMPARABLE: "Нельзя сопоставить",
  INCOMPLETE: "Проверка не завершена",
} as const;
export const twinVerdicts = {
  REVIEWED: "Сведения сопоставлены",
  INVALID: "Пара непригодна",
  EXPLAINED: "Различие объяснено",
  UNEXPLAINED: "Необъяснённое расхождение",
} as const;
export type TwinVariant = {
  input: ScoringInput;
  inputHash: string;
  provider: "local" | "external";
  processingVersion: string;
  rulesVersion: string;
  scenarioVersion: string;
  facts: { id: string; label: string; value: string }[];
  sourceLinks: { sourceId: string; key: string; episode: string | null }[];
  evidenceLinks: Record<string, string>;
  gapLinks: Record<string, string>;
  background: { school: string; region: string } | null;
};
export type TwinDefinition = {
  key: string;
  version: string;
  title: string;
  purpose: string;
  factor: string;
  preserved: string[];
  changed: string[];
  domains: string[];
  expected: string;
  suitability: string;
  tolerance: string;
  variants: { A: TwinVariant; B: TwinVariant };
};
export type PreparedTwin = TwinDefinition & {
  prepared: {
    A: { inputHash: string; result: ScoringResult };
    B: { inputHash: string; result: ScoringResult };
  };
};
export type TwinComparison = {
  state: keyof typeof twinStates;
  reasons: string[];
  domains: {
    domain: string;
    changes: string[];
    episodes: [number, number];
    grounds: [number, number];
  }[];
  actionChanged: boolean;
  textsChanged: boolean;
};
type Run = { status: string; inputHash: string; result: ScoringResult | null };
const sorted = (xs: string[]) => [...new Set(xs)].sort();
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Checks an authored fact manifest, never infers semantic equivalence of free text. */
export function twinSuitability(pair: TwinDefinition): string[] {
  const a = pair.variants.A,
    b = pair.variants.B;
  const issues: string[] = [];
  if (
    a.provider !== b.provider ||
    a.processingVersion !== b.processingVersion ||
    a.rulesVersion !== b.rulesVersion ||
    a.rulesVersion !== twinRulesVersion
  )
    issues.push("Различаются условия обработки или версия правил сравнения.");
  if (
    a.input.criteria.version !== b.input.criteria.version ||
    !same(a.input.criteria, b.input.criteria)
  )
    issues.push("Критерии или шкалы несовместимы.");
  if (pair.key === "background") {
    if (!same(a.input, b.input))
      issues.push("Изменение неоценочных полей проникло в оценочный пакет.");
    for (const v of [a, b])
      if (
        !v.background ||
        Object.values(v.background).some(
          (value) => value && JSON.stringify(v.input).includes(value),
        )
      )
        issues.push(
          "Исключение школы и региона из оценочного пакета не подтверждено.",
        );
  }
  const ids = sorted([...a.facts, ...b.facts].map((f) => f.id));
  for (const id of ids) {
    const left = a.facts.find((f) => f.id === id),
      right = b.facts.find((f) => f.id === id);
    if (
      (!left || !right || left.value !== right.value) &&
      !pair.changed.includes(id)
    )
      issues.push(
        `Изменён сохраняемый факт: ${left?.label ?? right?.label ?? id}.`,
      );
  }
  if (
    pair.preserved.some(
      (id) =>
        !a.facts.some((f) => f.id === id) || !b.facts.some((f) => f.id === id),
    )
  )
    issues.push("В одном варианте отсутствует сохраняемый факт.");
  for (const side of [a, b]) {
    if (new Set(side.facts.map((f) => f.id)).size !== side.facts.length)
      issues.push("Повторяются идентификаторы фактов.");
    if (
      side.input.sources.some(
        (s) => !side.sourceLinks.some((l) => l.sourceId === s.id),
      )
    )
      issues.push("Не все источники имеют связь между вариантами.");
    const episodeLinks = new Map<string, string>();
    for (const source of side.input.sources) {
      const linked = side.sourceLinks.find(
        (l) => l.sourceId === source.id,
      )?.episode;
      if (!!source.episodeId !== !!linked)
        issues.push("Не подтверждена связь жизненного эпизода с источником.");
      if (source.episodeId && linked) {
        if (
          episodeLinks.has(linked) &&
          episodeLinks.get(linked) !== source.episodeId
        )
          issues.push(
            "Разные жизненные эпизоды нельзя объединить связью контрольной пары.",
          );
        episodeLinks.set(linked, source.episodeId);
      }
    }
  }
  return [...new Set(issues)];
}

export function compareTwin(
  pair: TwinDefinition,
  a?: Run,
  b?: Run,
): TwinComparison {
  const out: TwinComparison = {
    state: "INCOMPLETE",
    reasons: [],
    domains: [],
    actionChanged: false,
    textsChanged: false,
  };
  if (
    !a?.result ||
    !b?.result ||
    a.status !== "COMPLETED" ||
    b.status !== "COMPLETED"
  ) {
    out.reasons = ["Нужны два завершённых анализа собственных вариантов."];
    return out;
  }
  out.reasons = twinSuitability(pair);
  if (
    a.inputHash !== pair.variants.A.inputHash ||
    b.inputHash !== pair.variants.B.inputHash
  )
    out.reasons.push("Результат относится к другому входу.");
  try {
    validateScoringResult(a.result, pair.variants.A.input);
    validateScoringResult(b.result, pair.variants.B.input);
  } catch {
    out.reasons.push(
      "Основания или цитаты не прошли проверку собственного источника.",
    );
  }
  if (out.reasons.length) {
    out.state = "INCOMPARABLE";
    return out;
  }
  const signatures = (v: TwinVariant, r: ScoringResult, domain: string) => {
    const d = r.domains.find((d) => d.domain === domain)!;
    const evidence = r.evidence.filter((e) => d.evidenceIds.includes(e.id));
    const link = (id: string) => v.sourceLinks.find((s) => s.sourceId === id)!;
    if (
      evidence.some((e) => !v.evidenceLinks[e.id] || !link(e.sourceId)) ||
      d.gaps.some((g) => !v.gapLinks[g])
    )
      throw new Error("UNMAPPED_RESULT");
    const questions = r.questions.filter((q) => q.domain === domain);
    return {
      d,
      evidence,
      rating: d.rating
        ? { label: d.rating.label, value: d.rating.value }
        : null,
      grounds: sorted(
        evidence.map((e) => v.evidenceLinks[e.id] + ":" + link(e.sourceId).key),
      ),
      episodes: sorted(
        evidence
          .map((e) => link(e.sourceId).episode)
          .filter((s): s is string => s !== null),
      ),
      gaps: sorted(d.gaps.map((g) => v.gapLinks[g])),
      questions: questions
        .map((q) => ({
          id: q.id,
          section: q.section,
          source: link(q.sourceId)?.key,
        }))
        .sort((x, y) => x.id.localeCompare(y.id)),
      contradictions: r.contradictions
        .filter((c) => c.evidenceIds.some((id) => d.evidenceIds.includes(id)))
        .map((c) => sorted(c.evidenceIds.map((id) => v.evidenceLinks[id]))),
      explanations: sorted([
        d.interpretation,
        ...evidence.map((e) => e.explanation),
        ...questions.map((q) => q.text + " / " + q.gap),
      ]),
    };
  };
  try {
    for (const domain of pair.domains) {
      const left = signatures(pair.variants.A, a.result, domain),
        right = signatures(pair.variants.B, b.result, domain);
      if (!left.rating && !right.rating)
        out.reasons.push(
          `${domain}: две отсутствующие оценки не подтверждают устойчивость.`,
        );
      const changes: string[] = [];
      if (!same(left.rating, right.rating)) changes.push("Оценка области");
      if (left.d.sufficiency !== right.d.sufficiency)
        changes.push("Достаточность оснований");
      if (
        left.d.consistency !== right.d.consistency ||
        !same(left.contradictions, right.contradictions)
      )
        changes.push("Противоречия");
      if (!same(left.episodes, right.episodes))
        changes.push("Разные жизненные эпизоды");
      if (!same(left.grounds, right.grounds))
        changes.push("Использованные основания");
      if (
        !same(left.gaps, right.gaps) ||
        !same(left.questions, right.questions)
      )
        changes.push("Пробелы и вопросы");
      if (!same(left.explanations, right.explanations)) {
        changes.push("Текст интерпретации или вопроса — нужен просмотр");
        out.textsChanged = true;
      }
      out.domains.push({
        domain,
        changes,
        episodes: [left.episodes.length, right.episodes.length],
        grounds: [left.evidence.length, right.evidence.length],
      });
    }
  } catch {
    out.reasons.push(
      "Нет пригодной связи областей, оснований или пробелов между вариантами.",
    );
  }
  const actionSources = (v: TwinVariant, r: ScoringResult) =>
    sorted(
      r.recommendation.sourceIds.map(
        (id) => v.sourceLinks.find((s) => s.sourceId === id)?.key ?? "unmapped",
      ),
    );
  out.actionChanged =
    a.result.recommendation.action !== b.result.recommendation.action ||
    !same(
      actionSources(pair.variants.A, a.result),
      actionSources(pair.variants.B, b.result),
    );
  // A changed explanation is a prompt for human review, not a semantic/bias verdict.
  if (
    a.result.summary !== b.result.summary ||
    a.result.recommendation.reason !== b.result.recommendation.reason ||
    !same(
      a.result.contradictions.map((c) => c.text),
      b.result.contradictions.map((c) => c.text),
    )
  )
    out.textsChanged = true;
  out.state = out.reasons.length
    ? "INCOMPARABLE"
    : out.actionChanged ||
        out.textsChanged ||
        out.domains.some((d) => d.changes.length)
      ? "DIFFERENT"
      : "MATCH";
  if (out.state === "MATCH")
    out.reasons.push(
      "Совпали выбранные структурированные показатели этой пары. Тексты и пригодность остаются предметом человеческой проверки.",
    );
  if (out.state === "DIFFERENT")
    out.reasons.push(
      "Различие требует разбора; само по себе оно не означает предвзятость.",
    );
  return out;
}

export type TwinAuditView = {
  id: string;
  createdAt: string;
  currentBase: boolean;
  version: string;
  definition: TwinDefinition;
  runs: {
    id: string;
    variant: string;
    status: string;
    inputHash: string;
    result: ScoringResult | null;
  }[];
  comparison: TwinComparison;
  reviews: {
    id: string;
    verdict: keyof typeof twinVerdicts;
    note: string;
    author: string;
    createdAt: string;
  }[];
};
export type TwinList = {
  available: { key: string; title: string; purpose: string }[];
  reason: string;
  history: { id: string; title: string; createdAt: string }[];
};
