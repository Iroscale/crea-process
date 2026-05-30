import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crea Process — AI Square Ad Generator",
  description: "Generate square ad creatives powered by your knowledge base.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
