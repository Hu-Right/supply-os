/**
 * 通用速率限制器工厂
 * Generic Rate Limiter Factory
 *
 * @module server/middleware/rateLimiter
 * @description 提供可复用的速率限制器，支持内存 + 文件持久化、滑动窗口、定期清理。
 *              替代 auth.routes.ts 中重复的速率限制逻辑，实现高内聚低耦合。
 */
import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";
import { extractClientIp } from "../utils/ip";

/** 速率限制器配置 */
export interface RateLimiterConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大失败/操作次数 */
  maxAttempts: number;
  /** 持久化文件路径（可选，不配置则不持久化） */
  persistFile?: string;
  /** 定期清理间隔（毫秒，可选，不配置则不清理） */
  cleanupIntervalMs?: number;
  /** 是否支持 lastSentAt 字段（手机号限流需要 60 秒间隔检查） */
  supportLastSentAt?: boolean;
  /** lastSentAt 最小间隔（毫秒，默认 60 秒） */
  minIntervalMs?: number;
}

/** 速率限制器实例 */
export interface RateLimiter {
  /** 检查是否被限制，返回 { blocked, retryAfterSec } */
  check: (key: string) => { blocked: boolean; retryAfterSec: number };
  /** 记录一次失败/操作 */
  record: (key: string) => void;
  /** 清除指定 key 的计数 */
  clear: (key: string) => void;
  /** 手动触发持久化 */
  persist: () => void;
}

/**
 * 创建速率限制器实例
 * @param config 配置对象
 * @returns 速率限制器实例
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

  // 内存存储
  const attempts = new Map<string, { count: number; resetAt: number; lastSentAt?: number }>();

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
      /* 文件损坏或不存在，从空状态开始 */
    }
  }

  // 持久化函数
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

  // 检查是否被限制
  function check(key: string): { blocked: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      // 首次访问或已过期，初始化条目
      attempts.set(key, { count: 0, resetAt: now + windowMs });
      return { blocked: false, retryAfterSec: 0 };
    }

    // 检查 lastSentAt 间隔（手机号限流场景）
    if (supportLastSentAt && entry.lastSentAt) {
      const timeSinceLastSent = now - entry.lastSentAt;
      if (timeSinceLastSent < minIntervalMs) {
        return {
          blocked: true,
          retryAfterSec: Math.ceil((minIntervalMs - timeSinceLastSent) / 1000),
        };
      }
    }

    // 检查最大尝试次数
    if (entry.count >= maxAttempts) {
      return {
        blocked: true,
        retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      };
    }

    return { blocked: false, retryAfterSec: 0 };
  }

  // 记录一次操作
  function record(key: string): void {
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
      attempts.set(key, {
        count: 1,
        resetAt: now + windowMs,
        ...(supportLastSentAt ? { lastSentAt: now } : {}),
      });
    } else {
      entry.count += 1;
      if (supportLastSentAt) {
        entry.lastSentAt = now;
      }
    }

    // 持久化
    persist();
  }

  // 清除指定 key
  function clear(key: string): void {
    attempts.delete(key);
    if (persistFile) persist();
  }

  // 定期清理过期条目
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

/**
 * Express 限流中间件工厂（P2-9：成本型接口限流复用）
 * 限流键默认 JWT 身份优先、匿名回退 IP（与 extractClientIp 同源，防 XFF 伪造）
 */
export function rateLimitMiddleware(
  config: RateLimiterConfig,
  keyFn?: (req: Request) => string,
): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = createRateLimiter(config);
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : (req.userKey || `ip:${extractClientIp(req)}`);
    const rl = limiter.check(key);
    if (rl.blocked) {
      res.set("Retry-After", String(rl.retryAfterSec));
      return res.status(429).json({ code: 42001, message: "请求过于频繁", error: "请求过于频繁", retry_after_seconds: rl.retryAfterSec });
    }
    limiter.record(key);
    next();
  };
}
