/**
 * 集成测试辅助模块
 * Integration test helpers
 *
 * 提供 mock context 构造、mini Express app 创建、JWT 生成等公共能力。
 * 所有集成测试文件共享此 helper，避免重复 mock 样板代码。
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import supertest from "supertest";
import express from "express";
import type { AppContext } from "../../server/context";
export type { AppContext } from "../../server/context";
import { notFoundHandler, errorHandler } from "../../server/middleware/errorHandler";
import { optionalAuth } from "../../server/middleware/auth";

// ── Mock Repo 工厂 ────────────────────────────────────────────────────────────

/** 创建 mock UsersRepo（所有方法默认 vi.fn()） */
export function createMockUsersRepo(overrides?: Record<string, any>) {
  return {
    findByKey: vi.fn(),
    findAuthByKey: vi.fn(),
    findByPhone: vi.fn(),
    findProfileByKey: vi.fn(),
    create: vi.fn(),
    markEmailVerified: vi.fn(),
    updatePassword: vi.fn(),
    bindPhone: vi.fn(),
    bindPhoneIfUnbound: vi.fn(),
    unbindPhone: vi.fn(),
    ...overrides,
  };
}

/** 创建 mock AuthRepo */
export function createMockAuthRepo(overrides?: Record<string, any>) {
  return {
    createResetCode: vi.fn().mockResolvedValue(1),
    findLatestActiveCode: vi.fn().mockResolvedValue(null),
    markCodeUsed: vi.fn(),
    markEmailSent: vi.fn(),
    markSmsSent: vi.fn(),
    incrementCodeAttempts: vi.fn(),
    invalidateUnusedCodes: vi.fn(),
    findCodePhone: vi.fn().mockResolvedValue(null),
    insertRefreshToken: vi.fn(),
    findRefreshTokenByHash: vi.fn(),
    deleteRefreshTokenByHash: vi.fn(),
    deleteRefreshTokensByUser: vi.fn(),
    deleteExpiredRefreshTokens: vi.fn(),
    ...overrides,
  };
}

/** 创建 mock MembershipRepo */
export function createMockMembershipRepo(overrides?: Record<string, any>) {
  return {
    findActivePlans: vi.fn().mockResolvedValue([]),
    getFreeQuota: vi.fn().mockResolvedValue(5),
    countFreeUnlocks: vi.fn().mockResolvedValue(0),
    findActiveEntitlements: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/** 创建 mock SupplierRegistrationRepo */
export function createMockRegistrationRepo(overrides?: Record<string, any>) {
  return {
    findByUserKey: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

/** 创建 mock AppContext（最小化，按域覆盖） */
export function createMockContext(overrides?: {
  usersRepo?: Record<string, any>;
  authRepo?: Record<string, any>;
  membershipRepo?: Record<string, any>;
  registrationRepo?: Record<string, any>;
  [key: string]: any;
}): AppContext {
  const usersRepo = createMockUsersRepo(overrides?.usersRepo);
  const authRepo = createMockAuthRepo(overrides?.authRepo);
  const membershipRepo = createMockMembershipRepo(overrides?.membershipRepo);
  const registrationRepo = createMockRegistrationRepo(overrides?.registrationRepo);

  return {
    dbPool: {} as any,
    notice: {
      dbPool: {} as any,
      detailRepo: overrides?.noticeDetailRepo || {} as any,
      unlockRepo: overrides?.noticeUnlockRepo || {} as any,
      translationRepo: overrides?.noticeTranslationRepo || {} as any,
      interactionRepo: overrides?.noticeInteractionRepo || {} as any,
      feedbackRepo: overrides?.noticeFeedbackRepo || {} as any,
    },
    payment: {
      dbPool: {} as any,
      paymentService: overrides?.paymentService || {} as any,
      paymentMode: overrides?.paymentMode || "mock",
      paymentsRepo: overrides?.paymentsRepo || {} as any,
      membershipRepo,
    },
    user: {
      dbPool: {} as any,
      usersRepo,
      authRepo,
      membershipRepo,
      userPrefsRepo: overrides?.userPrefsRepo || {} as any,
    },
    supplier: {
      dbPool: {} as any,
      directoryRepo: overrides?.directoryRepo || {} as any,
      registrationRepo,
      claimRepo: overrides?.claimRepo || {} as any,
    },
    admin: {
      dbPool: {} as any,
      adminRepo: overrides?.adminRepo || {} as any,
      usersRepo,
    },
    opportunitiesRepo: overrides?.opportunitiesRepo || {} as any,
    catalogRepo: overrides?.catalogRepo || {} as any,
    leadsRepo: overrides?.leadsRepo || {} as any,
    trainingRepo: overrides?.trainingRepo || {} as any,
    systemRepo: overrides?.systemRepo || {} as any,
  } as unknown as AppContext;
}

// ── Mini App 构建器 ────────────────────────────────────────────────────────────

/**
 * 创建带基础中间件的 mini Express app（用于集成测试）
 * 包含：express.json + optionalAuth + 目标路由 + 404 + errorHandler
 */
export function createTestApp(
  mountRouter: (ctx: AppContext) => express.Router,
  ctx: AppContext,
  options?: { skipAuth?: boolean },
) {
  const app = express();
  app.use(express.json());
  if (!options?.skipAuth) {
    app.use(optionalAuth);
  }
  app.use(mountRouter(ctx));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** 快捷方法：创建 supertest agent */
export function createTestAgent(
  mountRouter: (ctx: AppContext) => express.Router,
  ctx: AppContext,
  options?: { skipAuth?: boolean },
) {
  const app = createTestApp(mountRouter, ctx, options);
  return { agent: supertest.agent(app), app };
}

// ── Mock RateLimiter ──────────────────────────────────────────────────────────

/** 创建永不拦截的 mock RateLimiter */
export function createMockRateLimiter() {
  return {
    check: vi.fn().mockReturnValue({ blocked: false, retryAfterSec: 0 }),
    record: vi.fn(),
    clear: vi.fn(),
    persist: vi.fn(),
  };
}

// ── 重新导出（测试文件常用） ──────────────────────────────────────────────────

export { describe, it, expect, vi, beforeAll, afterEach };
export { supertest };
