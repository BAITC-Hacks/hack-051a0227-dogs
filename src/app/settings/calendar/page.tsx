import { requireStaff } from "@/lib/security";
import { db } from "@/lib/db";
import { googleConfiguration } from "@/lib/google-calendar.server";
import { CalendarSettings } from "@/components/calendar-settings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const u = await requireStaff(),
    c = await db.googleConnection.findUnique({
      where: { userId: u.id },
      select: { calendarName: true },
    }),
    config = googleConfiguration();
  return (
    <div className="page wrap settings-page">
      <h1>Календарь интервью</h1>
      <CalendarSettings
        connected={!!c}
        name={c?.calendarName ?? ""}
        error={!!(await searchParams).error}
      />
      {!config.configured && (
        <section className="panel">
          <h2>Настройка владельцем приложения</h2>
          <p>
            В Google Cloud включите Calendar API, настройте OAuth consent screen
            и создайте OAuth client типа Web application. Для тестового режима
            добавьте только согласованные Google-аккаунты.
          </p>
          <p>
            На сервере нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET. Redirect
            URI должен совпадать точно:
          </p>
          <code style={{ overflowWrap: "anywhere" }}>{config.redirectUri}</code>
          <p>
            APP_ORIGIN задаёт адрес приложения. После подключения выберите
            выделенный календарь. OpenAI-ключ не используется для подключения
            Google.
          </p>
        </section>
      )}
    </div>
  );
}
