/**
 * 宽表/Meili 全量与增量构建的稳定过期准入（2026-11-13 构建时摘除闭环回归）
 *
 * 断言不变量：四条「读取宽表/主表灌入下游」的路径——宽表 fullBackfill /
 * incrementalWideSync、Meili fullSync / incrementalSync——一律带稳定过期排除谓词
 * （NOT STABLE_EXPIRED，30 天清退余量），不再「先灌死行再等 ghost 删」两段式空转。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";
import { PIPELINE_EXPIRY_GRACE_SECONDS } from "@/lib/utils/notice-expired";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/country/alias-store", () => ({
  loadCountryAliasSnapshot: vi.fn(async () => ({}) as never),
}));
vi.mock("@/lib/services/search-sync/wide-fingerprint", () => ({
  detectWideFingerprintDrift: vi.fn(async () => []),
  isFingerprintColumn: vi.fn(async () => false),
}));
vi.mock("@/lib/services/meilisearch/client", () => ({
  getClient: () => ({ index: vi.fn() }),
  isHealthy: () => true,
  getIndexName: () => "notices_test",
  buildNoticeIndexSettings: vi.fn(() => ({})),
}));

import { fullBackfill, incrementalWideSync } from "@/lib/services/search-sync/sync-scheduler";
import { incrementalSync, WIDE_TABLE_SYNC_ADMISSION } from "@/lib/services/meilisearch/sync";

/** 全查询返回空行的池桩，同时捕获全部 SQL */
function makeCapturePool() {
  const sqls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    sqls.push(String(sql));
    return [[]];
  });
  return { pool: { query } as unknown as Pool, sqls };
}

describe("构建准入：稳定过期不回灌（闭环）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("WIDE_TABLE_SYNC_ADMISSION 即无别名稳定过期取反", () => {
    expect(WIDE_TABLE_SYNC_ADMISSION).toContain("NOT (deadline_sec > 0");
    expect(WIDE_TABLE_SYNC_ADMISSION).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });

  it("宽表 fullBackfill 准入谓词就位", async () => {
    const { pool, sqls } = makeCapturePool();
    await fullBackfill(pool);
    const wide = sqls.find((s) => s.includes("PLATFORM_PUBLISHED_ONLY") || s.includes("ORDER BY n.id ASC LIMIT"));
    expect(wide).toBeDefined();
    expect(wide).toContain("AND NOT (n.deadline_sec > 0");
    expect(wide).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });

  it("宽表 incrementalWideSync 准入谓词就位", async () => {
    const { pool, sqls } = makeCapturePool();
    await incrementalWideSync(pool, 0);
    const wide = sqls.find((s) => s.includes("ORDER BY n.id ASC LIMIT"));
    expect(wide).toBeDefined();
    expect(wide).toContain("AND NOT (n.deadline_sec > 0");
    expect(wide).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });

  it("Meili incrementalSync 读取准入谓词就位", async () => {
    const { pool, sqls } = makeCapturePool();
    const r = await incrementalSync(pool, 0);
    expect(r.synced).toBe(0);
    const wide = sqls.find((s) => s.includes("ORDER BY id ASC LIMIT"));
    expect(wide).toBeDefined();
    expect(wide).toContain("AND NOT (deadline_sec > 0");
    expect(wide).toContain(String(PIPELINE_EXPIRY_GRACE_SECONDS));
  });
});
