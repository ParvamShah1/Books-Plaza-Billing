import type { Metadata, Viewport } from "next";
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
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Books Plaza", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
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
