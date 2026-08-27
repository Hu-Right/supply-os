/**
 * Root Layout — Next.js App Router
 *
 * 静态 layout：不调用 headers()/cookies()，确保子页面 ISR/SSG 生效。
 * 语言决议由 middleware.ts（根目录）处理：
 *   - middleware 从 Cookie / Accept-Language 解析语言，写入 x-locale 请求头
 *   - 客户端 LocaleProvider.detectLocale() 读取 Cookie
 *   - 客户端 setLocale() 切换语言并持久化到 Cookie
 *
 * <html lang/dir> 使用静态默认值，客户端 useEffect 会同步更新。
 */
import type { Metadata } from "next";
import "./globals.css";
import { getLocaleDir } from "@/core/i18n/bundles";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Supply OS — Global Procurement & Showrooms Portal",
    template: "%s | Supply OS",
  },
  description: "Global intelligent supply chain platform: showrooms, procurement search, supplier directory, CRM, training.",
  keywords: ["supply chain", "procurement", "bidding", "tender", "supplier"],
  alternates: {
    canonical: "https://osneosmart.com/",
    languages: { "x-default": "https://osneosmart.com/" },
  },
  openGraph: {
    title: "Supply OS — Global Procurement & Showrooms Portal",
    description: "Global intelligent supply chain platform: showrooms, procurement search, supplier directory, CRM, training.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
    siteName: "Supply OS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supply OS — Global Procurement & Showrooms Portal",
    description: "Global intelligent supply chain platform.",
  },
};

// 静态默认 locale —— 不调用 headers()/cookies()，保证 ISR/SSG 生效
const DEFAULT_LOCALE = "en";
const DEFAULT_DIR = getLocaleDir(DEFAULT_LOCALE);

// JSON-LD 结构化数据（Organization + WebSite），搜索引擎爬虫可直接读取
const jsonLd = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Supply OS",
    url: "https://osneosmart.com",
    logo: "https://osneosmart.com/logo.png",
    description: "Global intelligent supply chain platform.",
  },
  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Supply OS",
    url: "https://osneosmart.com",
    description: "外贸员的全球采购订单雷达",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://osneosmart.com/procurement?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE} dir={DEFAULT_DIR}>
      <head>
        {/* 预加载 iconfont woff2 字体（关键渲染路径，消除 FOIT/FOUT 延迟） */}
        <link rel="preload" href="/fonts/iconfont.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* JSON-LD 结构化数据：搜索引擎可直接读取（替代旧的 react-helmet-async 方案） */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.organization) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.website) }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
