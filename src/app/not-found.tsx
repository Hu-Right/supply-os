/**
 * 404 — 未知路径
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold text-primary-600">404</h1>
      <p className="text-secondary-800">页面不存在</p>
      <Link href="/showroom" className="text-primary-600 underline">
        返回展厅
      </Link>
    </main>
  );
}