import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/settings-form";
import Link from "next/link";
import { connection } from "@/lib/openai-settings.server";
export default async function Settings() {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  const openai = await connection();
  const setting = await db.setting.findUniqueOrThrow({
    where: { key: "rubric" },
  });
  const value = setting.value as { guidance: string; version: number };
  return (
    <div className="page wrap settings-page">
      <div className="page-title">
        <div>
          <h1>Настройки рассмотрения</h1>
          <p>Правила содержательной человеческой оценки и версия рубрики.</p>
        </div>
      </div>
      {(!openai.ownerId || openai.ownerId === user.id) && (
        <p className="settings-connection-link">
          <Link className="button secondary" href="/settings/openai">
            {openai.ownerId
              ? "OpenAI: подключение и расходы"
              : "Назначить владельца подключения OpenAI"}
          </Link>
        </p>
      )}
      <p>
        <Link className="button secondary" href="/settings/resources">
          Материалы личного развития
        </Link>
      </p>
      <p className="row">
        <Link className="button secondary" href="/settings/intake">
          Условия набора
        </Link>
        <Link className="button secondary" href="/settings/calendar">
          Календарь интервью
        </Link>
      </p>
      <SettingsForm guidance={value.guidance} version={value.version} />
      <section className="review-section" style={{ marginTop: 32 }}>
        <h2>Порядок работы с источниками</h2>
        <p>
          Готовность, мотивация и опыт рассматриваются отдельно. Каждый вывод
          сохраняет ссылку на источник и автора. Изменение правил не
          пересчитывает предыдущие оценки.
        </p>
      </section>
    </div>
  );
}
