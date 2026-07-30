/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Pool } from "mysql2/promise";
import type { Lead } from "../src/types";
import type { PaymentService } from "../src/payment/PaymentService";

export type AppContext = {
  dbPool: Pool;
  paymentService: PaymentService;
  paymentMode: "live" | "mock";
  leadsDb: Lead[];            // 内存线索库（原 L1655），单实例引用共享
};
