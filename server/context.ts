/**
 * 应用上下文
 * Application Context
 *
 * @module server/context
 * @description 按业务域拆分的领域上下文。
 *              统一使用领域上下文（如 ctx.notice.noticesRepo）。
 *              双轨制退役（轨道A，2026-08-18）：原 @deprecated 顶层字段已全部删除，
 *              所有调用方已迁移至领域上下文。
 */

import type { Pool } from "mysql2/promise";
import type { Lead } from "./types/crm";
import type { PaymentService } from "./payment/PaymentService";
import type { UsersRepo } from "./repos/users.repo";
import type { MembershipRepo } from "./repos/membership.repo";
import type { PaymentsRepo } from "./repos/payments.repo";
import type { OpportunitiesRepo } from "./repos/opportunities.repo";
import type { NoticesRepo } from "./repos/notices.repo";
import type { SuppliersRepo } from "./repos/suppliers.repo";
import type { CatalogRepo } from "./repos/catalog.repo";
import type { UserPrefsRepo } from "./repos/user-prefs.repo";
import type { LeadsRepo } from "./repos/leads.repo";
import type { TrainingRepo, SystemRepo } from "./repos/training.repo";
import type { AdminRepo } from "./repos/admin.repo";

// ── 领域上下文 ────────────────────────────────────────────────────────────────

/** 公告域上下文 */
export type NoticeContext = {
  dbPool: Pool;
  noticesRepo: NoticesRepo;
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
  membershipRepo: MembershipRepo;
  userPrefsRepo: UserPrefsRepo;
};

/** 供应商域上下文 */
export type SupplierContext = {
  dbPool: Pool;
  suppliersRepo: SuppliersRepo;
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
  /** 内存线索数据（leads 模块） */
  leadsDb: Lead[];

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
