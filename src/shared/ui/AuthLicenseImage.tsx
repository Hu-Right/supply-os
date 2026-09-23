"use client";
/**
 * 鉴权图片（营业执照等私有资源）
 * Authenticated Image (private resources like business license)
 *
 * @module shared/ui/AuthLicenseImage
 * @description 执照已从 public/ 迁出，改由携带 Bearer 的鉴权路由回图，而 <img src> 无法
 *              附加 Authorization 头。本组件用 core/http 的 token 拉取 Blob → objectURL 渲染，
 *              卸载/换源时释放 objectURL。兼容存量 /uploads/license/... 直链（同源 fetch 均可）。
 */
import { useEffect, useState } from "react";
import { getAuthToken } from "@/core/http";

export interface AuthLicenseImageProps {
  /** 图片 URL（鉴权路由 /api/... 或存量 /uploads/...）；为空则不渲染 */
  url: string;
  alt?: string;
  /** 应用到 <img> 的类名 */
  className?: string;
  /** 加载失败时的占位（默认不渲染） */
  fallback?: React.ReactNode;
}

type LoadState = "loading" | "ok" | "error";

export function AuthLicenseImage({ url, alt = "", className, fallback }: AuthLicenseImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>(url ? "loading" : "error");

  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      setState("error");
      return;
    }
    let cancelled = false;
    let created = "";
    setState("loading");
    (async () => {
      try {
        const token = getAuthToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setObjectUrl(null);
    };
  }, [url]);

  if (state === "ok" && objectUrl) {
    return <img src={objectUrl} alt={alt} className={className} />;
  }
  if (state === "loading") {
    return <span className={className} aria-busy="true" />;
  }
  return <>{fallback ?? null}</>;
}

AuthLicenseImage.displayName = "AuthLicenseImage";
