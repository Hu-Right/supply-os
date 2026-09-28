import { describe, it, expect, vi } from "vitest";
import { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";
import type { Pool } from "mysql2/promise";

function makePool(query: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return { query } as unknown as Pool;
}

describe("BenefitSystemRepo.listActiveServices", () => {
  it("读 is_active=1 的服务目录，按 category+sort_order 排序", async () => {
    const rows = [
      {
        service_code: "svc_manual_bid_match", category: "pro_service", name_zh: "单条1对1匹配",
        name_en: "Manual Opportunity Matching", price_mode: "per_time", standard_price: "199.00", price_from: 0,
        currency: "CNY", sale_mode: "self", member_discount: "none", credit_to_annual_plan: 1, deliverable_note_zh: "x", sort_order: 10,
      },
    ];
    const query = vi.fn().mockResolvedValue([rows]);
    const res = await new BenefitSystemRepo(makePool(query)).listActiveServices();
    expect(res).toHaveLength(1);
    expect(res[0].service_code).toBe("svc_manual_bid_match");
    expect(res[0].standard_price).toBe("199.00");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("crm_service_catalog");
    expect(sql).toContain("is_active = 1");
    expect(sql).toContain("credit_to_annual_plan");
    expect(sql).toContain("ORDER BY category, sort_order");
  });
});
