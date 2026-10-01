import { z } from "zod";
export const timezoneSchema = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return v.includes("/") || v === "UTC";
    } catch {
      return false;
    }
  }, "Выбери часовой пояс IANA.");
export const meetingSchema = z
  .object({
    localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    timezone: timezoneSchema,
    durationMinutes: z.number().int().min(10).max(180),
    interviewerIds: z.array(z.string().min(1)).min(1).max(5),
    recipients: z.array(z.email()).max(10),
    mode: z.enum(["GOOGLE", "MANUAL"]),
    manualUrl: z.string().max(1000).default(""),
    publish: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export type MeetingInput = z.infer<typeof meetingSchema>;
export function wallTimeToISO(local: string, timezone: string) {
  timezoneSchema.parse(timezone);
  const expected = local + ":00",
    nominal = Date.parse(expected + "Z");
  if (!Number.isFinite(nominal)) throw new Error("INVALID_DATE");
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const format = (epoch: number) =>
    fmt.format(new Date(epoch)).replace(" ", "T");
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const n = nominal + delta;
    offsets.add(Date.parse(format(n) + "Z") - n);
  }
  const candidates = [...offsets]
    .map((offset) => nominal - offset)
    .filter((n) => format(n) === expected);
  if (candidates.length !== 1) throw new Error("AMBIGUOUS_TIME");
  return new Date(candidates[0]).toISOString();
}
export type CalendarEvent = {
  id: string;
  status?: string;
  etag?: string;
  extendedProperties?: { private?: Record<string, string> };
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType: string; uri: string }[];
  };
};
export function confirmedMeet(event: CalendarEvent) {
  if (event.conferenceData?.createRequest?.status?.statusCode !== "success")
    return null;
  const url = event.conferenceData.entryPoints?.find(
    (e) => e.entryPointType === "video",
  )?.uri;
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      u.hostname === "meet.google.com" &&
      !u.username &&
      !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export const calendarMessages: Record<string, string> = {
  PENDING: "Google создаёт ссылку встречи. Приглашение ещё не опубликовано.",
  QUEUED: "Запрос сохранён. Создаём встречу.",
  RUNNING: "Проверяем состояние встречи в Google.",
  FAILED:
    "Не удалось подтвердить встречу. Параметры сохранены; повтори операцию.",
  READY: "Встреча и ссылка подтверждены.",
  MANUAL: "Встреча назначена. Время доступно кандидату в сообщениях.",
  CANCELLED: "Встреча отменена.",
  STALE: "Материалы или доступ изменились. Проверь параметры заново.",
};
