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
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocaleDir } from "@/core/i18n/bundles";
import { SITE_URL, absoluteUrl } from "@/lib/services/seo/site";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "云境·国际采购平台 — 全球采购与海外展厅协同系统",
    template: "%s | 云境·国际采购平台",
  },
  description: "云境·国际采购平台：联合国及全球政府采购公告搜索、供应商目录、CRM 客户管理、投标服务、学习培训一站式平台。助力中国企业连接全球采购机遇。",
  keywords: ["云境", "国际采购", "政府采购", "联合国采购", "供应商管理", "招标", "投标", "CRM", "海外展厅", "UN procurement", "global sourcing"],
  alternates: {
    canonical: absoluteUrl("/"),
    languages: { "x-default": absoluteUrl("/") },
  },
  openGraph: {
    title: "云境·国际采购平台 — 全球采购与海外展厅协同系统",
    description: "联合国及全球政府采购公告搜索、供应商目录、CRM、投标服务、学习培训。助力中国企业连接全球采购机遇。",
    images: [{ url: "/images/brand-icon.svg", width: 120, height: 120, alt: "云境·国际采购平台" }],
    type: "website",
    siteName: "云境·国际采购平台",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "云境·国际采购平台",
    description: "联合国及全球政府采购公告搜索、供应商目录、CRM、投标服务一站式平台。",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e", // teal-700 品牌色
};

// 静态默认 locale —— 不调用 headers()/cookies()，保证 ISR/SSG 生效
const DEFAULT_LOCALE = "en";
const DEFAULT_DIR = getLocaleDir(DEFAULT_LOCALE);

// JSON-LD 结构化数据（Organization + WebSite），搜索引擎爬虫可直接读取
const jsonLd = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "云境·国际采购平台",
    alternateName: "Yunjing International Procurement Platform",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: "云境·国际采购平台 — 联合国及全球政府采购公告搜索、供应商目录、CRM 客户管理、投标服务、学习培训一站式平台。",
    foundingDate: "2026",
    areaServed: "Worldwide",
    serviceType: ["国际采购", "政府采购", "供应商管理", "CRM", "投标服务", "培训"],
  },
  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "云境·国际采购平台",
    url: SITE_URL,
    description: "外贸员的全球采购订单雷达 — 联合国、世界银行、各国政府招标信息一站式搜索与管理",
    inLanguage: ["zh-CN", "en", "fr", "es", "ru", "ar"],
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/procurement?q={search_term_string}`,
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
        {/* Skip Navigation — 键盘/屏幕阅读器用户可直接跳到主内容区 (WCAG 2.4.1) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
