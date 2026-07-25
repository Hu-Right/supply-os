/**
 * React 19 声明式数据获取 Hook
 * React 19 Declarative Data Fetching Hook
 *
 * @module core/http/useFetch
 * @description 基于 React 19 `use()` API 的声明式数据获取 Hook。
 *              底层调用 `apiCached` 统一缓存层，避免 StrictMode 双渲染下的重复副作用。
 *              Declarative data fetching Hook based on React 19 `use()` API.
 *              Uses `apiCached` internally, avoids duplicate side effects under StrictMode double rendering.
 */

import { use, useMemo, useState } from "react";
import { apiCached, getCachedData, getCachedTimestamp } from "./api-client";

const DEFAULT_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 声明式数据获取 Hook
 * Declarative Data Fetching Hook
 *
 * @param endpoint - API 端点
 * @param ttl - 缓存有效期（毫秒），默认 5 分钟
 * @returns `{ data: T; refresh: () => void }`
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const { data: users, refresh } = useFetch<User[]>("/api/users");
 *   return (
 *     <div>
 *       <button onClick={refresh}>刷新</button>
 *       {users.map(u => <div key={u.id}>{u.name}</div>)}
 *     </div>
 *   );
 * }
 * ```
 *
 * @description
 * - `useMemo` 包裹数据获取，避免 StrictMode 双渲染下的重复副作用
 * - `refresh()` 递增 `refreshKey`，强制 `useMemo` 重新计算
 * - `refreshKey === 0` 时尝试读缓存，`> 0` 时强制重新请求
 */
export function useFetch<T>(
  endpoint: string,
  ttl = DEFAULT_TTL,
): { data: T; refresh: () => void } {
  const [refreshKey, setRefreshKey] = useState(0);

  const promise = useMemo(() => {
    // refreshKey === 0：首次渲染，尝试读缓存
    if (refreshKey === 0) {
      const cached = getCachedData<T>(endpoint);
      const ts = getCachedTimestamp(endpoint);
      if (cached !== undefined && Date.now() - ts < ttl) {
        return Promise.resolve(cached);
      }
    }
    // refreshKey > 0 或缓存过期：强制重新请求
    return apiCached<T>(endpoint, ttl);
  }, [endpoint, ttl, refreshKey]);

  return {
    data: use(promise),
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
