/**
 * Root Layout — Next.js App Router
 *
 * 动态 lang/dir 来自服务端语言决议（middleware → x-locale header）。
 * hydration 注入 initialLocale 给客户端 LocaleProvider。
 */
import type { Metadata } from "next";
import "./globals.css";
import { getLocaleDir, type Locale } from "@/core/i18n/bundles";
import { getServerI18n } from "@/lib/i18n/server";
import Providers from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: "Supply OS — 全球智能供应链平台",
      template: "%s | Supply OS",
    },
    description: "全球智能供应链平台：展厅、采购搜索、供应商目录、CRM、培训认证。",
    keywords: ["supply chain", "procurement", "bidding", "tender", "supplier", "招标", "采购"],
    alternates: {
      canonical: "https://osneosmart.com/",
      languages: { "x-default": "https://osneosmart.com/" },
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getServerI18n();
  const dir = getLocaleDir(locale as string);

  return (
    <html lang={locale} dir={dir}>
      <body className="antialiased">
        <Providers initialLocale={locale as Locale}>{children}</Providers>
      </body>
    </html>
  );
}
