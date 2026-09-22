/**
 * 对账层单一写入者契约（I1）
 *
 * 对账函数必须是**纯检测**：只发 SELECT，宽表内容列的修复一律交 syncWideIds。
 * 用「记录全部 SQL 的假 pool」直接证明没有任何 UPDATE crm_notice_search 逃逸出来 ——
 * 这正是历史上 5 段手写 UPDATE 与 buildWideRow 口径分叉（错值、原码污染、优先级被抹）的根因。
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import * as reconcile from "@/lib/services/search-sync/wide-row-reconcile";

function makeSpyPool(rows: unknown[][] = []) {
  const sqls: string[] = [];
  const query = vi.fn(async (_sql: string) => {
    sqls.push(String(_sql ?? ""));
    return [rows.shift() ?? []];
  });
  return { pool: { query } as unknown as Pool, sqls };
}

/** 除 ghost 清理（合法 DELETE）外，所有检测函数都不得写宽表 */
const DETECTORS: Array<[string, (p: Pool) => Promise<unknown>]> = [
  ["detectDeadlineDrift", reconcile.detectDeadlineDrift],
  ["detectPlatformStatusDrift", reconcile.detectPlatformStatusDrift],
];

describe("对账层只检测不修复", () => {
  for (const [name, fn] of DETECTORS) {
    it(`${name}：只发 SELECT`, async () => {
      const { pool, sqls } = makeSpyPool();
      await fn(pool);
      expect(sqls.length).toBeGreaterThan(0);
      for (const sql of sqls) {
        expect(/^\s*SELECT/i.test(sql), sql.slice(0, 60)).toBe(true);
      }
    });
  }

  it("旧的 5 个 UPDATE 型对账已从模块移除（防止双实现共存）", () => {
    for (const gone of [
      "reconcileDeadlineSec", "reconcileIsFeatured", "reconcileTranslations",
      "reconcilePreciseCodes", "reconcileContentDrift",
    ]) {
      expect((reconcile as Record<string, unknown>)[gone], gone).toBeUndefined();
    }
  });

  it("reconcile 与 fingerprint 两个模块源码均无对宽表的 UPDATE", () => {
    for (const rel of [
      "src/lib/services/search-sync/wide-row-reconcile.ts",
      "src/lib/services/search-sync/wide-fingerprint.ts",
    ]) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/UPDATE\s+crm_notice_search/i);
    }
  });

  /**
   * 口径分叉守护：对账描述分量必须与构建走同一表达式。
   * 旧 reconcileContentDrift 用 LEFT(n.description,2000) 判漂移，而构建用
   * COALESCE(opp.description, n.description) → 两路径互写产生 8,367 行错值。
   */
  it("指纹检测与内容构建共用同一描述源口径", async () => {
    const { DESC_SOURCE_EXPR } = await import("@/lib/utils/notice-field-limits");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/services/search-sync/wide-fingerprint.ts"),
      "utf8",
    );
    expect(src).toContain("DESC_SOURCE_EXPR");
    expect(src).not.toContain(DESC_SOURCE_EXPR); // 只允许引用常量，不得复制其文本
  });
});
