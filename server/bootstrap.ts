/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import os from "os";
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
import { OpportunitiesRepo } from "./repos/opportunities.repo";
import { NoticesRepo } from "./repos/notices.repo";
import { SuppliersRepo } from "./repos/suppliers.repo";
import { CatalogRepo } from "./repos/catalog.repo";
import { UserPrefsRepo } from "./repos/user-prefs.repo";
import { LeadsRepo } from "./repos/leads.repo";
import { TrainingRepo, SystemRepo } from "./repos/training.repo";
import { AdminRepo } from "./repos/admin.repo";
import { createApp } from "./app";
import { startAutoTranslate } from "./services/autoTranslate";
import { startReportCacheCleanup } from "./services/reportCacheCleanup";
import { refreshFeaturedColumn } from "./services/notices";
import { searchNotices, refreshNoticeStats, refreshIsActive, refreshNoticeCountries, refreshNoticeAgencies } from "./services/noticeSearch";
import { seedAgencyAliases } from "./services/agencyAliasSeed";
import { initMeilisearch, ensureIndex, syncNoticeIds, isHealthy as isMeiliHealthy } from "./services/meilisearch";
import { startSearchSync } from "./services/searchSync";
import type { AppContext } from "./context";

// In-memory persistent database for the live session
const leadsDb = createLeadsStore();

/**
 * 每天在指定小时（本地时区）执行一次回调，返回可 clearTimeout 的 timer。
 * 内部用 setTimeout 链式调度：每次计算到目标时刻的毫秒数，执行后重新调度。
 */
function scheduleDailyAt(hour: number, cb: () => Promise<void>): NodeJS.Timeout {
  let timer: NodeJS.Timeout;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    timer = setTimeout(async () => {
      await cb();
      schedule(); // 执行后调度次日
    }, delay);
  };
  schedule();
  return timer!;
}

