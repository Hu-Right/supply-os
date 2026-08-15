/**
 * 应用上下文
 * Application Context
 *
 * @module server/context
 * @description 按业务域拆分的领域上下文 + 向后兼容的顶层字段。
 *              新代码应使用领域上下文（如 ctx.notice.noticesRepo），
 *              旧代码仍可通过顶层字段（如 ctx.noticesRepo）访问（@deprecated）。
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

  // ── 向后兼容顶层字段（@deprecated，新代码请使用领域上下文） ──
  /** @deprecated 请使用 ctx.notice.noticesRepo */
  noticesRepo: NoticesRepo;
  /** @deprecated 请使用 ctx.user.usersRepo */
  usersRepo: UsersRepo;
  /** @deprecated 请使用 ctx.payment.paymentsRepo */
  paymentsRepo: PaymentsRepo;
  /** @deprecated 请使用 ctx.payment.membershipRepo 或 ctx.user.membershipRepo */
  membershipRepo: MembershipRepo;
  /** @deprecated 请使用 ctx.supplier.suppliersRepo */
  suppliersRepo: SuppliersRepo;
  /** @deprecated 请使用 ctx.user.userPrefsRepo */
  userPrefsRepo: UserPrefsRepo;
  /** @deprecated 请使用 ctx.admin.adminRepo */
  adminRepo: AdminRepo;
  /** @deprecated 请使用 ctx.payment.paymentService */
  paymentService: PaymentService;
  /** @deprecated 请使用 ctx.payment.paymentMode */
  paymentMode: "live" | "mock";
};
