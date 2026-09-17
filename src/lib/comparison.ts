type HumanScore = { rubricVersion: number; materialVersion: string | null };
export function humanComparisonIssue(
  score: HumanScore | undefined,
  currentMaterial: string,
  peers: (HumanScore | undefined)[],
) {
  if (!score) return null;
  if (!score.materialVersion)
    return "Версия материалов не зафиксирована — оценка вне сравнения";
  if (score.materialVersion !== currentMaterial)
    return "Прежние материалы — нужна новая проверка";
  if (
    new Set(
      [score, ...peers]
        .filter((s): s is HumanScore => !!s)
        .map((s) => s.rubricVersion),
    ).size > 1
  )
    return "Критерии различаются — оценки несопоставимы";
  return null;
}
