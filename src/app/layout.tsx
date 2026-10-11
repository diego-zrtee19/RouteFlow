import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteFlow — The trust layer for social commerce",
  description:
    "Get paid with escrow, share a purchase link, and release funds when your buyer receives the product.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased">
          <LanguageProvider>{children}</LanguageProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
