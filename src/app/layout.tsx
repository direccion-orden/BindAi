import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BusinessFlow - ERP y Finanzas Inteligentes",
  description: "La plataforma integral para administrar ventas, inventarios, compras y tu contabilidad sincronizada con el SAT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground font-body flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
