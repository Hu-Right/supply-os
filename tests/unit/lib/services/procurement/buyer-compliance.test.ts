/**
 * F01 主体查重 / 风险提示 / 采购方编号单测
 * @module tests/unit/lib/services/procurement/buyer-compliance
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { buyerRiskFlags, findBuyerDuplicates, formatBuyerNo } from "@/lib/services/procurement/buyer-compliance";
import type { BuyerRow } from "@/lib/services/procurement/buyers";

function buyer(over: Record<string, unknown> = {}): BuyerRow {
  return {
    id: 7,
    user_id: 42,
    org_name: "示例采购主体",
    org_type: "ngo",
    buyer_role: "end_buyer",
    country: "肯尼亚",
    address: "内罗毕",
    reg_no: "REG-001",
    tax_no: null,
    website: "https://example.org",
    official_email: "buyer@example.org",
    official_phone: "+254700000000",
    leader_name: "张三",
    leader_title: "主任",
    leader_phone: null,
    leader_email: null,
    deliver_country: "肯尼亚",
    deliver_city: "内罗毕",
    fund_source: "own",
    budget_status: "approved",
    external_rules: null,
    license_file_key: "license_42_1.jpg",
    license_file_hash: "h",
    agent_auth_file_key: null,
    agent_auth_file_hash: null,
    auth_contact_name: "张三",
    auth_contact_phone: null,
    auth_contact_email: null,
    procurement_experience: null,
    status: "pending",
    verified_by: null,
    verified_at: null,
    verify_note: null,
    created_at: 1_777_593_600,
    updated_at: 1_777_593_600,
    ...over,
  } as BuyerRow;
}

describe("formatBuyerNo", () => {
  it("BUY-{年}-{6位}，按创建时间取年", () => {
    expect(formatBuyerNo(7, 1_777_593_600)).toBe("BUY-2026-000007");
    expect(formatBuyerNo(123456, 1_777_593_600)).toBe("BUY-2026-123456");
  });
});

describe("buyerRiskFlags", () => {
  it("资料齐全 → 无提示", () => {
    expect(buyerRiskFlags(buyer())).toEqual([]);
  });

  it("缺执照/缺注册号/免费邮箱/代理无授权/外部规则/缺授权联系人", () => {
    const flags = buyerRiskFlags(
      buyer({
        license_file_key: null,
        reg_no: null,
        official_email: "someone@gmail.com",
        buyer_role: "authorized_agent",
        external_rules: "世界银行采购规则",
        auth_contact_name: null,
      }),
    );
    expect(flags).toEqual([
      "missing_license",
      "missing_reg_no",
      "free_email",
      "email_domain_mismatch",
      "agent_auth_missing",
      "external_rules",
      "auth_contact_missing",
    ]);
  });

  it("没填邮箱 → missing_email", () => {
    expect(buyerRiskFlags(buyer({ official_email: null }))).toContain("missing_email");
  });

  it("邮箱域名与官网不一致 → email_domain_mismatch；一致则不报", () => {
    expect(
      buyerRiskFlags(buyer({ official_email: "buyer@example.org", website: "https://other-site.com" })),
    ).toContain("email_domain_mismatch");
    expect(
      buyerRiskFlags(buyer({ official_email: "buyer@example.org", website: "https://www.example.org" })),
    ).not.toContain("email_domain_mismatch");
  });
});

describe("findBuyerDuplicates", () => {
  it("四字段任一命中即返回并标注匹配字段", async () => {
    const db = {
      query: vi.fn(async () => [
        [
          { id: 9, org_name: "另一主体", reg_no: "REG-002", official_email: "other@example.org", official_phone: "+254700000001" },
        ],
      ]),
    } as unknown as Pool;
    const r = await findBuyerDuplicates(db, {
      buyerId: 7,
      orgName: "示例采购主体",
      regNo: "",
      email: "other@example.org",
      phone: "",
    });
    expect(r).toEqual([{ buyerId: 9, orgName: "另一主体", matchedField: "official_email" }]);
  });

  it("无任何字段 → 不查库", async () => {
    const db = { query: vi.fn() } as unknown as Pool;
    const r = await findBuyerDuplicates(db, { buyerId: 7, orgName: "", regNo: null, email: null, phone: null });
    expect(r).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});
