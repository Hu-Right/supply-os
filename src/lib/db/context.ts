/**
 * 应用上下文 / Application Context
 * @module lib/db/context
 * @description 按业务域拆分的领域上下文。统一使用领域上下文（如 ctx.notice.detailRepo）。
 *              从 server/context.ts 复制，新增 getContext() 工厂函数（原逻辑在 bootstrap.ts 中）。
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { getPool } from "./pool";
import { PaymentService } from "../payment/PaymentService";
import { UsersRepo } from "../repos/users.repo";
import { AuthRepo } from "../repos/auth.repo";
import { MembershipRepo } from "../repos/membership.repo";
import { PaymentsRepo } from "../repos/payments.repo";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import {
  NoticeDetailRepo,
  NoticeUnlockRepo,
  NoticeTranslationRepo,
  NoticeInteractionRepo,
  NoticeFeedbackRepo,
} from "../repos/notices/index";
import {
  SupplierDirectoryRepo,
  SupplierRegistrationRepo,
  SupplierClaimRepo,
} from "../repos/suppliers/index";
import { CatalogRepo } from "../repos/catalog.repo";
import { UserPrefsRepo } from "../repos/user-prefs.repo";
import { LeadsRepo } from "../repos/leads.repo";
import { ChatRepo } from "../repos/chat.repo";
import { TrainingRepo, SystemRepo } from "../repos/training.repo";
import { AdminRepo } from "../repos/admin.repo";

/** 公告域上下文 */
export type NoticeContext = {
  dbPool: Pool;
  detailRepo: NoticeDetailRepo;
  unlockRepo: NoticeUnlockRepo;
  translationRepo: NoticeTranslationRepo;
  interactionRepo: NoticeInteractionRepo;
  feedbackRepo: NoticeFeedbackRepo;
};

/** 支付域上下文 */
export type PaymentContext = {
  dbPool: Pool;
  paymentService: PaymentService;
  paymentMode: "live" | "mock";
  paymentsRepo: PaymentsRepo;
  membershipRepo: MembershipRepo;
};

/** 用户域上下文 */
export type UserContext = {
  dbPool: Pool;
  usersRepo: UsersRepo;
  authRepo: AuthRepo;
  membershipRepo: MembershipRepo;
  userPrefsRepo: UserPrefsRepo;
};

/** 供应商域上下文 */
export type SupplierContext = {
  dbPool: Pool;
  directoryRepo: SupplierDirectoryRepo;
  registrationRepo: SupplierRegistrationRepo;
  claimRepo: SupplierClaimRepo;
};

/** 管理运维域上下文 */
export type AdminContext = {
  dbPool: Pool;
  adminRepo: AdminRepo;
  usersRepo: UsersRepo;
};

export type AppContext = {
  dbPool: Pool;
  notice: NoticeContext;
  payment: PaymentContext;
  user: UserContext;
  supplier: SupplierContext;
  admin: AdminContext;
  opportunitiesRepo: OpportunitiesRepo;
  catalogRepo: CatalogRepo;
  leadsRepo: LeadsRepo;
  chatRepo: ChatRepo;
  trainingRepo: TrainingRepo;
  systemRepo: SystemRepo;
};

const globalForCtx = globalThis as unknown as { _appCtx: AppContext | undefined };

/**
 * 构建并缓存完整的 AppContext（globalThis 单例）。
 * 在 instrumentation.ts 的 6 阶段完成后调用。
 */
export function getContext(): AppContext {
  if (globalForCtx._appCtx) return globalForCtx._appCtx;

  const dbPool = getPool();
  const paymentMode = (process.env.PAYMENT_MODE || "mock") as "live" | "mock";

  const usersRepo = new UsersRepo(dbPool);
  const authRepo = new AuthRepo(dbPool);
  const membershipRepo = new MembershipRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);
  const opportunitiesRepo = new OpportunitiesRepo(dbPool);

  const detailRepo = new NoticeDetailRepo(dbPool);
  const unlockRepo = new NoticeUnlockRepo(dbPool);
  const translationRepo = new NoticeTranslationRepo(dbPool);
  const interactionRepo = new NoticeInteractionRepo(dbPool);
  const feedbackRepo = new NoticeFeedbackRepo(dbPool);

  const directoryRepo = new SupplierDirectoryRepo(dbPool);
  const registrationRepo = new SupplierRegistrationRepo(dbPool);
  const claimRepo = new SupplierClaimRepo(dbPool);

  const catalogRepo = new CatalogRepo(dbPool);
  const userPrefsRepo = new UserPrefsRepo(dbPool);
  const leadsRepo = new LeadsRepo(dbPool);
  const chatRepo = new ChatRepo(dbPool);
  const trainingRepo = new TrainingRepo(dbPool);
  const systemRepo = new SystemRepo(dbPool);
  const adminRepo = new AdminRepo(dbPool);

  const paymentService = PaymentService.initDefault(paymentsRepo, paymentMode as "mock" | "live", membershipRepo);

  const ctx: AppContext = {
    dbPool,
    notice: { dbPool, detailRepo, unlockRepo, translationRepo, interactionRepo, feedbackRepo },
    payment: { dbPool, paymentService, paymentMode, paymentsRepo, membershipRepo },
    user: { dbPool, usersRepo, authRepo, membershipRepo, userPrefsRepo },
    supplier: { dbPool, directoryRepo, registrationRepo, claimRepo },
    admin: { dbPool, adminRepo, usersRepo },
    opportunitiesRepo,
    catalogRepo,
    leadsRepo,
    chatRepo,
    trainingRepo,
    systemRepo,
  };

  globalForCtx._appCtx = ctx;
  return ctx;
}
