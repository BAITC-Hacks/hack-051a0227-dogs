import "server-only";
import { groundedAnswer, type SourceProvider } from "./ai";
import { AppError } from "./security";
import {
  initialMission,
  missionChecks,
  missionCommandSchema,
  missions,
  readMission,
  validateMissionPlan,
  type Mission,
} from "./missions";

// The same bounded source-answer contract as other source explanations. No model or network.
const teamProvider: SourceProvider = {
  async answer({ question, sources }) {
    const source = sources.find((s) => s.id === question);
    if (!source) throw new AppError("Этот вопрос недоступен в текущей задаче.");
    return { text: source.text, sourceIds: [source.id] };
  },
};
export async function applyMission(
  slug: string,
  submitted: unknown,
  previous: unknown,
  command: unknown,
  dialogue?: { text: string; quote: string; question: string; id: string },
): Promise<Mission> {
  const input = readMission(submitted);
  if (!input || input.slug !== slug)
    throw new AppError("Миссия не соответствует работе.");
  try {
    validateMissionPlan(slug, input.plan);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Проверь решение.");
  }
  const base = readMission(previous) ?? initialMission(slug);
  // Phase, prior work, test evidence and team replies always come from the saved owner version.
  const m: Mission = { ...structuredClone(base), plan: input.plan };
  if (command === undefined) return m;
  const cmd = missionCommandSchema.parse(command),
    d = missions[slug];
  if (cmd.kind === "test") {
    m.tests = [
      ...m.tests.filter((t) => t.phase !== m.phase),
      {
        phase: m.phase,
        plan: structuredClone(m.plan),
        checks: missionChecks(m),
      },
    ];
  } else if (cmd.kind === "reveal") {
    if (m.phase === "UPDATED") return m;
    if (!m.tests.some((t) => t.phase === "INITIAL"))
      throw new AppError("Сначала запусти проверку исходного решения.");
    m.baseline = structuredClone(m.plan);
    m.phase = "UPDATED";
  } else if (cmd.kind === "dialogue") {
    if (!dialogue || dialogue.id !== cmd.replyId)
      throw new AppError("Ответ участника не подтверждён.", 409);
    m.conversations = [
      ...m.conversations.filter(
        (c) =>
          !(c.role === cmd.role && c.phase === m.phase && c.kind === "ask"),
      ),
      {
        role: cmd.role,
        phase: m.phase,
        kind: "ask",
        text: dialogue.text,
        quote: dialogue.quote,
        question: dialogue.question,
        responseId: dialogue.id,
        sourceIds: [`mission:2:${slug}:${m.phase}:${cmd.role}:ask`],
        adapter: "openai-scene",
        scenarioVersion: 2,
      },
    ];
  } else {
    const r = d.team.find((r) => r.id === cmd.role);
    if (!r) throw new AppError("Участник недоступен.");
    const assigned = d.tasks.filter((t) => m.plan.assignments[t.id] === r.id);
    if (cmd.kind === "assign" && !assigned.length)
      throw new AppError("Сначала выбери работу для этого участника.");
    const workload = assigned.reduce((n, t) => n + t.effort, 0);
    const reply =
      cmd.kind === "ask"
        ? m.phase === "UPDATED"
          ? r.updated
          : r.initial
        : `В плане мне поручено: ${assigned.map((t) => t.label.toLowerCase()).join("; ")}. Это ${workload} единицы при доступных ${r.capacity}. ${workload > r.capacity ? "Всё не помещается. Передай одну работу другому участнику." : "Могу взять этот объём. Результат поручения нужно проверить в твоём плане."}`;
    const sourceId = `mission:2:${slug}:${m.phase}:${r.id}:${cmd.kind}`;
    const result = await groundedAnswer(teamProvider, sourceId, [
      { id: sourceId, text: reply },
    ]);
    m.conversations = [
      ...m.conversations.filter(
        (c) => !(c.role === r.id && c.phase === m.phase && c.kind === cmd.kind),
      ),
      {
        role: r.id,
        phase: m.phase,
        kind: cmd.kind,
        ...result,
        adapter: "local-scripted",
        scenarioVersion: 2,
      },
    ];
  }
  return m;
}
