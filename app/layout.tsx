import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enterprise Hybrid RAG | Elegance AI",
  description:
    "See how an AI customer-service agent combines enterprise data, Vector RAG, ontology and Graph RAG to resolve complex distributor returns for a fictional battery company.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-ink antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
