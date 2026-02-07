import type { Metadata } from "next";
import { Figtree, Fira_Mono } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-fig-tree",
  subsets: ["latin"],
});

const firaMono = Fira_Mono({
  variable: "--font-fira-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Panopticon",
  description:
    "Submit prompts and watch multiple AI agents work on cloud desktops in parallel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${figtree.variable} ${firaMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
