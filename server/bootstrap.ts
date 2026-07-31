/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDbPool } from "./db/pool";
import { ensureProcurementSchema } from "./db/schema";
import { backfillUserIds, hydratePaymentEnvFromDb } from "./db/backfills";
import { createLeadsStore } from "./services/leads";
import { PaymentService } from "./payment/PaymentService";
import { UsersRepo } from "./repos/users.repo";
import { MembershipRepo } from "./repos/membership.repo";
import { PaymentsRepo } from "./repos/payments.repo";
import { createApp } from "./app";
import { startAutoTranslate } from "./services/autoTranslate";
import { startReportCacheCleanup } from "./services/reportCacheCleanup";
import type { AppContext } from "./context";

// In-memory persistent database for the live session
const leadsDb = createLeadsStore();

export async function startServer() {
  const PORT = 3039;

  // MySQL2 connection pool for crm database
  const dbPool = createDbPool();

  await ensureProcurementSchema(dbPool);
  await backfillUserIds(dbPool);
  await hydratePaymentEnvFromDb(dbPool);

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const paymentMode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = PaymentService.initDefault(paymentMode);

  // Repository 层初始化
  const usersRepo = new UsersRepo(dbPool);
  const membershipRepo = new MembershipRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);

  const ctx: AppContext = { dbPool, paymentService, paymentMode, leadsDb, usersRepo, membershipRepo, paymentsRepo };
  const app = createApp(ctx);

  // Vite Integration for high performance SPA support
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── 增量双语翻译定时任务（外抽至 services/autoTranslate.ts）──
  const stopAutoTranslate = startAutoTranslate(dbPool, {
    enabled: String(process.env.NOTICE_AUTO_TRANSLATE ?? "on").toLowerCase() !== "off",
    intervalMs: Number(process.env.NOTICE_AUTO_TRANSLATE_INTERVAL_MS || 10 * 60 * 1000),
    maxPerRun: Number(process.env.NOTICE_AUTO_TRANSLATE_MAX || 300),
    descMaxChars: Number(process.env.NOTICE_AUTO_TRANSLATE_DESC_MAX_CHARS || 8000),
    dailyCharBudget: Number(process.env.NOTICE_AUTO_TRANSLATE_DAILY_CHARS || 7_000_000),
  });

  // ── 月度清理（每月 1 号 08:00：报告缓存 + 过期 90 天译文）──
  const stopReportCacheCleanup = startReportCacheCleanup({
    enabled: String(process.env.REPORT_CACHE_CLEANUP ?? "on").toLowerCase() !== "off",
    dbPool,
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully functional on http://0.0.0.0:${PORT}`);
  });

  // 返回 stop 函数供优雅关闭使用
  return () => {
    stopAutoTranslate();
    stopReportCacheCleanup();
  };
}
