/**
 * 统一 HTTP 请求层
 * Unified HTTP Client Layer
 *
 * @module core/http/api-client
 * @description 带 TTL 缓存 + 401 拦截 + API base URL 的统一请求层。
 *              所有 API 请求通过此模块发出，缓存由模块级 Map 统一管理。
 *              Unified request layer with TTL cache, 401 interception, and API base URL.
 */

import { emitAppEvent } from "@/core/events";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

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
const cache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * 基础请求函数
 * Base request function
 *
 * @param endpoint - API 端点（相对路径或完整 URL）
 * @param options - 请求配置（支持 body 自动 JSON 序列化，可直接传对象）
 * @returns 响应数据
 */
export async function api<T>(
  endpoint: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, ...init } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 未授权：触发全局事件，由 App 层监听并弹出登录框
  if (res.status === 401) {
    emitAppEvent("supply-os:unauthorized", { endpoint });
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
): Promise<T> {
  const cached = cache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  const data = await api<T>(endpoint);
  cache.set(endpoint, { data, timestamp: Date.now() });
  return data;
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
