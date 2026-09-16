import "server-only";
import { z } from "zod";
import { AppError } from "./security";
export const sourceAnswer = z.object({
  text: z.string().max(2000),
  sourceIds: z.array(z.string()).max(6),
});
export interface SourceProvider {
  answer(input: {
    question: string;
    sources: { id: string; text: string }[];
    maxOutputTokens: number;
    signal: AbortSignal;
  }): Promise<unknown>;
}
// Only source lookup/explanation is allowed. This interface never produces admissions,
// psychological, language or leadership scores. A reviewed provider may be injected server-side.
export async function groundedAnswer(
  provider: SourceProvider,
  question: string,
  sources: { id: string; text: string }[],
) {
  if (
    question.length > 500 ||
    sources.length > 6 ||
    sources.reduce((n, s) => n + s.text.length, 0) > 12000
  )
    throw new AppError("Сократите запрос или число источников.");
  const output = await Promise.race([
    provider.answer({
      question,
      sources,
      maxOutputTokens: 600,
      signal: AbortSignal.timeout(8000),
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new AppError("Ответ не получен. Повторите запрос.", 504)),
        8000,
      ),
    ),
  ]);
  const result = sourceAnswer.parse(output);
  if (result.sourceIds.some((id) => !sources.some((s) => s.id === id)))
    throw new AppError("Не удалось подтвердить источники ответа.", 502);
  return result;
}
