import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { APP_NAME, COMPANY_NAME } from "@/lib/brand";

// Figtree: parecida a Circular (la de Roofr, que es de pago). Variable, de 300 a 900.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  // Sin el respaldo automático de next/font (usaría Arial).
  adjustFontFallback: false,
  fallback: ["Helvetica Neue", "Helvetica", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `CRM de ${COMPANY_NAME}`,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
