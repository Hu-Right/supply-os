/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import os from "os";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDbPool } from "./db/pool";
import { createLeadsStore } from "./services/leads";
import { PaymentService } from "./payment/PaymentService";
import { UsersRepo } from "./repos/users.repo";
import { MembershipRepo } from "./repos/membership.repo";
import { PaymentsRepo } from "./repos/payments.repo";
import { OpportunitiesRepo } from "./repos/opportunities.repo";
import { NoticesRepo } from "./repos/notices.repo";
import { SuppliersRepo } from "./repos/suppliers.repo";
import { CatalogRepo } from "./repos/catalog.repo";
import { UserPrefsRepo } from "./repos/user-prefs.repo";
import { LeadsRepo } from "./repos/leads.repo";
import { TrainingRepo, SystemRepo } from "./repos/training.repo";
import { AdminRepo } from "./repos/admin.repo";
import { createApp } from "./app";
import { startAutoTranslate } from "./services/translation/auto";
import { startReportCacheCleanup } from "./services/reportCacheCleanup";
import { initMeilisearch, ensureIndex, isHealthy as isMeiliHealthy } from "./services/meilisearch/index";
import { startSearchSync } from "./services/searchSync";
import { startWideTableSync } from "./services/search-sync/index";
import { runWarmup } from "./lifecycle/warmup";
import { startAllTimers } from "./lifecycle/timers";
import { schemaPhase, seedsPhase, agencyAliasPhase, backfillPhase, featuredPhase, paymentPhase, executePhase } from "./lifecycle/phases";
import type { AppContext } from "./context";

// In-memory persistent database for the live session
const leadsDb = createLeadsStore();

export async function startServer() {
  const PORT = 3039;

  // MySQL2 connection pool for crm database
  const dbPool = createDbPool();
  const phaseCtx = { dbPool };

  // 分阶段启动：Schema 迁移 → 种子数据 → 机构别名 → 用户回填 → 精选回填 → 支付环境
  const phases = [schemaPhase, seedsPhase, agencyAliasPhase, backfillPhase, featuredPhase, paymentPhase];
  for (const phase of phases) {
    const success = await executePhase(phase, phaseCtx);
    if (!success && !phase.optional) {
      throw new Error(`启动阶段 ${phase.name} 失败，服务终止`);
    }
  }

  // Repository 层初始化
  const usersRepo = new UsersRepo(dbPool);
  const membershipRepo = new MembershipRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);
  const opportunitiesRepo = new OpportunitiesRepo(dbPool);
  const noticesRepo = new NoticesRepo(dbPool);
  const suppliersRepo = new SuppliersRepo(dbPool);
  const catalogRepo = new CatalogRepo(dbPool);
  const userPrefsRepo = new UserPrefsRepo(dbPool);
  const leadsRepo = new LeadsRepo(dbPool);
  const trainingRepo = new TrainingRepo(dbPool);
  const systemRepo = new SystemRepo(dbPool);
  const adminRepo = new AdminRepo(dbPool);

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const paymentMode: "live" | "mock" = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = PaymentService.initDefault(paymentsRepo, paymentMode);

  // 领域上下文（新代码推荐）
  const notice = { dbPool, noticesRepo };
  const payment = { dbPool, paymentService, paymentMode, paymentsRepo, membershipRepo };
  const user = { dbPool, usersRepo, membershipRepo, userPrefsRepo };
  const supplier = { dbPool, suppliersRepo };
  const admin = { dbPool, adminRepo, usersRepo };

  const ctx: AppContext = {
    dbPool, leadsDb,
    // 领域上下文
    notice, payment, user, supplier, admin,
    // 其他领域 Repo
    opportunitiesRepo, catalogRepo, leadsRepo, trainingRepo, systemRepo,
    // 向后兼容顶层字段（@deprecated）
    noticesRepo, usersRepo, paymentsRepo, membershipRepo, suppliersRepo, userPrefsRepo, adminRepo, paymentService, paymentMode,
  };
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

    // ── 分层缓存策略 ──
    // 1) 带哈希的静态资源（JS/CSS/图片/字体）→ 强缓存 1 年
    //    内容变化 → 哈希变化 → 文件名变化 → 浏览器必须重新下载
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true,
        etag: true,
        lastModified: false,
      })
    );

    // 2) public 目录静态资源（下载文件、图片等）→ 缓存 1 天 + 每次验证
    app.use(
      express.static(distPath, {
        maxAge: "1d",
        etag: true,
        lastModified: true,
        // 对 HTML 文件不缓存，确保用户始终获取最新版本
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
          }
        },
      })
    );

    // 3) SPA 回退：所有未匹配路由返回 index.html，并设置 no-cache 头
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
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

  // ── Meilisearch 搜索引擎初始化（非阻塞：后台异步完成）──
  // MEILI_ENABLED=on 时激活；不可用时搜索自动降级到 MySQL FULLTEXT
  let stopSearchSync: (() => void) | undefined;
  if (String(process.env.MEILI_ENABLED ?? "off").toLowerCase() === "on") {
    // 异步初始化，不阻塞服务启动
    void (async () => {
      try {
        const meiliClient = initMeilisearch();
        if (meiliClient) {
          const indexReady = await ensureIndex();
          if (indexReady) {
            stopSearchSync = startSearchSync(dbPool, { intervalMs: 10 * 1000 });
          } else {
            console.warn("[meilisearch] 索引未就绪（健康检查失败）: 搜索将降级到 MySQL FULLTEXT");
          }
        }
      } catch (e) {
        console.warn("[meilisearch] 初始化失败（静默降级）:", (e as Error).message);
      }
    })();
  }

  // ── 搜索宽表同步（非阻塞：后台异步回填 + 增量同步）──
  // 宽表就绪后，搜索 Phase 2 直接从宽表读取（零 JOIN），大幅提升性能
  const stopWideTableSync = startWideTableSync(dbPool, { intervalMs: 10 * 1000 });

  // ── 定时任务统一管理（外抽至 lifecycle/timers.ts）──
  const timersHandle = startAllTimers({ dbPool });

  // ── 服务先监听，预热在后台异步完成（非阻塞启动）──
  app.listen(PORT, "0.0.0.0", () => {
    const lanIp = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface?.family === "IPv4" && !iface.internal)?.address
      ?? "localhost";
    console.log(`Server listening on http://localhost:${PORT}  (LAN: http://${lanIp}:${PORT})`);
  });

  // ── P0 性能优化：启动时预热（后台异步，不阻塞启动）──
  void runWarmup({ dbPool, noticesRepo, suppliersRepo })
    .catch((e) => console.error("[warmup] 预热失败（静默降级，首次请求将承担冷启动）:", (e as Error).message));

  // 返回 stop 函数供优雅关闭使用
  return () => {
    stopAutoTranslate();
    stopReportCacheCleanup();
    stopSearchSync?.();
    stopWideTableSync();
    timersHandle.stop();
  };
}
