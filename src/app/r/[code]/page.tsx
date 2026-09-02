/**
 * /r/[code] — 员工推广扫码落地页（客户端）
 *
 * 用户扫码后在浏览器中设置 ref_code + qr_auto_open Cookie，
 * 然后跳转到 /showroom。采用客户端实现确保 Cookie 100% 写入成功。
 */
"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

const CODE_PATTERN = /^EMP-[A-Z0-9]{4,12}$/i;

export default function ReferralPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  useEffect(() => {
    const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
    const normalized = (rawCode || "").trim().toUpperCase();

    // 格式校验失败 → 直接跳 showroom（不带弹窗信号）
    if (!CODE_PATTERN.test(normalized)) {
      router.replace("/showroom");
      return;
    }

    // 7 天后过期
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    // 在浏览器中直接写入 Cookie，100% 可靠
    document.cookie = `ref_code=${encodeURIComponent(normalized)}; path=/; expires=${expires.toUTCString()}; SameSite=lax`;
    document.cookie = `qr_auto_open=1; path=/; SameSite=lax`;

    // 立即跳转到展厅页
    router.replace("/showroom");
  }, [params.code, router]);

  return null;
}
