import { missions, readMission } from "./missions";
import { programFor } from "./catalog";
export const learningPolicy = "structured-learning-v2";
/** An allowlist, not semantic redaction: no author text, biography, upload or conversation is copied. */
export function learningFacts(
  slug: string,
  state: unknown,
  revision: number,
  complete: boolean,
): string {
  const mission = readMission(state),
    def = missions[slug];
  const lines = [
    `Направление: ${programFor(slug)?.shortTitle ?? "Учебная практика"}.`,
    `Версия работы: ${revision}.`,
    complete
      ? "Условия упражнения выполнены."
      : "Есть условия упражнения для проверки.",
  ];
  if (mission && def) {
    lines.push(`Задача: ${def.title}.`);
    for (const f of def.fields) {
      const option = f.options.find((o) => o.id === mission.plan.choices[f.id]);
      if (option) lines.push(`${f.label}: ${option.label}.`);
    }
    if (def.sequence)
      lines.push(
        `Порядок: ${mission.plan.sequence
          .map((k) => def.sequence!.items.find((i) => i.id === k)?.label)
          .filter(Boolean)
          .join("; ")}.`,
      );
    lines.push(
      mission.phase === "UPDATED"
        ? "Рассмотрены обновлённые условия."
        : "Работа с исходными условиями.",
    );
  }
  return lines.join("\n");
}
/** Known identifiers and direct contacts never leave in a question. This does not claim to classify every kind of sensitive prose. */
export function learningQuestion(
  text: string,
  identifiers: string[] = [],
): string {
  let safe = text;
  for (const value of identifiers.filter((v) => v.length > 2))
    safe = safe.replace(
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"),
      "[личные данные]",
    );
  return safe
    .replace(/[\w.+-]+@[\w.-]+\.[\w-]+/gu, "[контакт]")
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "[ссылка]")
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/gu, "[номер]")
    .replace(/\bsk-[\w-]+/gu, "[секрет]");
}
