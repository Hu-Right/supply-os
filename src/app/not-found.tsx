// i18n-allow-file: 多根布局下的根级 404，中英双语静态文案（不加载 i18n 运行时）
/**
 * 全局 404（多根布局下的根级兜底）
 *
 * 采用 (zh)/(en) 双根布局后，app 目录不再有唯一根 layout，
 * 未匹配任何路由的 URL 由本文件兜底，因此必须自带 <html>/<body>。
 * 这里刻意不依赖 Providers / useLocale：404 只做静态双语文案，避免再引一层运行时失败面。
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="zh">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
            color: "#1e293b",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "40px", fontWeight: 700, color: "#0f766e", margin: 0 }}>404</h1>
          <p style={{ margin: 0 }}>页面不存在 / Page not found</p>
          <p style={{ display: "flex", gap: "16px", margin: 0, fontSize: "14px" }}>
            <Link href="/" style={{ color: "#0f766e" }}>返回首页</Link>
            <Link href="/en" style={{ color: "#0f766e" }}>English home</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
