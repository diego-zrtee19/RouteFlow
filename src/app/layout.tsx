import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteFlow — De tus redes a una compra clara",
  description:
    "Comparte un enlace de compra o tu catálogo. Consulta tus pedidos, sigue la entrega y pide ayuda desde RouteFlow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className="antialiased">
          <LanguageProvider>{children}</LanguageProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
