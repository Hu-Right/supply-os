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

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

// ── JWT Token 管理 ──
// B2【P1】安全加固：Access Token 仍存 localStorage（短生命 2h，XSS 窗口有限），
// Refresh Token 已迁移到 HttpOnly Cookie（服务端设置，JS 不可读，XSS 无法窃取）。
const AUTH_TOKEN_KEY = "supply_os_auth_token";

/** 获取当前 Access Token */
export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** 存储 Access Token（Refresh Token 由服务端 HttpOnly Cookie 下发） */
export function setAuthTokens(token: string, _refreshToken?: string): void {
  // P2 容错：localStorage 满或隐私模式下可能抛异常
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
    console.warn("[http] localStorage 写入 Access Token 失败:", (e as Error).message);
  }
}

/** 清除 Access Token（Refresh Token Cookie 由服务端登出接口自动清除） */
export function clearAuthTokens(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
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

// P3 缓存容量保护：超过上限时淘汰最旧条目，防止长时间运行内存膨胀
const MAX_CACHE_ENTRIES = 200;

function evictCacheIfNeeded(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  // 淘汰最早写入的条目（时间戳相同时回退到 Map 插入顺序）
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp;
      oldestKey = key;
    }
  }
  // 回退：时间戳全部相同时，淘汰 Map 中第一个条目（即最早插入的）
  if (!oldestKey) {
    oldestKey = cache.keys().next().value ?? null;
  }
  if (oldestKey) cache.delete(oldestKey);
}

// ── Token 刷新状态管理 ──
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/** 尝试刷新 Access Token（Refresh Token 由 HttpOnly Cookie 自动携带） */
async function tryRefreshToken(): Promise<string | null> {
  // B2【P1】无需手动读取 refresh_token——HttpOnly Cookie 由浏览器自动发送
  // credentials: "same-origin" 确保同域请求携带 Cookie

  // 避免并发刷新
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", // B2【P1】携带 HttpOnly Refresh Token Cookie
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        // P3-4：服务端 Refresh Token 轮换——新 refresh_token 由服务端自动写入 Cookie；
        // #5：响应体已不再携带 refresh_token，仅需更新 Access Token
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

  // P3-15 安全修复：仅在有 body 时才附加 Content-Type，GET/HEAD 请求不携带无意义的 Content-Type
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    ...init,
    signal,
    credentials: "same-origin", // B2【P1】同域请求自动携带 HttpOnly Cookie（Refresh Token）
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
      ...(init.headers as Record<string, string>),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
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

  // 401 未授权：先解析响应体，区分业务错误（如登录凭证错误）与 Token 过期
  if (res.status === 401) {
    const errBody = await res.json().catch(() => ({}));
    // 含 code 字段 → 业务级错误（sendError 端口），直接透传服务端消息
    if (errBody.code) {
      throw new ApiError(401, errBody.message || errBody.error || "Unauthorized");
    }
    // 无 code 字段 → Token 过期，尝试刷新
    const newToken = await tryRefreshToken();
    if (newToken) {
      // 用新 Token 重试原请求
      const retryRes = await fetch(url, {
        ...init,
        signal,
        credentials: "same-origin", // B2【P1】重试请求同样携带 HttpOnly Cookie
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${newToken}`,
          ...(init.headers as Record<string, string>),
        },
        body: hasBody ? JSON.stringify(body) : undefined,
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
 * @param signal - AbortSignal
 * @param force - P1-12 安全修复：强制跳过缓存读取，直接发请求
 * @returns 响应数据（可能来自缓存）
 */
export async function apiCached<T>(
  endpoint: string,
  ttl = DEFAULT_TTL,
  signal?: AbortSignal,
  force = false,
): Promise<T> {
  // P1-12: force 模式跳过缓存读取
  if (!force) {
    const cached = cache.get(endpoint);
    if (cached && Date.now() - cached.timestamp < ttl) {
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
  }

  // 飞行中请求去重：同一端点已有未完成的请求，复用其 Promise
  // P1-13 安全修复：有 signal 的请求不复用，防止 AbortSignal 泄漏给其他调用方
  const pending = pendingRequests.get(endpoint);
  if (pending && !signal) {
    return pending.promise as Promise<T>;
  }

  // 发起请求并缓存 Promise，防止并发穿透
  const promise = api<T>(endpoint, { signal }).then((data) => {
    evictCacheIfNeeded();
    cache.set(endpoint, { data, timestamp: Date.now() });
    pendingRequests.delete(endpoint);
    return data;
  }).catch((err) => {
    pendingRequests.delete(endpoint);
    throw err;
  });
  // 只有无 signal 的请求才加入 pending 复用池
  if (!signal) {
    pendingRequests.set(endpoint, { promise });
  }
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
  evictCacheIfNeeded();
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

/**
 * 统一文件下载通道：带鉴权拉取 Blob 后触发浏览器保存。
 * 用于 report/附件等 Blob 响应端点（api() 仅支持 JSON，且 <a> 直链无法携带 Bearer）。
 * 文件名优先取 Content-Disposition，缺失时使用 fallbackFileName。
 */
export async function downloadFile(url: string, fallbackFileName: string): Promise<void> {
  const authToken = getAuthToken();
  const res = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    credentials: "same-origin",
  });
  if (!res.ok) throw new ApiError(res.status, `Download failed: ${res.status}`);
  const disposition = res.headers.get("Content-Disposition") || "";
  const matched = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = matched ? decodeURIComponent(matched[1]) : fallbackFileName;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
