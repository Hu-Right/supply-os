/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import os from "os";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createDbPool } from "./db/pool";
import { PaymentService } from "./payment/PaymentService";
import { UsersRepo } from "./repos/users.repo";
import { AuthRepo } from "./repos/auth.repo";
import { MembershipRepo } from "./repos/membership.repo";
import { PaymentsRepo } from "./repos/payments.repo";
import { OpportunitiesRepo } from "./repos/opportunities.repo";
import {
  NoticeDetailRepo, NoticeUnlockRepo, NoticeTranslationRepo,
  NoticeInteractionRepo, NoticeFeedbackRepo,
} from "./repos/notices/index";
import {
  SupplierDirectoryRepo, SupplierRegistrationRepo, SupplierClaimRepo,
} from "./repos/suppliers/index";
import { CatalogRepo } from "./repos/catalog.repo";
import { UserPrefsRepo } from "./repos/user-prefs.repo";
import { LeadsRepo } from "./repos/leads.repo";
import { TrainingRepo, SystemRepo } from "./repos/training.repo";
import { AdminRepo } from "./repos/admin.repo";
import { createApp } from "./app";
import { startAutoTranslate } from "./services/translation/auto";
import { startReportCacheCleanup } from "./services/reportCacheCleanup";
import { initMeilisearch, ensureIndex, isHealthy as isMeiliHealthy } from "./services/meilisearch/index";
import { startSearchSync, startWideTableSync } from "./services/search-sync/index";
import { startSyncRetryQueue } from "./services/search-sync/sync-retry-queue";
import { enqueue } from "./services/search-sync/sync-queue";
import { registerFeaturedSyncCallback } from "./services/notices/featured";
import { runWarmup } from "./lifecycle/warmup";
import { startAllTimers } from "./lifecycle/timers";
import { schemaPhase, seedsPhase, agencyAliasPhase, backfillPhase, featuredPhase, paymentPhase, executePhase } from "./lifecycle/phases";
import type { AppContext } from "./context";

// 双轨制退役（轨道D）：leadsDb 内存数组已删除——线索全量持久化至 MySQL
// （ungm_1v1_appointments），消除进程重启数据丢失与多实例不一致问题。

/**
 * 服务句柄（C1【P0】优雅关闭改造）
 * @property stop     仅停止后台定时器与同步任务（原返回语义，保留兼容）
 * @property shutdown 完整优雅关闭：停后台任务 → 停止接收新请求并排空在途请求 → 关闭数据库连接池
 */
