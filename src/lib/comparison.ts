type HumanScore = { rubricVersion: number; materialVersion: string | null };
export function humanComparisonIssue(
  score: HumanScore | undefined,
  currentMaterial: string,
  peers: (HumanScore | undefined)[],
) {
  if (!score) return null;
  if (!score.materialVersion)
    return "Версия материалов не зафиксирована. Оценка вне сравнения";
  if (score.materialVersion !== currentMaterial)
    return "Прежние материалы. Нужна новая проверка";
  if (
    new Set(
      [score, ...peers]
        .filter((s): s is HumanScore => !!s)
        .map((s) => s.rubricVersion),
    ).size > 1
  )
    return "Критерии различаются. Оценки несопоставимы";
  return null;
}
