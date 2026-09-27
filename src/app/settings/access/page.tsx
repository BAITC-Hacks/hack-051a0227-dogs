import { requireStaff } from "@/lib/security";
import { AccessManager } from "@/components/access-manager";
export default async function AccessSettings() {
  await requireStaff();
  return (
    <div className="page wrap settings-page">
      <div className="page-title">
        <div>
          <h1>Доступ к личному кабинету</h1>
          <p>
            Предоставьте доступ конкретному кандидату по подтверждённому
            основанию. Отправленная заявка открывает его автоматически.
          </p>
        </div>
      </div>
      <AccessManager />
    </div>
  );
}
