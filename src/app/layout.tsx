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
import { getPageMetadata } from "@/lib/i18n/metadata";
import Providers from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  const meta = getPageMetadata("showroom", locale);
  return {
    title: {
      default: meta.title,
      template: "%s | Supply OS",
    },
    description: meta.description,
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
