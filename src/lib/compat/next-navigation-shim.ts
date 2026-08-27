/**
 * next/navigation 兼容垫片（Vite SPA 开发环境专用）
 * next/navigation compatibility shim for Vite SPA dev environment
 *
 * @description 开发模式下 Express+Vite 提供服务，无 Next.js App Router 上下文。
 *              此模块将 next/navigation 的 hooks 桥接到 react-router-dom，
 *              使迁移后的组件在 Vite 环境中正常运行。
 *              Vite alias 将 "next/navigation" 解析到此文件。
 *              生产构建由 Next.js 处理，不经过此垫片。
 */

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

/**
 * useRouter — 桥接 next/navigation useRouter → react-router-dom useNavigate
 */
export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
    prefetch: () => {
      /* no-op in Vite SPA */
    },
  };
}

/**
 * usePathname — 桥接 next/navigation usePathname → react-router-dom useLocation
 */
export function usePathname(): string {
  return useLocation().pathname;
}

/**
 * useSearchParams — 桥接 next/navigation useSearchParams
 * 直接从 useLocation().search 构造原生 URLSearchParams，
 * 避免依赖 react-router-dom 的 useSearchParams（v7 返回类型不保证 .get() 方法）
 */
export function useSearchParams(): [URLSearchParams, (params: Record<string, string>) => void] {
  const navigate = useNavigate();
  const location = useLocation();
  // 原生 URLSearchParams 保证 .get()/.set()/.delete() 等方法可用
  const searchParams = new URLSearchParams(location.search);

  const setSearchParams = (params: Record<string, string>) => {
    const usp = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(params)) {
      if (v === "" || v === undefined || v === null) {
        usp.delete(k);
      } else {
        usp.set(k, v);
      }
    }
    navigate(`${location.pathname}?${usp.toString()}`);
  };

  return [searchParams, setSearchParams];
}

/**
 * redirect — 服务端重定向在客户端无意义，降级为 location.replace
 */
export function redirect(url: string): never {
  window.location.replace(url);
  // 抛出不可达异常以满足 TypeScript never 返回类型
  throw new Error("redirect() should never return");
}

/**
 * Navigate 组件 — 桥接 next/navigation Navigate → react-router-dom Navigate
 */
export { Navigate } from "react-router-dom";
