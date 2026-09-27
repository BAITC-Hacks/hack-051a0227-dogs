import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/golos-text";
import "./globals.css";
import { avatarIdentity } from "@/lib/avatar";
import { actor } from "@/lib/security";
import { accessFor } from "@/lib/access.server";
import { Header, Footer } from "@/components/header";
import { staffAlerts } from "@/lib/staff-alerts.server";
export const metadata: Metadata = {
  title: { default: "AI Leader ID · inVision U", template: "%s · inVision U" },
  description:
    "Подай заявку в inVision U, следи за рассмотрением и готовься к следующим этапам поступления.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5e9",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const u = await actor();
  const space = await accessFor(u);
  const alerts = space === "STAFF" ? await staffAlerts() : [];
  const safe = u
    ? {
        ...avatarIdentity(u),
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }
    : null;
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        <Header user={safe} space={space} alerts={alerts} />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
