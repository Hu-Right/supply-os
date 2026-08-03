/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Pool } from "mysql2/promise";
import type { Lead } from "../src/types";
import type { PaymentService } from "./payment/PaymentService";
import type { UsersRepo } from "./repos/users.repo";
import type { MembershipRepo } from "./repos/membership.repo";
import type { PaymentsRepo } from "./repos/payments.repo";
import type { OpportunitiesRepo } from "./repos/opportunities.repo";
import type { NoticesRepo } from "./repos/notices.repo";
import type { SuppliersRepo } from "./repos/suppliers.repo";

export type AppContext = {
  dbPool: Pool;
  paymentService: PaymentService;
  paymentMode: "live" | "mock";
  leadsDb: Lead[];            // 内存线索库（原 L1655），单实例引用共享
  // Repository 层（Batch 1 新增，逐步替代路由中的裸 SQL）
  usersRepo: UsersRepo;
  membershipRepo: MembershipRepo;
  paymentsRepo: PaymentsRepo;
  opportunitiesRepo: OpportunitiesRepo;
  noticesRepo: NoticesRepo;
  suppliersRepo: SuppliersRepo;
};
