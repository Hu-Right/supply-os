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
import type { CatalogRepo } from "./repos/catalog.repo";
import type { UserPrefsRepo } from "./repos/user-prefs.repo";
import type { LeadsRepo } from "./repos/leads.repo";
import type { TrainingRepo, SystemRepo } from "./repos/training.repo";
import type { AdminRepo } from "./repos/admin.repo";

export type AppContext = {
  dbPool: Pool;
  paymentService: PaymentService;
  paymentMode: "live" | "mock";
  leadsDb: Lead[];
  // Repository 层
  usersRepo: UsersRepo;
  membershipRepo: MembershipRepo;
  paymentsRepo: PaymentsRepo;
  opportunitiesRepo: OpportunitiesRepo;
  noticesRepo: NoticesRepo;
  suppliersRepo: SuppliersRepo;
  catalogRepo: CatalogRepo;
  userPrefsRepo: UserPrefsRepo;
  leadsRepo: LeadsRepo;
  trainingRepo: TrainingRepo;
  systemRepo: SystemRepo;
  adminRepo: AdminRepo;
};
