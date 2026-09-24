import { z } from "zod";

// Standard processing, api.openai.com; only app-owned bounded tools, no paid hosted tools or fast tiers.
// Official model pages and pricing checked 2026-09-24. USD per million tokens.
export const pricingVersion = "openai-standard-2026-09-24";
export const textModels = ["gpt-5.4-mini", "gpt-6-sol", "gpt-6-luna"] as const;
export const transcriptionModels = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-mini-transcribe-2025-12-15",
] as const;
export const speechModels = [
  "gpt-4o-mini-tts",
  "gpt-4o-mini-tts-2025-12-15",
] as const;
export const taskNames = {
  text: "Основной текст",
  complex: "Сложный разбор",
  transcription: "Расшифровка",
  speech: "Озвучивание",
};
export type OpenAITask = keyof typeof taskNames;
export const rates: Record<
  string,
  { input: number; output: number; cached?: number; cacheWrite?: number }
> = {
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cached: 0.075 },
  "gpt-6-sol": { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cached: 0.01, cacheWrite: 0.125 },
  "gpt-4o-mini-transcribe": { input: 1.25, output: 5 },
  "gpt-4o-mini-transcribe-2025-12-15": { input: 1.25, output: 5 },
};
export const connectionSettingsSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    textModel: z.enum(textModels),
    complexModel: z.enum(textModels),
    transcriptionModel: z.enum(transcriptionModels),
    speechModel: z.enum(speechModels),
    audioEnabled: z.boolean(),
    deskEnabled: z.boolean().optional(),
    visionEnabled: z.boolean().optional(),
    startingMicros: z.number().int().min(0).max(1000000000),
    limitMicros: z.number().int().min(0).max(1000000000),
    reserveMicros: z.number().int().min(0).max(1000000000),
    dailyMicros: z.number().int().min(0).max(1000000000),
    parallelLimit: z.number().int().min(1).max(3),
  })
  .strict()
  .refine(
    (v) =>
      v.limitMicros + v.reserveMicros <= v.startingMicros &&
      v.dailyMicros <= v.limitMicros,
    "Рабочий лимит и резерв должны помещаться в исходную сумму; дневной лимит не больше рабочего.",
  );
export const keySchema = z
  .string()
  .trim()
  .min(20)
  .max(512)
  .regex(/^sk-[A-Za-z0-9_-]+$/);
export const money = (micros: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(micros / 1e6);
export const openaiMessages: Record<string, string> = {
  CANCELLED:
    "Запрос остановлен. Уже переданная обработка может учитываться в расходах.",
  ACCESS:
    "Ключ отклонён или у него недостаточно прав. Проверьте ключ и проект OpenAI.",
  MODEL:
    "Выбранная модель недоступна. Выберите другую из списка и сохраните настройки.",
  RATE: "OpenAI ограничил запросы. Проверьте квоту проекта и повторите позже.",
  NETWORK:
    "Ответ OpenAI не получен. Стоимость оставлена в оценке; автоматического повтора нет.",
  RESPONSE: "OpenAI не вернул пригодный результат. Запрос учтён в расходах.",
  BUDGET:
    "Лимит расходов исчерпан. Работы и заявки можно сохранять как обычно.",
  PARALLEL:
    "Сейчас выполняется допустимое число запросов. Дождитесь завершения.",
  CHANGED: "Настройки изменились. Обновите страницу и повторите действие.",
  DISCONNECTED: "Сначала сохраните ключ подключения.",
  STORAGE:
    "Не удалось открыть защищённое хранилище. Проверьте доступ к этому компьютеру.",
};
