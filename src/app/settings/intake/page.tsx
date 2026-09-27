import { requireStaff } from "@/lib/security";
import { intakeRules } from "@/lib/intake.server";
import { IntakeSettings } from "@/components/intake-settings";
export default async function Page() {
  await requireStaff();
  return (
    <div className="page wrap settings-page">
      <h1>Условия набора</h1>
      <p>
        Применимость документов, экзаменов и эссе хранится отдельно от анкеты.
        Публичный источник не подтверждает будущие дедлайны.
      </p>
      <IntakeSettings rules={await intakeRules()} />
    </div>
  );
}
