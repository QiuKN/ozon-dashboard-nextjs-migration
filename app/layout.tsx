import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ozon 商家数据台",
  description: "本机 Ozon 商家运营工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
