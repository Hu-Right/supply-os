/**
 * react-router-dom → next/navigation 兼容层
 *
 * 迁移过渡期使用：将 react-router-dom 的 hook API 映射到 next/navigation，
 * 使现有 feature 组件无需大规模重写即可在 Next.js App Router 中运行。
 * Phase 6 删除此文件及所有消费方的导入。
 */
"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useSearchParams as nextUseSearchParams,
  useRouter as nextUseRouter,
  usePathname,
} from "next/navigation";

// ── useSearchParams 兼容 ─────────────────────────────────────────────
// react-router-dom: const [searchParams, setSearchParams] = useSearchParams();
// Next.js:          const searchParams = useSearchParams(); // readonly
// 本 shim 提供 [readonlyParams, setterFn] 元组，setter 支持 RRD 的两种调用签名

type SetSearchParams = (
  params: Record<string, string> | URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  options?: { replace?: boolean },
) => void;

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const nextParams = nextUseSearchParams();
  const router = nextUseRouter();
  const pathname = usePathname();

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (nextParams) {
      nextParams.forEach((value, key) => sp.set(key, value));
    }
    return sp;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextParams?.toString()]);

  const setSearchParams: SetSearchParams = useCallback(
    (next, opts) => {
      const current = new URLSearchParams();
      if (nextParams) {
        nextParams.forEach((value, key) => current.set(key, value));
      }

      let updated: URLSearchParams;
      if (typeof next === "function") {
        updated = next(current);
      } else if (next instanceof URLSearchParams) {
        updated = next;
      } else {
        updated = new URLSearchParams();
        for (const [k, v] of Object.entries(next || {})) {
          if (v !== undefined && v !== null) updated.set(k, String(v));
        }
      }

      const qs = updated.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace !== false) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [nextParams, router, pathname],
  );

  return [params, setSearchParams];
}

// ── useNavigate 兼容 ──────────────────────────────────────────────────
// react-router-dom: const navigate = useNavigate();
//   navigate(path) / navigate(path, { state }) / navigate(-1)
// Next.js:          const router = useRouter();
//   router.push(path) / router.back()

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

type NavigateFn = {
  (to: string, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  const router = nextUseRouter();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        // navigate(-1) → router.back()
        router.back();
        return;
      }
      // state 通过 sessionStorage 传递（Next.js 无路由 state 等价物）
      if (options?.state !== undefined) {
        try {
          sessionStorage.setItem("__route_state__", JSON.stringify(options.state));
        } catch { /* quota exceeded — ignore */ }
      }
      if (options?.replace) {
        router.replace(to);
      } else {
        router.push(to);
      }
    },
    [router],
  );
}

// ── useLocation 兼容 ──────────────────────────────────────────────────
// react-router-dom: const location = useLocation();
//   location.pathname / location.state / location.search
// Next.js:          usePathname() + useSearchParams()

interface LocationCompat {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

export function useLocation(): LocationCompat {
  const pathname = usePathname();
  const searchParams = nextUseSearchParams();

  return useMemo(() => {
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    let state: unknown = null;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("__route_state__");
        if (raw) {
          state = JSON.parse(raw);
          sessionStorage.removeItem("__route_state__");
        }
      } catch { /* ignore */ }
    }
    return { pathname, search, hash: "", state, key: "default" };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);
}

// ── Navigate 组件兼容 ─────────────────────────────────────────────────
// react-router-dom: <Navigate to="/path" replace />
// 实现：客户端 useEffect 重定向

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const router = nextUseRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [to, replace, router]);
  return null;
}
