/**
 * 统一 HTTP 请求层
 * Unified HTTP Client Layer
 *
 * @module core/http/api-client
 * @description 带 TTL 缓存 + 401 拦截 + API base URL 的统一请求层。
 *              所有 API 请求通过此模块发出，缓存由模块级 Map 统一管理。
 *              Unified request layer with TTL cache, 401 interception, and API base URL.
 */

import { recordApiMetric } from "@/core/perf";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// ── JWT Token 管理 ──
const AUTH_TOKEN_KEY = "supply_os_auth_token";
const REFRESH_TOKEN_KEY = "supply_os_refresh_token";

/** 获取当前 Access Token */
export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** 存储 Token 对 */
export function setAuthTokens(token: string, refreshToken: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** 清除所有 Token */
export function clearAuthTokens(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** 获取 Refresh Token */
export function getRefreshToken(): string | null {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** 更新 Access Token（刷新后调用） */
export function updateAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * API 错误类
 * API Error Class
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 分钟

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

interface PendingEntry {
  promise: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();
// 飞行中请求缓存：防止同一端点的并发请求穿透缓存（竞态条件）
const pendingRequests = new Map<string, PendingEntry>();

// ── Token 刷新状态管理 ──
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/** 尝试刷新 Access Token */
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  // 避免并发刷新
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        updateAuthToken(data.token);
        return data.token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * 基础请求函数
 * Base request function
 *
 * @param endpoint - API 端点（相对路径或完整 URL）
 * @param options - 请求配置（支持 body 自动 JSON 序列化）
 * @returns 响应数据
 */
export async function api<T>(
  endpoint: string,
  options: Omit<RequestInit, "body"> & { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { body, signal, ...init } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const method = init.method || "GET";
  const startTime = performance.now();

  // 自动附加 JWT Access Token
  const authToken = getAuthToken();
  const authHeaders: Record<string, string> = {};
  if (authToken) {
    authHeaders["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    ...init,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init.headers as Record<string, string>),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const durationMs = Math.round(performance.now() - startTime);

  // 记录 API 指标
  recordApiMetric({
    endpoint,
    method,
    durationMs,
    cached: false,
    status: res.status,
    timestamp: Date.now(),
  });

  // 401 未授权：尝试刷新 Token 并重试
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // 用新 Token 重试原请求
      const retryRes = await fetch(url, {
        ...init,
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...(init.headers as Record<string, string>),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (retryRes.ok) return retryRes.json();
      // 刷新后仍然 401，Token 已失效，清除并触发登录
      if (retryRes.status === 401) {
        clearAuthTokens();
        window.dispatchEvent(
          new CustomEvent("supply-os:unauthorized", { detail: { endpoint } }),
        );
        throw new ApiError(401, "Unauthorized");
      }
      const err = await retryRes.json().catch(() => ({}));
      throw new ApiError(retryRes.status, err.error || `Request failed: ${retryRes.status}`);
    }
    // 刷新失败，清除 Token 并触发全局事件
    clearAuthTokens();
    window.dispatchEvent(
      new CustomEvent("supply-os:unauthorized", { detail: { endpoint } }),
    );
    throw new ApiError(401, "Unauthorized");
  }

  // 其他错误
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

/**
 * 带 TTL 缓存的请求函数
 * Request function with TTL cache
 *
 * @param endpoint - API 端点
 * @param ttl - 缓存有效期（毫秒），默认 5 分钟
 * @returns 响应数据（可能来自缓存）
 */
export async function apiCached<T>(
  endpoint: string,
  ttl = DEFAULT_TTL,
  signal?: AbortSignal,
): Promise<T> {
  const cached = cache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < ttl) {
    // 记录缓存命中
    recordApiMetric({
      endpoint,
      method: "GET",
      durationMs: 0,
      cached: true,
      status: 200,
      timestamp: Date.now(),
    });
    return cached.data as T;
  }

  // 飞行中请求去重：同一端点已有未完成的请求，复用其 Promise
  const pending = pendingRequests.get(endpoint);
  if (pending) {
    return pending.promise as Promise<T>;
  }

  // 发起请求并缓存 Promise，防止并发穿透
  const promise = api<T>(endpoint, { signal }).then((data) => {
    cache.set(endpoint, { data, timestamp: Date.now() });
    pendingRequests.delete(endpoint);
    return data;
  }).catch((err) => {
    pendingRequests.delete(endpoint);
    throw err;
  });
  pendingRequests.set(endpoint, { promise });
  return promise;
}

// ============ 缓存受控接口 ============

/** 获取缓存数据（不检查 TTL） */
export function getCachedData<T = unknown>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

/** 获取缓存时间戳 */
export function getCachedTimestamp(key: string): number {
  return cache.get(key)?.timestamp ?? 0;
}

/** 设置缓存数据 */
export function setCachedData(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** 删除缓存数据 */
export function deleteCachedData(key: string): void {
  cache.delete(key);
}

/**
 * 清空缓存
 * @param pattern - 可选，只清空 key 包含此字符串的缓存项
 */
export function clearApiCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}
