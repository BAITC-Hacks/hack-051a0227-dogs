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
      "Соединение прервалось. Ваш текст остался на странице — повторите сохранение.",
    );
  }
  const payload = await res.json();
  if (!res.ok || !payload.ok)
    throw new Error(
      payload.error ?? "Не удалось сохранить. Повторите попытку.",
    );
  return payload.data as T;
}
export async function upload(file: File, kind: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const res = await fetch("/api/files", { method: "POST", body });
  const data = await res.json();
  if (!res.ok || !data.ok)
    throw new Error(data.error ?? "Загрузка прервалась. Повторите попытку.");
  return data.data as {
    id: string;
    name: string;
    mime: string;
    kind: string;
    size: number;
    createdAt: Date;
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
