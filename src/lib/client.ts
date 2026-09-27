export class ActionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function responseData(res: Response) {
  try {
    const payload = await res.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.ok !== "boolean"
    )
      throw new Error("INVALID_RESPONSE");
    return payload;
  } catch {
    throw new ActionError(
      "Не удалось подтвердить сохранение. Введённое осталось на странице. Повторите попытку.",
      res.status,
    );
  }
}
export async function action<T = Record<string, unknown>>(
  type: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...data }),
    });
  } catch {
    throw new Error(
      "Соединение прервалось. Ваш текст остался на странице. Повторите сохранение.",
    );
  }
  const payload = await responseData(res);
  if (!res.ok || !payload.ok)
    throw new ActionError(
      payload.error ?? "Не удалось сохранить. Повторите попытку.",
      res.status,
    );
  return payload.data as T;
}
export async function upload(
  file: File,
  kind: string,
  metadata: Record<string, string> = {},
) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  for (const [k, v] of Object.entries(metadata)) body.append(k, v);
  let res: Response;
  try {
    res = await fetch("/api/files", { method: "POST", body });
  } catch {
    throw new Error(
      "Загрузка прервалась. Файл не подтверждён. Повторите загрузку.",
    );
  }
  const data = await responseData(res);
  if (!res.ok || !data.ok)
    throw new Error(data.error ?? "Загрузка прервалась. Повторите попытку.");
  return data.data as {
    id: string;
    name: string;
    mime: string;
    kind: string;
    size: number;
    createdAt: Date;
    purpose: string;
    section: string;
    version: number;
    userId: string;
    releasedAt: Date | null;
  };
}
export const dateLabel = (d: Date | string) =>
  new Date(d).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
