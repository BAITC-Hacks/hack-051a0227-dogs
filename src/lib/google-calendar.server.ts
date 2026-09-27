import "server-only";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { type GoogleConnection, type User } from "@prisma/client";
import { db } from "./db";
import { AppError, tokenHash } from "./security";
import { localSecrets } from "./local-secret.server";
import type { CalendarEvent } from "./calendar-contract";
export const googleScopes = [
  "calendar.events.owned",
  "calendar.events.freebusy",
  "calendar.calendarlist.readonly",
].map((s) => "https://www.googleapis.com/auth/" + s);
export function googleConfiguration() {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return {
    configured:
      !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: new URL("/api/google/callback", origin).toString(),
  };
}
export class GoogleCalendarError extends Error {
  constructor(
    public code: string,
    public status = 502,
  ) {
    super(code);
  }
}
export async function googleJson<T>(
  url: string,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleCalendarError("NETWORK");
  }
  if (!response.ok)
    throw new GoogleCalendarError(
      response.status === 401 || response.status === 403
        ? "GOOGLE_ACCESS"
        : response.status === 404
          ? "NOT_FOUND"
          : response.status === 409
            ? "ALREADY_EXISTS"
            : response.status === 412
              ? "EVENT_CHANGED"
              : response.status === 410
                ? "GONE"
                : "GOOGLE_FAILURE",
      response.status,
    );
  if (response.status === 204) return {} as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new GoogleCalendarError("INVALID_RESPONSE");
  }
}
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export async function tokenFor(c: GoogleConnection) {
  let value: Tokens;
  try {
    value = JSON.parse(
      await localSecrets.decrypt(c.secretId, c.secretStorage, c.secretCipher),
    );
  } catch {
    throw new GoogleCalendarError("TOKEN_STORAGE");
  }
  if (value.expires_at > Date.now() + 60000) return value.access_token;
  const token = await googleJson<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: value.refresh_token,
        grant_type: "refresh_token",
      }),
    },
  );
  const cipher = await localSecrets.encrypt(
    c.secretId,
    c.secretStorage,
    JSON.stringify({
      ...value,
      access_token: token.access_token,
      expires_at: Date.now() + token.expires_in * 1000,
    }),
  );
  await db.googleConnection.updateMany({
    where: { id: c.id, revision: c.revision },
    data: { secretCipher: cipher },
  });
  return token.access_token;
}
export async function startGoogleOAuth(user: User) {
  if (user.role !== "STAFF")
    throw new AppError("Подключение доступно сотруднику.", 403);
  const config = googleConfiguration();
  if (!config.configured)
    throw new AppError(
      "Владелец приложения должен настроить Google OAuth. Инструкция доступна в настройках календаря.",
    );
  const jar = await cookies(),
    session = jar.get("leader_session")?.value;
  if (!session) throw new AppError("Войди в аккаунт.", 401);
  const state = randomBytes(32).toString("base64url"),
    browser = randomBytes(32).toString("base64url");
  await db.googleOAuthState.create({
    data: {
      hash: tokenHash(state),
      userId: user.id,
      sessionHash: tokenHash(session),
      browserHash: tokenHash(browser),
      expiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  jar.set("leader_google_oauth", browser, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: googleScopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return { url: url.toString() };
}
export async function completeGoogleOAuth(code: string, state: string) {
  const jar = await cookies(),
    browser = jar.get("leader_google_oauth")?.value,
    session = jar.get("leader_session")?.value;
  if (!browser || !state || !code || code.length > 4096)
    throw new AppError("Подключение не подтверждено. Начни его заново.", 403);
  const row = await db.googleOAuthState.findUnique({
    where: { hash: tokenHash(state) },
  });
  if (
    !row ||
    row.expiresAt < new Date() ||
    row.browserHash !== tokenHash(browser) ||
    (session && row.sessionHash !== tokenHash(session))
  )
    throw new AppError("Подключение не относится к текущей сессии.", 403);
  const active = await db.session.findUnique({
    where: { tokenHash: row.sessionHash },
    include: { user: true },
  });
  if (
    !active ||
    active.expiresAt < new Date() ||
    active.user.id !== row.userId ||
    active.user.role !== "STAFF"
  )
    throw new AppError("Сессия сотрудника завершена.", 403);
  const used = await db.googleOAuthState.deleteMany({
    where: { hash: row.hash, expiresAt: { gt: new Date() } },
  });
  if (!used.count) throw new AppError("Подключение уже обработано.", 409);
  jar.delete("leader_google_oauth");
  const token = await googleJson<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleConfiguration().redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (
    !token.refresh_token ||
    !googleScopes.every((s) => token.scope.split(" ").includes(s))
  )
    throw new AppError(
      "Не предоставлены нужные разрешения календаря. Повтори подключение.",
    );
  const secretId = randomUUID(),
    secretStorage = await localSecrets.create(secretId);
  const secretCipher = await localSecrets.encrypt(
    secretId,
    secretStorage,
    JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + token.expires_in * 1000,
    }),
  );
  const old = await db.googleConnection.findUnique({
    where: { userId: row.userId },
  });
  try {
    await db.googleConnection.upsert({
      where: { userId: row.userId },
      create: {
        userId: row.userId,
        calendarId: old?.calendarId ?? "",
        calendarName: old?.calendarName ?? "",
        secretId,
        secretStorage,
        secretCipher,
        scopes: token.scope,
      },
      update: {
        secretId,
        secretStorage,
        secretCipher,
        scopes: token.scope,
        calendarId: old?.calendarId ?? "",
        calendarName: old?.calendarName ?? "",
        revision: { increment: 1 },
      },
    });
  } catch (e) {
    await localSecrets.remove(secretId, secretStorage);
    throw e;
  }
  if (old)
    await localSecrets.remove(old.secretId, old.secretStorage).catch(() => {});
}
export async function calendarConnection(user: User) {
  if (user.role !== "STAFF")
    throw new AppError("Календарь доступен сотруднику.", 403);
  const c = await db.googleConnection.findUnique({
    where: { userId: user.id },
  });
  if (!c) throw new AppError("Подключи Google в настройках календаря.", 409);
  return c;
}
type CalendarListItem = {
  id: string;
  summary: string;
  accessRole: string;
  conferenceProperties?: { allowedConferenceSolutionTypes?: string[] };
};
export async function listCalendars(user: User) {
  const c = await calendarConnection(user),
    token = await tokenFor(c);
  const all: CalendarListItem[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const result = await googleJson<{
      items: CalendarListItem[];
      nextPageToken?: string;
    }>(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner&maxResults=100" +
        (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""),
      { headers: { Authorization: "Bearer " + token } },
    );
    all.push(...result.items);
    pageToken = result.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return all
    .filter(
      (x) =>
        x.accessRole === "owner" &&
        x.conferenceProperties?.allowedConferenceSolutionTypes?.includes(
          "hangoutsMeet",
        ),
    )
    .map((x) => ({ id: x.id, name: x.summary }));
}
export async function selectCalendar(user: User, id: string) {
  const c = await calendarConnection(user),
    calendars = await listCalendars(user),
    selected = calendars.find((x) => x.id === id);
  if (!selected)
    throw new AppError("Выбери собственный календарь с поддержкой Meet.", 403);
  if (
    c.calendarId &&
    c.calendarId !== id &&
    (await db.interview.count({
      where: {
        calendarConnectionId: c.id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    }))
  )
    throw new AppError(
      "В текущем календаре есть незавершённые интервью. Сначала заверши или отмени их, чтобы сохранить возможность переноса встреч.",
      409,
    );
  if (
    await db.calendarOperation.count({
      where: {
        connectionId: c.id,
        status: { in: ["QUEUED", "RUNNING", "PENDING"] },
      },
    })
  )
    throw new AppError(
      "Сначала заверши операции встреч текущего календаря.",
      409,
    );
  return db.googleConnection.update({
    where: { id: c.id },
    data: {
      calendarId: id,
      calendarName: selected.name,
      revision: { increment: 1 },
    },
    select: { calendarId: true, calendarName: true, revision: true },
  });
}
export class GoogleCalendarAdapter {
  constructor(
    private token: string,
    private calendarId: string,
    private transport: typeof fetch = fetch,
  ) {}
  private headers() {
    return {
      Authorization: "Bearer " + this.token,
      "Content-Type": "application/json",
    };
  }
  private events(id = "") {
    return (
      "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(this.calendarId) +
      "/events" +
      (id ? "/" + encodeURIComponent(id) : "")
    );
  }
  async availability(start: string, end: string, emails: string[]) {
    const items = [...new Set([this.calendarId, ...emails])];
    const result = await googleJson<{
      calendars: Record<
        string,
        { busy?: { start: string; end: string }[]; errors?: unknown[] }
      >;
    }>(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          timeMin: start,
          timeMax: end,
          items: items.map((id) => ({ id })),
        }),
      },
      this.transport,
    );
    return items.map((id) => ({
      id,
      state:
        !result.calendars?.[id] || result.calendars[id].errors?.length
          ? "UNKNOWN"
          : result.calendars[id].busy?.length
            ? "BUSY"
            : "FREE",
    }));
  }
  async get(id: string) {
    try {
      return await googleJson<CalendarEvent>(
        this.events(id),
        { headers: this.headers() },
        this.transport,
      );
    } catch (e) {
      if (
        e instanceof GoogleCalendarError &&
        ["NOT_FOUND", "GONE"].includes(e.code)
      )
        return null;
      throw e;
    }
  }
  async insert(id: string, operationId: string, body: Record<string, unknown>) {
    const prior = await this.get(id);
    if (prior) return prior;
    try {
      return await googleJson<CalendarEvent>(
        this.events() + "?conferenceDataVersion=1&sendUpdates=none",
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            ...body,
            id,
            conferenceData: {
              createRequest: {
                requestId: operationId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        },
        this.transport,
      );
    } catch (e) {
      if (e instanceof GoogleCalendarError && e.code === "ALREADY_EXISTS") {
        const existing = await this.get(id);
        if (existing) return existing;
      }
      throw e;
    }
  }
  async patch(
    id: string,
    body: Record<string, unknown>,
    etag?: string,
    notify = false,
  ) {
    return googleJson<CalendarEvent>(
      this.events(id) +
        "?conferenceDataVersion=1&sendUpdates=" +
        (notify ? "all" : "none"),
      {
        method: "PATCH",
        headers: { ...this.headers(), ...(etag ? { "If-Match": etag } : {}) },
        body: JSON.stringify(body),
      },
      this.transport,
    );
  }
  async cancel(id: string, etag?: string) {
    try {
      await googleJson(
        this.events(id) + "?sendUpdates=all",
        {
          method: "DELETE",
          headers: { ...this.headers(), ...(etag ? { "If-Match": etag } : {}) },
        },
        this.transport,
      );
    } catch (e) {
      if (!(
        e instanceof GoogleCalendarError &&
        ["NOT_FOUND", "GONE"].includes(e.code)
      ))
        throw e;
    }
  }
}
export async function adapterFor(c: GoogleConnection) {
  if (!c.calendarId) throw new AppError("Выбери календарь в настройках.", 409);
  // Re-check ownership and Meet support before every operation, including a retry.
  const token = await tokenFor(c);
  const calendar = await googleJson<CalendarListItem>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList/" +
      encodeURIComponent(c.calendarId),
    { headers: { Authorization: "Bearer " + token } },
  );
  if (
    calendar.accessRole !== "owner" ||
    !calendar.conferenceProperties?.allowedConferenceSolutionTypes?.includes(
      "hangoutsMeet",
    )
  )
    throw new GoogleCalendarError("CALENDAR_ACCESS");
  return new GoogleCalendarAdapter(token, c.calendarId);
}
export function calendarEventId(requestKey: string) {
  return "ivu" + createHash("sha256").update(requestKey).digest("hex");
}
