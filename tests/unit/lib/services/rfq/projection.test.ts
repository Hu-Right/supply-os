/**
 * RFQ 搜索投影单测（mock pool，不连库）
 * @module tests/unit/lib/services/rfq/projection
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  buildProjectionRow,
  formatShanghaiDate,
  removeProjection,
  upsertProjection,
  type ProjectionSource,
} from "@/lib/services/rfq/projection";

function src(over: Partial<ProjectionSource> = {}): ProjectionSource {
  return {
    demandId: 12,
    noticePk: null,
    reference: "OSRFQ-2026-000012",
    title: "采购光伏组件 10MW",
    description: "需求描述",
    categoryCode: "UGT-0301",
    provinceName: "陕西省",
    buyerOrgName: "西安某新能源有限公司",
    buyerUserId: 42,
    closeAt: 1_780_000_000,
    publishedAt: 1_777_000_000,
    budgetAmount: 1200,
    budgetCurrency: "CNY",
    budgetConfidential: false,
    ...over,
  };
}

describe("formatShanghaiDate", () => {
  it("按 Asia/Shanghai 取日，避免 UTC 日末差一天", () => {
    // 2026-05-01T16:00:00Z = 2026-05-02 00:00 +08:00
    expect(formatShanghaiDate(1_777_651_200)).toBe("2026-05-02");
    // 2026-05-01T15:59:59Z = 2026-05-01 23:59:59 +08:00
    expect(formatShanghaiDate(1_777_651_199)).toBe("2026-05-01");
  });

  it("空值返回 null", () => {
    expect(formatShanghaiDate(null)).toBeNull();
    expect(formatShanghaiDate(0)).toBeNull();
  });
});

describe("buildProjectionRow — 服务表口径", () => {
  it("金额写纯数字元，不带单位与符号", () => {
    const row = buildProjectionRow(src({ budgetAmount: 1234.5 }));
    expect(row.estimated_value).toBe("1234.5");
    expect(String(row.estimated_value)).not.toContain("万");
    expect(String(row.estimated_value)).not.toContain("¥");
  });

  it("保密 → estimated_value 为 NULL（不是 0）", () => {
    const row = buildProjectionRow(src({ budgetConfidential: true, budgetAmount: 1200 }));
    expect(row.estimated_value).toBeNull();
    expect(row.budget_confidential).toBe(1);
  });

  it("发布方写 organization，不写 agency（不污染机构维度）", () => {
    const row = buildProjectionRow(src());
    expect(row.organization).toBe("西安某新能源有限公司");
    expect(Object.keys(row)).not.toContain("agency");
  });

  it("归属人写 user_id（rfq_guard 守护对账的比对键）", () => {
    const row = buildProjectionRow(src({ buyerUserId: 77 }));
    expect(row.user_id).toBe(77);
  });

  it("不产出派生列（backbone_path / sync_src_hash 归 builder）", () => {
    const row = buildProjectionRow(src());
    const keys = Object.keys(row);
    expect(keys).not.toContain("backbone_path");
    expect(keys).not.toContain("precise_backbone_path");
    expect(keys).not.toContain("sync_src_hash");
  });

  it("只写索引所需字段：不落联系人/交付地址（PII 收口）", () => {
    const keys = Object.keys(buildProjectionRow(src()));
    expect(keys).not.toContain("contact_name");
    expect(keys).not.toContain("contact_email");
    expect(keys).not.toContain("delivery_address");
  });

  it("deadline_ts 写毫秒（走 STORED 生成列的除法分支），rfq_status 为 published", () => {
    const row = buildProjectionRow(src({ closeAt: 1_780_000_000 }));
    expect(row.deadline_ts).toBe(1_780_000_000_000);
    expect(row.rfq_status).toBe("published");
    expect(row.entry_source).toBe("platform");
    expect(row.notice_id).toBe(row.reference);
  });
});

describe("upsertProjection / removeProjection", () => {
  it("首次投影走 INSERT，返回 insertId", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ insertId: 9001 }, undefined]) };
    const pk = await upsertProjection(db as unknown as Pool, src());
    expect(pk).toBe(9001);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain("INSERT INTO bid_notices");
    expect(sql).toContain("entry_source");
  });

  it("已有投影走 UPDATE，不重复插入", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }, undefined]) };
    const pk = await upsertProjection(db as unknown as Pool, src({ noticePk: 9001 }));
    expect(pk).toBe(9001);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain("UPDATE bid_notices SET");
    expect(sql).not.toContain("INSERT");
  });

  it("撤下投影只删 platform/RFQ 行", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }, undefined]) };
    await removeProjection(db as unknown as Pool, 9001);
    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toContain("DELETE FROM bid_notices");
    expect(String(sql)).toContain("entry_source = 'platform'");
    expect(params).toEqual([9001]);
    // v2 撤投影是删行（v1 仅置 closed），必须同步销账 rfq_guard，否则守护对账误报
    const [sql2, params2] = db.query.mock.calls[1];
    expect(String(sql2)).toContain("DELETE FROM rfq_guard");
    expect(params2).toEqual([9001]);
  });

  it("无投影时删除是 no-op", async () => {
    const db = { query: vi.fn() };
    await removeProjection(db as unknown as Pool, null);
    expect(db.query).not.toHaveBeenCalled();
  });
});