export interface ServerHandle {
  stop: () => void;
  shutdown: () => Promise<void>;
}

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
  const authRepo = new AuthRepo(dbPool);
  const membershipRepo = new MembershipRepo(dbPool);
  const paymentsRepo = new PaymentsRepo(dbPool);
  const opportunitiesRepo = new OpportunitiesRepo(dbPool);
  // #7：公告/供应商域直接实例化子 Repo（原聚合 Facade 已删除）
  const noticeDetailRepo = new NoticeDetailRepo(dbPool);
  const noticeUnlockRepo = new NoticeUnlockRepo(dbPool);
  const noticeTranslationRepo = new NoticeTranslationRepo(dbPool);
  const noticeInteractionRepo = new NoticeInteractionRepo(dbPool);
  const noticeFeedbackRepo = new NoticeFeedbackRepo(dbPool);
  const supplierDirectoryRepo = new SupplierDirectoryRepo(dbPool);
  const supplierRegistrationRepo = new SupplierRegistrationRepo(dbPool);
  const supplierClaimRepo = new SupplierClaimRepo(dbPool);
  const catalogRepo = new CatalogRepo(dbPool);
  const userPrefsRepo = new UserPrefsRepo(dbPool);
  const leadsRepo = new LeadsRepo(dbPool);
  const trainingRepo = new TrainingRepo(dbPool);
  const systemRepo = new SystemRepo(dbPool);
  const adminRepo = new AdminRepo(dbPool);

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const paymentMode: "live" | "mock" = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = PaymentService.initDefault(paymentsRepo, paymentMode, membershipRepo);

  // 领域上下文（唯一访问入口）
  const notice = {
    dbPool,
    detailRepo: noticeDetailRepo,
    unlockRepo: noticeUnlockRepo,
    translationRepo: noticeTranslationRepo,
    interactionRepo: noticeInteractionRepo,
    feedbackRepo: noticeFeedbackRepo,
  };
  const payment = { dbPool, paymentService, paymentMode, paymentsRepo, membershipRepo };
  const user = { dbPool, usersRepo, authRepo, membershipRepo, userPrefsRepo };
  const supplier = {
    dbPool,
    directoryRepo: supplierDirectoryRepo,
    registrationRepo: supplierRegistrationRepo,
    claimRepo: supplierClaimRepo,
  };
  const admin = { dbPool, adminRepo, usersRepo };

  const ctx: AppContext = {
    dbPool,
    // 领域上下文（唯一访问入口；双轨制退役轨道A：顶层 @deprecated 字段已删除）
    notice, payment, user, supplier, admin,
    // 其他领域 Repo
    opportunitiesRepo, catalogRepo, leadsRepo, trainingRepo, systemRepo,
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
    //    index: false —— 禁止 express.static 自动服务 index.html，
    //    所有 HTML 请求统一走 SPA 回退路由，确保缓存头一致（修复 CDN 层旧 HTML 残留）
    //    setHeaders: 对直接请求 /index.html 的路径也强制 no-store（防止 CDN 缓存旧 HTML）
    app.use(
      express.static(distPath, {
        maxAge: "1d",
        etag: true,
        lastModified: true,
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      })
    );

    // 3) SPA 回退：所有未匹配路由（含 /）返回 index.html
    //    Cache-Control: no-store —— 最强不缓存指令，浏览器 + CDN（Cloudflare）均不得缓存
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
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
  let stopSyncRetryQueue: (() => void) | undefined;
  if (String(process.env.MEILI_ENABLED ?? "off").toLowerCase() === "on") {
    // 异步初始化，不阻塞服务启动
    void (async () => {
      try {
        const meiliClient = initMeilisearch();
        if (meiliClient) {
          const indexReady = await ensureIndex();
          if (indexReady) {
            stopSearchSync = startSearchSync(dbPool, { intervalMs: 10 * 1000 });
            // 阶段 3 加固：级联同步失败重试队列
            stopSyncRetryQueue = startSyncRetryQueue(dbPool);
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
  // [阶段0 S3] 增量同步周期 10s → 5s：外部 CRM 管道新数据可见延迟减半（主键水位轻扫描，负载可忽略）
  const stopWideTableSync = startWideTableSync(dbPool, { intervalMs: 5 * 1000 });

  // ── 精选状态变更联动同步（修复 G3）──
  // refreshFeaturedColumn 更新 is_featured 后，将变更 ID 入同步队列，
  // 触发宽表更新 → Meilisearch 级联，确保精选状态及时入索引
  registerFeaturedSyncCallback((ids: number[]) => {
    enqueue(dbPool, ids);
  });

  // ── 定时任务统一管理（外抽至 lifecycle/timers.ts）──
  const timersHandle = startAllTimers({ dbPool });

  // ── 服务先监听，预热在后台异步完成（非阻塞启动）──
  // C1：保留 httpServer 引用，供优雅关闭时停止接收新请求并排空在途连接
  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    const lanIp = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface?.family === "IPv4" && !iface.internal)?.address
      ?? "localhost";
    console.log(`Server listening on http://localhost:${PORT}  (LAN: http://${lanIp}:${PORT})`);
  });

  // ── P0 性能优化：启动时预热（后台异步，不阻塞启动）──
  void runWarmup({ dbPool, directoryRepo: supplierDirectoryRepo })
    .catch((e) => console.error("[warmup] 预热失败（静默降级，首次请求将承担冷启动）:", (e as Error).message));

  // C1【P0】优雅关闭：返回 stop/shutdown 句柄，由入口（server.ts）接线 SIGTERM/SIGINT。
  // 关闭顺序依据：先停后台任务（不再产生新的 DB 写入/同步工作），
  // 再停止接收新请求并等待在途请求处理完毕，最后关闭连接池确保无半开连接。
  const stop = () => {
    stopAutoTranslate();
    stopReportCacheCleanup();
    stopSearchSync?.();
    stopSyncRetryQueue?.();
    stopWideTableSync();
    timersHandle.stop();
  };

  const shutdown = async () => {
    console.log("[shutdown] 停止后台定时器与同步任务…");
    stop();

    console.log("[shutdown] 停止接收新请求，等待在途请求完成…");
    await new Promise<void>((resolve) => {
      // close() 在所有现存连接处理完毕后回调；不再接受新连接
      httpServer.close(() => resolve());
      // Node ≥18.2 可用：立即关闭空闲 keep-alive 连接，避免 close() 挂等到对端超时。
      // 类型断言原因：@types/node 与运行时 Node 版本差异，做存在性检查保证低版本安全。
      const srv = httpServer as typeof httpServer & { closeIdleConnections?: () => void };
      if (typeof srv.closeIdleConnections === "function") {
        srv.closeIdleConnections();
      }
    });

    console.log("[shutdown] 关闭 MySQL 连接池…");
    try {
      await dbPool.end();
    } catch (e) {
      // 连接池关闭失败不阻断退出流程（进程即将终止），仅记录便于事后诊断
      console.error("[shutdown] 连接池关闭异常:", (e as Error).message);
    }
    console.log("[shutdown] 优雅关闭完成");
  };

  return { stop, shutdown };
}
