/**
 * 通用速率限制器（Next.js 版）
 *
 * @module lib/middleware/rateLimiter
 * @description 从 server/middleware/rateLimiter.ts 移植，适配 Next.js 运行时。
 *              生产环境持久化路径 /app/logs/rate-limit/。
 */
import "server-only";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { extractClientIp } from "../utils/ip";

export interface RateLimiterConfig {
  windowMs: number;
  maxAttempts: number;
  persistFile?: string;
  cleanupIntervalMs?: number;
  supportLastSentAt?: boolean;
  minIntervalMs?: number;
}

export interface RateLimiter {
  check: (key: string) => { blocked: boolean; retryAfterSec: number };
  record: (key: string) => void;
  clear: (key: string) => void;
  persist: () => void;
}

/**
 * 创建速率限制器实例（模块级缓存避免热重载丢失）
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const {
    windowMs,
    maxAttempts,
    persistFile,
    cleanupIntervalMs,
    supportLastSentAt = false,
    minIntervalMs = 60_000,
  } = config;

  const globalForRl = globalThis as unknown as { _rlMap: Map<string, { count: number; resetAt: number; lastSentAt?: number }> | undefined };
  const attempts = globalForRl._rlMap ?? new Map<string, { count: number; resetAt: number; lastSentAt?: number }>();
  globalForRl._rlMap = attempts;

  // 启动时从文件恢复状态
  if (persistFile) {
    try {
      if (fs.existsSync(persistFile)) {
        const data = JSON.parse(fs.readFileSync(persistFile, "utf-8"));
        const now = Date.now();
        for (const [key, entry] of Object.entries(data as Record<string, { count: number; resetAt: number; lastSentAt?: number }>)) {
          if (entry.resetAt > now) {
            attempts.set(key, entry);
          }
        }
      }
    } catch {
      /* 文件损坏或不存在 */
    }
  }

  function persist(): void {
    if (!persistFile) return;
    try {
      if (attempts.size === 0) {
        if (fs.existsSync(persistFile)) fs.unlinkSync(persistFile);
        return;
      }
      const dir = path.dirname(persistFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, { count: number; resetAt: number; lastSentAt?: number }> = {};
      for (const [key, entry] of attempts) {
        obj[key] = entry;
      }
      fs.writeFileSync(persistFile, JSON.stringify(obj), "utf-8");
    } catch {
      /* 写入失败不影响主服务 */
    }
  }

  function check(key: string): { blocked: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 0, resetAt: now + windowMs });
      return { blocked: false, retryAfterSec: 0 };
    }

    if (supportLastSentAt && entry.lastSentAt) {
      const timeSinceLastSent = now - entry.lastSentAt;
      if (timeSinceLastSent < minIntervalMs) {
        return { blocked: true, retryAfterSec: Math.ceil((minIntervalMs - timeSinceLastSent) / 1000) };
      }
    }

    if (entry.count >= maxAttempts) {
      return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    }

    return { blocked: false, retryAfterSec: 0 };
  }

  function record(key: string): void {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs, ...(supportLastSentAt ? { lastSentAt: now } : {}) });
    } else {
      entry.count += 1;
      if (supportLastSentAt) entry.lastSentAt = now;
    }
    persist();
  }

  function clear(key: string): void {
    attempts.delete(key);
    if (persistFile) persist();
  }

  if (cleanupIntervalMs) {
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [key, entry] of attempts) {
        if (now > entry.resetAt) {
          attempts.delete(key);
          changed = true;
        }
      }
      if (changed && persistFile) persist();
    }, cleanupIntervalMs).unref();
  }

  return { check, record, clear, persist };
}

/** 生产环境持久化目录（容器内 /app/logs/） */
const RATE_LIMIT_PERSIST_DIR = "/app/logs/rate-limit";

/**
 * 限流守卫。
 * @returns null 放行；NextResponse 拒绝（429）。
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimiterConfig,
  keyFn?: (req: NextRequest) => string,
): NextResponse | null {
  const limiter = createRateLimiter(config);
  const ip = extractClientIp(req);
  const key = keyFn ? keyFn(req) : `ip:${ip}`;
  const rl = limiter.check(key);
  if (rl.blocked) {
    return NextResponse.json(
      { code: 42001, message: "请求过于频繁", error: "请求过于频繁", retry_after_seconds: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  limiter.record(key);
  return null;
}

/** 生产环境持久化目录（容器内 /app/logs/rate-limit/） */
export function getRateLimitPersistDir(): string {
  return process.env.NODE_ENV === "production" ? RATE_LIMIT_PERSIST_DIR : path.join(process.cwd(), "logs", "rate-limit");
}
