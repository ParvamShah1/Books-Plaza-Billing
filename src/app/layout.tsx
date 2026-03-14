import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BooksPlaza - Billing System",
  description: "Billing system for bookstores",
  icons: {
    icon: "/booksplaza-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-white text-neutral-900`}>
        {children}
      </body>
    </html>
  );
}
