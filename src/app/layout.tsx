/**
 * Root Layout — Next.js App Router
 *
 * 静态 layout：不调用 headers()/cookies()，确保子页面 ISR/SSG 生效。
 * 语言决议完全由客户端处理：
 *   - proxy.ts 中间件将 Cookie 偏好写入 x-locale 请求头
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
};

// 静态默认 locale —— 不调用 headers()/cookies()，保证 ISR/SSG 生效
const DEFAULT_LOCALE = "en";
const DEFAULT_DIR = getLocaleDir(DEFAULT_LOCALE);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE} dir={DEFAULT_DIR}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
