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
      default: "云境全球智能展厅与国际采购操作系统",
      template: "%s | 云境公采",
    },
    description: "云境OS是外贸员的全球采购订单雷达。登录即可看到哪些国家、哪些机构、哪些企业正在采购您的产品。799元/年入驻，获取全球采购商机。",
    keywords: ["国际采购", "全球采购", "外贸", "采购订单", "Tender", "招标公告", "供应商管理", "CRM", "外贸员", "采购雷达", "osneosmart", "云境公采"],
    authors: [{ name: "云境科技" }],
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "云境全球智能展厅",
      title: "云境全球智能展厅与国际采购操作系统",
      description: "外贸员的全球采购订单雷达 - 直接查看哪些国家、机构、企业正在采购您的产品",
      url: "https://osneosmart.com/",
      images: [{ url: "https://osneosmart.com/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "云境全球智能展厅与国际采购操作系统",
      description: "外贸员的全球采购订单雷达 - 直接查看全球采购商机",
      images: ["https://osneosmart.com/og-image.png"],
    },
    alternates: {
      canonical: "https://osneosmart.com/",
      languages: { "x-default": "https://osneosmart.com/" },
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
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
