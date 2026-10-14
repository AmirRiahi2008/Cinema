import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "دو صندلی | سینمای کوچکِ ما",
  description: "یک فیلم، دو صندلی و یک شب مشترک. سینمای خصوصی دونفره با پخش هماهنگ و گفت‌وگوی زنده.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
