/** Small deterministic retrieval over already-authorized text. No generated facts. */
const common = new Set(["что", "как", "где", "когда", "почему", "можно", "нужно", "мне", "тебе", "тут", "там", "это", "есть", "для", "при", "или", "about", "what", "how", "the", "and"]);
const related: Record<string, string[]> = {
  английск: ["языков", "сертификат", "english"],
  языков: ["английск", "сертификат", "english"],
  оценк: ["балл", "axis", "критери"],
  балл: ["оценк", "axis", "критери"],
  интервью: ["встреч", "приглашен"],
  заявк: ["поступлен", "подач", "анкета"],
  навык: ["дерев", "развит", "skill"],
};
function roots(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((word) => !common.has(word))
    .map((word) => word.replace(/(иями|ание|ение|ость|иями|ского|ского|ными|ого|ему|ыми|ами|ями|иях|иям|ие|ые|ой|ый|ое|ая|ам|ях|ов|ев|ом|ем|у|а|я|ы|и|е)$/u, ""));
}
export function knowledgeMatches<T extends { title: string; text: string }>(question: string, records: T[], limit = 2) {
  const wanted = new Set(roots(question));
  for (const token of [...wanted]) for (const [term, synonyms] of Object.entries(related))
    if (token.includes(term) || term.includes(token)) synonyms.forEach((word) => wanted.add(word));
  if (!wanted.size) return [] as T[];
  return records.map((record) => {
    const title = roots(record.title);
    const body = roots(record.text.slice(0, 5000));
    const score = [...wanted].reduce((sum, token) => sum + (title.some((word) => word.includes(token) || token.includes(word)) ? 4 : 0) + (body.some((word) => word.includes(token) || token.includes(word)) ? 1 : 0), 0);
    return { record, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.record);
}
