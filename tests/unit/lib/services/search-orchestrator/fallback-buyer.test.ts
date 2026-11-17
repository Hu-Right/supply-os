/**
 * 回退查询的机构列别名回归（2026-11-17 截图事故）
 *
 * 事故：服务表滞后窗口期里列表走 fallbackDetailSql 从主表补齐，SQL 选的是 `n.agency`；
 * 而对外契约白名单（notice-public/view.ts 的 NOTICE_CONTRACT_KEYS）只有 buyerName/
 * buyerNameCn，`agency` 在出口被裁掉 ⇒ 前端 `buyerNameCn || buyerName || 来源未提供机构`
 * 全部落到兜底文案，看起来像"源站没给机构"，实际是取数口径丢了字段。
 *
 * 不变量：回退行必须产出 `buyer_name`（且优先 agency_full），经 toNoticeView 后仍是 buyerName。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fallbackDetailSql } from "@/lib/services/search-orchestrator/detail-fetch";
import { toNoticeView } from "@/lib/services/notice-public/view";

describe("fetchDetailsByIds 回退 SQL", () => {
  it("机构列起别名 buyer_name，优先 agency_full 再回退 agency", () => {
    const sql = fallbackDetailSql([1, 2]);

    expect(sql).toContain("AS buyer_name");
    expect(sql).toContain("COALESCE(NULLIF(n.agency_full, ''), NULLIF(n.agency, ''))");
    // 反例：不能再裸选 agency（出口白名单会把它裁掉）
    expect(sql).not.toMatch(/estimated_value,\s*n\.agency,/);
  });

  it("回退行经对外视图后保留 buyerName（不再被契约白名单裁掉）", () => {
    const view = toNoticeView({ id: 1, buyer_name: "SAM.gov", estimated_value: null });
    expect(view).not.toBeNull();
    expect(view!.buyerName).toBe("SAM.gov");
  });
});
