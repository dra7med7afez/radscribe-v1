import "./globals.css";
import type { Metadata } from "next";
import AppShell from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RadScribe",
  description: "Voice-driven, template-aware radiology reporting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
