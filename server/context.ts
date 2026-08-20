/**
 * 应用上下文
 * Application Context
 *
 * @module server/context
 * @description 按业务域拆分的领域上下文。
 *              统一使用领域上下文（如 ctx.notice.detailRepo）。
 *              双轨制退役（轨道A，2026-08-18）：原 @deprecated 顶层字段已全部删除，
 *              所有调用方已迁移至领域上下文。
 *              #7（2026-08-20）：已废弃的 NoticesRepo/SuppliersRepo 聚合 Facade 已删除，
 *              领域上下文直接注入拆分后的子 Repo（单一职责，消除双跳间接层）。
 */

import type { Pool } from "mysql2/promise";
import type { PaymentService } from "./payment/PaymentService";
import type { UsersRepo } from "./repos/users.repo";
import type { AuthRepo } from "./repos/auth.repo";
import type { MembershipRepo } from "./repos/membership.repo";
import type { PaymentsRepo } from "./repos/payments.repo";
import type { OpportunitiesRepo } from "./repos/opportunities.repo";
import type {
  NoticeDetailRepo, NoticeUnlockRepo, NoticeTranslationRepo,
  NoticeInteractionRepo, NoticeFeedbackRepo,
} from "./repos/notices/index";
import type {
  SupplierDirectoryRepo, SupplierRegistrationRepo, SupplierClaimRepo,
} from "./repos/suppliers/index";
import type { CatalogRepo } from "./repos/catalog.repo";
import type { UserPrefsRepo } from "./repos/user-prefs.repo";
import type { LeadsRepo } from "./repos/leads.repo";
import type { TrainingRepo, SystemRepo } from "./repos/training.repo";
import type { AdminRepo } from "./repos/admin.repo";

// ── 领域上下文 ────────────────────────────────────────────────────────────────

/** 公告域上下文（#7：子 Repo 直接注入） */
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

/** 供应商域上下文（#7：子 Repo 直接注入） */
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

// ── 应用上下文 ────────────────────────────────────────────────────────────────

export type AppContext = {
  /** 全局数据库连接池 */
  dbPool: Pool;

  // ── 领域上下文（新代码推荐） ──
  notice: NoticeContext;
  payment: PaymentContext;
  user: UserContext;
  supplier: SupplierContext;
  admin: AdminContext;

  // ── 其他领域 Repo（暂未分组） ──
  opportunitiesRepo: OpportunitiesRepo;
  catalogRepo: CatalogRepo;
  leadsRepo: LeadsRepo;
  trainingRepo: TrainingRepo;
  systemRepo: SystemRepo;
};
