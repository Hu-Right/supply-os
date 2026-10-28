/**
 * 指纹与宽表内容同快照（I1 关键不变量）
 *
 * - WIDE_SYNC_SELECT 必须把 WIDE_FP_EXPR 以 sync_src_hash 别名选出；
 * - buildWideRow 原样透传，不参与计算（避免第二份指纹实现）；
 * - upsertWideRows 的列清单与参数顺序必须包含 sync_src_hash（写不进=静默丢失）；
 * - 宽表写入同时是节点码倒排表的唯一写入时机（派生表不能比宽表旧）。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

// 节点码倒排表写入：本文件只验「同批被叫到、传的是宽表那两列」，
// 指纹比较/先删后插/降级都由 notice-nodes.test.ts 自己守。
const upsertNoticeNodes = vi.fn(async (_pool: unknown, _rows: unknown[]) => ({
  written: 0, skipped: 0, deleted: 0, badTokens: 0,
}));
vi.mock("@/lib/services/search-sync/notice-nodes", () => ({
  upsertNoticeNodes: (pool: unknown, rows: unknown[]) => upsertNoticeNodes(pool, rows),
}));

import {
  wideSyncSelect, buildWideRow, upsertWideRows,
} from "@/lib/services/search-sync/wide-row-builder";
import { WIDE_FP_EXPR, WIDE_FP_COLUMN } from "@/lib/services/search-sync/wide-fingerprint";
import { DESC_SOURCE_EXPR } from "@/lib/utils/notice-field-limits";

const rawPlatform = {
  id: 1, notice_id: "OSRFQ-000000000001", title: "T", reference: "R",
  description: "D", country: "China", agency: "", notice_type: "RFQ",
  deadline_sec: 0, is_featured: 0, estimated_value: 0, documents: null,
  procurement_files: null, published_date: "2026-09-20", entry_source: "platform",
  description_cn: null, bid_overview: null, beneficiary_countries: null,
  sync_src_hash: "abc123", category_l1_id: null, category_l2_id: null,
};

describe("指纹同快照", () => {
  it("wideSyncSelect(true) 选出指纹列且表达式来自唯一出口", () => {
    const sql = wideSyncSelect(true);
    expect(sql).toContain(WIDE_FP_EXPR);
    expect(sql).toContain(`AS ${WIDE_FP_COLUMN}`);
  });

  /**
   * 降级路径（迁移 087 未执行时的生产形态）：多带一个不存在的列会让整批
   * SELECT/upsert 报错并被外层 catch 吞掉 → 宽表同步静默停摆，比不加这列严重得多。
   */
  it("wideSyncSelect(false) 不出现指纹列也不出现指纹表达式", () => {
    const sql = wideSyncSelect(false);
    expect(sql).not.toContain(WIDE_FP_COLUMN);
    expect(sql).not.toContain(WIDE_FP_EXPR);
    // 其余字段不得因降级而丢失
    expect(sql).toContain(`${DESC_SOURCE_EXPR} AS description`);
    expect(sql).not.toContain("n.category_l1_id");
  });

  /**
   * 降级形态不得意外丢字段：两种形态都要选出全部普通列。
   * （不按逗号切列对比——WIDE_FP_EXPR 自身含逗号，那样断言天然不成立）
   */
  it("两种形态都选出全部普通列", () => {
    const plain = [
      "n.id", "n.notice_id", "n.reference", "n.title", "n.country", "n.agency",
      "n.notice_type", "n.deadline_sec", "n.is_featured", "n.estimated_value",
      "n.documents", "n.procurement_files", "n.published_date", "n.entry_source",
      "opp.description_cn", "opp.beneficiary_countries",
    ];
    for (const withFp of [true, false]) {
      const sql = wideSyncSelect(withFp);
      for (const col of plain) expect(sql, `${withFp}:${col}`).toContain(col);
      expect(sql).toContain(`${DESC_SOURCE_EXPR} AS description`);
    }
  });

  it("主查询的描述列复用共享表达式（不再内联 COALESCE）", () => {
    expect(wideSyncSelect(true)).toContain(`${DESC_SOURCE_EXPR} AS description`);
  });

  it("主表分类列已随死列收刀退出快照（2026-10-15：线上全 NULL，列物理 DROP）", () => {
    for (const withFp of [true, false]) {
      expect(wideSyncSelect(withFp)).not.toContain("n.category_l1_id");
      expect(wideSyncSelect(withFp)).not.toContain("n.category_l2_id");
    }
  });

  it("buildWideRow 透传指纹，不重新计算", () => {
    const row = buildWideRow(rawPlatform);
    expect(row.sync_src_hash).toBe("abc123");
  });

  it("指纹缺失时落空串（不抛错，交由下轮对账重建）", () => {
    const row = buildWideRow({ id: 2, notice_id: "N2", title: "T" });
    expect(row.sync_src_hash).toBe("");
  });

  it("upsertWideRows 列清单含指纹列，参数按序对齐", async () => {
    // 入参带类型标注，否则 vi.fn 推为零参签名，无法取到 mock.calls 里的 sql/params
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => [{ affectedRows: 1 }]);
    const pool = { query } as unknown as Pool;
    await upsertWideRows(pool, [buildWideRow(rawPlatform)], true);
    const sql = String(query.mock.calls[0][0]);
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).toContain(WIDE_FP_COLUMN);
    expect(params).toContain("abc123");
    // 列数与参数个数必须严格相等（不一致会导致整批写坏）
    const colList = sql.slice(sql.indexOf("(") + 1, sql.indexOf(") VALUES"));
    expect(colList.split(",")).toHaveLength(params.length);
  });

  it("upsertWideRows(withFp=false) 不写指纹列，且列数与参数仍对齐", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => [{ affectedRows: 1 }]);
    const pool = { query } as unknown as Pool;
    await upsertWideRows(pool, [buildWideRow(rawPlatform)], false);
    const sql = String(query.mock.calls[0][0]);
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).not.toContain(WIDE_FP_COLUMN);
    expect(params).not.toContain("abc123");
    const colList = sql.slice(sql.indexOf("(") + 1, sql.indexOf(") VALUES"));
    expect(colList.split(",")).toHaveLength(params.length);
  });

  it("upsertWideRows 同批把（id, backbone_path）交给节点码倒排表写入", async () => {
    // 这一条守的是「不存在第二个写入时机」：新公告、改码、去掉码、ghost 行，全部经
    // 宽表写入路径带出来（删除侧由 purge / ghost 两个出口各自级联，见各自单测）。
    upsertNoticeNodes.mockClear();
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => [{ affectedRows: 1 }]);
    const pool = { query } as unknown as Pool;
    await upsertWideRows(pool, [buildWideRow(rawPlatform)], true);
    expect(upsertNoticeNodes).toHaveBeenCalledTimes(1);
    // 无码公告传下来的是 null，不是空串：桥表对「没码」的语义必须是不留行
    expect(upsertNoticeNodes.mock.calls[0][1]).toEqual([{ id: 1, backbone_path: null }]);
  });
});
