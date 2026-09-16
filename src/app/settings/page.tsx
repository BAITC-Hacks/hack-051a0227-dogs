import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import { db } from "@/lib/db";
import { SettingsForm } from "@/components/settings-form";
export default async function Settings() {
  if ((await actor())?.role !== "STAFF") redirect("/login?staff=1");
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
