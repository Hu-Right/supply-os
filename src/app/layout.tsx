/**
 * Root Layout — Phase 1 最小骨架
 * Phase 3 将替换为动态 lang/dir + i18n SSR + Providers
 */
import "./globals.css";

export const metadata = {
  title: "Supply OS",
  description: "全球智能供应链平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
