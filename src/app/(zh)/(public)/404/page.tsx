// i18n-allow-file: 404 兜底页（中文主站）；英文站由 (en) 分组自行承接
/**
 * /404 — 代理层兜底页
 *
 * @description 供 proxy.ts 在「公告不存在」时 rewrite 使用（状态码 404）。
 *              不走 notFound()：流式响应开始后无法再改状态码，代理层提前判定才能
 *              给搜索引擎/AI 一个真正的 404。直接访问本路径时同样 noindex。
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "页面不存在",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-black text-teal-600">404</p>
      <h1 className="text-xl font-bold text-slate-900">页面不存在或已下线</h1>
      <p className="text-sm text-slate-500">
        你访问的公告可能已过期、被撤回，或链接有误。可以回到全球商机重新搜索。
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/procurement"
          className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
        >
          搜索全球商机
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-400 hover:text-teal-700"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