export async function startServer() {
  const PORT = 3039;

  // MySQL2 connection pool for crm database
  const dbPool = createDbPool();

  await ensureProcurementSchema(dbPool);

  // 机构别名映射种子数据（启动时自动写入，已存在则跳过）
  try {
    const seedCount = await seedAgencyAliases(dbPool);
    if (seedCount > 0) {
      console.log(`[agency-alias] 种子数据写入: ${seedCount} 条别名映射`);
    }
  } catch (e) {
    console.error("[agency-alias] 种子数据写入失败（静默降级）:", (e as Error).message);
  }

  await backfillUserIds(dbPool);

  // P6 性能优化：启动时回填 is_featured 预计算列，之后每 30 分钟增量刷新
  // 回滚：删除以下 refreshFeaturedColumn 调用和 setInterval
  try {
    const result = await refreshFeaturedColumn(dbPool);
    console.log(`[featured-init] 初始回填完成: marked=${result.marked} unmarked=${result.unmarked}`);
    // 将初始回填的 is_featured 变更同步到 Meilisearch
    if (result.changedIds.length > 0 && isMeiliHealthy()) {
      const syncResult = await syncNoticeIds(dbPool, result.changedIds);
      if (syncResult.synced > 0) {
        console.log(`[meilisearch] is_featured 初始同步: ${syncResult.synced} 条`);
      }
    }
  } catch (e) {
    console.error("[featured-init] 初始回填失败:", (e as Error).message);
  }
  const featuredRefreshTimer = setInterval(async () => {
    try {
      const result = await refreshFeaturedColumn(dbPool);
      // 将 is_featured 状态变更同步到 Meilisearch
      if (result.changedIds.length > 0 && isMeiliHealthy()) {
        const syncResult = await syncNoticeIds(dbPool, result.changedIds);
        if (syncResult.synced > 0) {
          console.log(`[meilisearch] is_featured 状态同步: ${syncResult.synced} 条`);
        }
      }
    } catch { /* 静默降级 */ }
  }, 30 * 60 * 1000); // 30 分钟
  // 方案D：is_active 每 10 分钟增量刷新（过期公告标记为 inactive）
  // 回滚：删除 isActiveRefreshTimer 和 clearInterval
  const isActiveRefreshTimer = setInterval(async () => {
    try {
      const result = await refreshIsActive(dbPool);
      await refreshNoticeStats(dbPool); // is_active 变化后同步刷新统计表
      // 将 is_active 状态变更同步到 Meilisearch
      if (result.changedIds.length > 0 && isMeiliHealthy()) {
        const syncResult = await syncNoticeIds(dbPool, result.changedIds);
        if (syncResult.synced > 0) {
          console.log(`[meilisearch] is_active 状态同步: ${syncResult.synced} 条`);
        }
      }
    } catch { /* 静默降级 */ }
  }, 10 * 60 * 1000); // 10 分钟
  await hydratePaymentEnvFromDb(dbPool);

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const paymentMode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = PaymentService.initDefault(paymentMode);

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

  const ctx: AppContext = { dbPool, paymentService, paymentMode, leadsDb, usersRepo, membershipRepo, paymentsRepo, opportunitiesRepo, noticesRepo, suppliersRepo, catalogRepo, userPrefsRepo, leadsRepo, trainingRepo, systemRepo, adminRepo };
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

  // ── Meilisearch 搜索引擎初始化（异步全量同步 + 1 分钟增量同步）──
  // MEILI_ENABLED=on 时激活；不可用时搜索自动降级到 MySQL FULLTEXT
  let stopSearchSync: (() => void) | undefined;
  if (String(process.env.MEILI_ENABLED ?? "off").toLowerCase() === "on") {
    try {
      const meiliClient = initMeilisearch();
      if (meiliClient) {
        const indexReady = await ensureIndex();
        if (indexReady) {
          stopSearchSync = startSearchSync(dbPool, { intervalMs: 1 * 60 * 1000 });
          console.log("[meilisearch] 初始化完成: 索引已就绪, 增量同步已启动 (间隔 1 分钟)");
        } else {
          console.warn("[meilisearch] 索引未就绪（健康检查失败）: 搜索将降级到 MySQL FULLTEXT");
        }
      }
    } catch (e) {
      console.warn("[meilisearch] 初始化失败（静默降级）:", (e as Error).message);
    }
  }

  // ── P0 性能优化：启动时预热 MySQL Buffer Pool + 填充搜索缓存 ──
  // 消除首次用户请求的 ~3000ms 冷启动延迟
  try {
    const warmupStart = performance.now();
    // 方案D：先回填 is_active 列（确保搜索查询可走索引）
    const isActiveResult = await refreshIsActive(dbPool);
    // 将 is_active 状态变更同步到 Meilisearch（确保索引与 MySQL 一致）
    if (isActiveResult.changedIds.length > 0 && isMeiliHealthy()) {
      const syncResult = await syncNoticeIds(dbPool, isActiveResult.changedIds);
      console.log(`[meilisearch] 启动时 is_active 同步: ${syncResult.synced} 条`);
    }
    // 方案C：刷新预计算统计表（在搜索预热前执行，依赖 is_active 列）
    await refreshNoticeStats(dbPool);
    // 1) 公告首页（中文 + 英文）——触发 notices 表 + 翻译表全量加载到 Buffer Pool
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh" }, noticesRepo);
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "en" }, noticesRepo);
    // 2) 翻页预热——消除 page=2 的首次冷查询
    await searchNotices(dbPool, { page: 2, pageSize: 9, locale: "zh" }, noticesRepo);
    // 3) 中文关键词 FULLTEXT 预热——加载 ft_notices_search (ngram) 索引页到 Buffer Pool
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction" }, noticesRepo);
    // 4) 英文关键词 FULLTEXT 预热——加载 ft_notices_en + ft_notices_desc 索引页到 Buffer Pool
    //    这是冷启动最大瓶颈：137K 行的非 ngram FULLTEXT 索引页首次需全量从磁盘读取
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "en", q: "construction" }, noticesRepo);
    // 5) 纯筛选预热——触发 Meilisearch 路径（如有）+ 翻译表 LIKE 补充路径
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", country: "Canada" }, noticesRepo);
    // 6) 关键词+筛选联合预热——触发混合搜索路径（Meilisearch 预筛选 + FULLTEXT 约束）
    await searchNotices(dbPool, { page: 1, pageSize: 9, locale: "zh", q: "construction", country: "Canada" }, noticesRepo);
    // 7) 国家 + 机构下拉数据预热（大表 GROUP BY，冷查询最慢可达数秒）
    await refreshNoticeCountries(dbPool);
    await refreshNoticeAgencies(dbPool);
    // 8) 供应商列表——触发 suppliers 表预热
    await suppliersRepo.listDirectory();
    const warmupMs = Math.round(performance.now() - warmupStart);
    console.log(`[warmup] 查询预热完成: ${warmupMs}ms (zh/en 首页 + 中文/英文 FULLTEXT + 纯筛选 + 混合搜索 + 国家/机构 + 供应商)`);
  } catch (e) {
    console.error("[warmup] 预热失败（静默降级，首次请求将承担冷启动）:", (e as Error).message);
  }

  app.listen(PORT, "0.0.0.0", () => {
    const lanIp = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface?.family === "IPv4" && !iface.internal)?.address
      ?? "localhost";
    console.log(`Server fully functional on http://localhost:${PORT}  (LAN: http://${lanIp}:${PORT})`);
  });

  // ── 国家/机构缓存每日凌晨 5 点定时刷新 ──
  const dailyRefreshTimer = scheduleDailyAt(5, async () => {
    try {
      await refreshNoticeCountries(dbPool);
      await refreshNoticeAgencies(dbPool);
      console.log("[daily-refresh] 国家/机构缓存已刷新");
    } catch (e) {
      console.error("[daily-refresh] 刷新失败（静默降级）:", (e as Error).message);
    }
  });

  // 返回 stop 函数供优雅关闭使用
  return () => {
    stopAutoTranslate();
    stopReportCacheCleanup();
    stopSearchSync?.();
    clearInterval(featuredRefreshTimer);
    clearInterval(isActiveRefreshTimer);
    clearTimeout(dailyRefreshTimer);
  };
}
