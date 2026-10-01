import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actor } from "@/lib/security";
import {
  checkConnectionRequest,
  connection,
  connectionView,
  localConnectionOrigin,
} from "@/lib/openai-settings.server";
import { OpenAISettings, OwnerSetup } from "@/components/openai-settings";

export const dynamic = "force-dynamic";
export default async function OpenAIPage() {
  const user = await actor();
  if (user?.role !== "STAFF") redirect("/login?staff=1");
  try {
    checkConnectionRequest(await headers());
  } catch {
    return (
      <div className="page wrap">
        <h1>Адрес подключения не совпадает</h1>
        <p>Откройте приложение по его настроенному адресу.</p>
        <Link href="/settings">К настройкам</Link>
      </div>
    );
  }
  const config = await connection();
  if (config.ownerId && config.ownerId !== user.id) redirect("/settings");
  return (
    <div className="page wrap openai-settings-page">
      <Link href="/settings" className="text-link">
        Настройки рассмотрения
      </Link>
      <div className="page-title">
        <div>
          <h1>{config.ownerId ? "OpenAI" : "Владелец подключения"}</h1>
          <p>
            {config.ownerId
              ? "Ключ, разрешённая обработка и расходы приложения."
              : "Личный доступ к ключу и лимитам этой установки."}
          </p>
        </div>
      </div>
      {config.ownerId ? (
        <OpenAISettings initial={await connectionView(user)} />
      ) : localConnectionOrigin().hostname === "localhost" || localConnectionOrigin().hostname === "127.0.0.1" || localConnectionOrigin().hostname === "[::1]" ? (
        <OwnerSetup />
      ) : (
        <section className="review-section owner-setup">
          <h2>Подключение ещё не настроено</h2>
          <p>Первого владельца назначает администратор сервера. После этого он добавляет ключ OpenAI и лимиты здесь; Vision станет доступен вошедшим пользователям согласно их правам.</p>
        </section>
      )}
    </div>
  );
}
