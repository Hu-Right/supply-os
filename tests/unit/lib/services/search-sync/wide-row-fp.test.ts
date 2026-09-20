/**
 * 指纹与宽表内容同快照（I1 关键不变量）
 *
 * - WIDE_SYNC_SELECT 必须把 WIDE_FP_EXPR 以 sync_src_hash 别名选出；
 * - buildWideRow 原样透传，不参与计算（避免第二份指纹实现）；
 * - upsertWideRows 的列清单与参数顺序必须包含 sync_src_hash（写不进=静默丢失）。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  WIDE_SYNC_SELECT, buildWideRow, upsertWideRows,
} from "@/lib/services/search-sync/wide-row-builder";
import { WIDE_FP_EXPR } from "@/lib/services/search-sync/wide-fingerprint";
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
  it("WIDE_SYNC_SELECT 选出 sync_src_hash 且表达式来自唯一出口", () => {
    expect(WIDE_SYNC_SELECT).toContain(WIDE_FP_EXPR);
    expect(WIDE_SYNC_SELECT).toContain("AS sync_src_hash");
  });

  it("WIDE_SYNC_SELECT 的描述列复用共享表达式（不再内联 COALESCE）", () => {
    expect(WIDE_SYNC_SELECT).toContain(`${DESC_SOURCE_EXPR} AS description`);
  });

  it("主表分类列随快照带出（平台公告分类入宽表的前置）", () => {
    expect(WIDE_SYNC_SELECT).toContain("n.category_l1_id");
    expect(WIDE_SYNC_SELECT).toContain("n.category_l2_id");
  });

  it("buildWideRow 透传指纹，不重新计算", () => {
    const row = buildWideRow(rawPlatform, new Map());
    expect(row.sync_src_hash).toBe("abc123");
  });

  it("指纹缺失时落空串（不抛错，交由下轮对账重建）", () => {
    const row = buildWideRow({ id: 2, notice_id: "N2", title: "T" }, new Map());
    expect(row.sync_src_hash).toBe("");
  });

  it("upsertWideRows 列清单含 sync_src_hash，参数按序对齐", async () => {
    // 入参带类型标注，否则 vi.fn 推为零参签名，无法取到 mock.calls 里的 sql/params
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => [{ affectedRows: 1 }]);
    const pool = { query } as unknown as Pool;
    await upsertWideRows(pool, [buildWideRow(rawPlatform, new Map())]);
    const sql = String(query.mock.calls[0][0]);
    const params = query.mock.calls[0][1] as unknown[];
    expect(sql).toContain("sync_src_hash");
    expect(params).toContain("abc123");
    // 列数与参数个数必须严格相等（不一致会导致整批写坏）
    const colList = sql.slice(sql.indexOf("(") + 1, sql.indexOf(") VALUES"));
    expect(colList.split(",")).toHaveLength(params.length);
  });
});
