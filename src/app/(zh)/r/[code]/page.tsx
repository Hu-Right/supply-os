/**
 * /r/[code] — 推广扫码落地页（客户端）
 *
 * 用户扫码后在浏览器中设置 ref_code + qr_auto_open Cookie，
 * 然后跳转到首页；支持 ?next=站内相对路径（如 /procurement/diagnosis）直达目标页。
 * 采用客户端实现确保 Cookie 100% 写入成功。
 *
 * 支持两种码命名空间（与注册侧 invitation.repo 的前缀分流一致）：
 *   EMP-员工推广码 / CH-渠道商注册码。2026-10-30 注册邀请码改为必填后，
 *   渠道商也需要能把 CH- 码做成链接分发，故这里不再只放行 EMP- 前缀。
 *   码是否真实有效/未停用由注册接口（服务端）最终判定，本页只做形制校验与 Cookie 写入。
 */
"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

const CODE_PATTERN = /^(?:EMP|CH)-[A-Z0-9]{4,12}$/i;

/** 只允许站内相对路径，防止 ?next= 变成开放重定向 */
function safeNextPath(raw: string | null): string {
  const v = String(raw || "").trim();
  if (!v || !v.startsWith("/") || v.startsWith("//")) return "/";
  try {
    const u = new URL(v, window.location.origin);
    if (u.origin !== window.location.origin) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}

export default function ReferralPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  useEffect(() => {
    const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
    const normalized = (rawCode || "").trim().toUpperCase();

    // 格式校验失败 → 直接跳首页（不带弹窗信号）
    if (!CODE_PATTERN.test(normalized)) {
      router.replace("/");
      return;
    }

    // 7 天后过期
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    // 在浏览器中直接写入 Cookie，100% 可靠
    document.cookie = `ref_code=${encodeURIComponent(normalized)}; path=/; expires=${expires.toUTCString()}; SameSite=lax`;

    // 带 next 的场景（如诊断链接）直接去目标页，不弹首页注册框；
    // 目标页未登录时会自己触发布局层的登录/注册弹窗，且 ref_code 已就绪。
    const rawNext = new URLSearchParams(window.location.search).get("next");
    if (rawNext) {
      router.replace(safeNextPath(rawNext));
      return;
    }

    document.cookie = `qr_auto_open=1; path=/; SameSite=lax`;
    router.replace("/");
  }, [params.code, router]);

  return null;
}
