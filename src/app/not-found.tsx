"use client";

/**
 * 404 — 未知路径
 * Not Found page
 *
 * @description 2026-11 i18n 整改：文案改走 i18n 键（notFoundTitle / errorBoundaryBackHome），
 *              此前硬编码中文，非中文用户看到的仍是「页面不存在」。
 */
import Link from "next/link";
import { useLocale } from "@/core/i18n";

export default function NotFound() {
  const { t } = useLocale();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold text-primary-600">404</h1>
      <p className="text-secondary-800">{t("notFoundTitle")}</p>
      <Link href="/" className="text-primary-600 underline">
        {t("errorBoundaryBackHome")}
      </Link>
    </main>
  );
}
