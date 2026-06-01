import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业级 RAG 系统",
  description: "Enterprise RAG System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
