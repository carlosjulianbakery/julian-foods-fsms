import type { Metadata } from "next";
import { EB_Garamond, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Julian Bakery — Food Safety Management",
  description: "Food Safety Management System for Julian Bakery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${garamond.variable} ${spaceMono.variable} font-garamond`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
