/**
 * (en) 根布局 — 英文站点分组（/en/*）
 *
 * 多根布局（Next 官方口径）：`<html lang>` 只能由根布局声明，
 * 中文根布局在 app/(zh)/layout.tsx，这里声明英文站点的 lang/dir 与英文 metadata。
 * 两个根布局互不嵌套，URL 分别是 `/` 与 `/en`。
 */
import type { Metadata, Viewport } from "next";
import "../globals.css";
import { SITE_URL, absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/services/seo/site";
import Providers from "../providers";
import { jsonLdScript } from "@/lib/services/seo/json-ld";

const EN_TITLE = "Yunjing · International Procurement Platform";
const EN_TITLE_TEMPLATE = "%s | Yunjing · International Procurement Platform";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: EN_TITLE, template: EN_TITLE_TEMPLATE },
  description:
    "Search UN, World Bank and government procurement notices worldwide, browse certified suppliers, and track international tender opportunities in one platform.",
  keywords: [
    "UN procurement",
    "government tenders",
    "international bidding",
    "public procurement",
    "supplier directory",
    "global sourcing",
  ],
  alternates: {
    canonical: absoluteUrl("/en"),
    languages: {
      "en": absoluteUrl("/en"),
      "zh-CN": absoluteUrl("/"),
      "x-default": absoluteUrl("/"),
    },
  },
  // 与中文站同口径：标签页用透明底 favicon，PWA/iOS 图标保留白底
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: EN_TITLE,
    description: "Search global government and UN procurement notices, suppliers and tender opportunities.",
    url: absoluteUrl("/en"),
    type: "website",
    siteName: EN_TITLE,
    locale: "en_US",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: EN_TITLE,
    description: "Search global government and UN procurement notices, suppliers and tender opportunities.",
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

const jsonLd = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Yunjing International Procurement Platform",
    alternateName: "云境·国际采购平台",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Yunjing is a procurement intelligence platform for UN, World Bank and government tender notices, supplier discovery and bid management.",
    areaServed: "Worldwide",
  },
  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Yunjing International Procurement Platform",
    url: absoluteUrl("/en"),
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/procurement?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
};

export default function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preload" href="/fonts/iconfont.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd.organization) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd.website) }} />
      </head>
      <body className="antialiased">
        <Providers initialLocale="en">{children}</Providers>
      </body>
    </html>
  );
}
