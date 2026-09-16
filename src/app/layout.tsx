import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/golos-text";
import "./globals.css";
import { actor } from "@/lib/security";
import { Header, Footer } from "@/components/header";
export const metadata: Metadata = {
  title: { default: "AI Leader ID · inVision U", template: "%s · inVision U" },
  description:
    "Попробуй учебную работу, создай свой результат и выбери следующий шаг в inVision U.",
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
  const safe = u
    ? { id: u.id, name: u.name, email: u.email, role: u.role }
    : null;
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        <Header user={safe} />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
