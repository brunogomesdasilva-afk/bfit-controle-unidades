import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { RouteProgressBar } from "./RouteProgressBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BFIT | Controle de unidades",
  description: "Controle de unidades BFIT",
  // iPhone: "Adicionar à Tela de Início" abre em tela cheia, com o nome BFIT (o ícone é o src/app/apple-icon.png).
  appleWebApp: { capable: true, title: "BFIT", statusBarStyle: "default" },
};

// Cor da barra do navegador/sistema no celular (o grafite do menu).
export const viewport: Viewport = {
  themeColor: "#3b4047",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
