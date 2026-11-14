/**
 * 公开详情分级授权裁剪 —— 回归单测
 *
 * @module tests/unit/lib/services/procurement/views-privacy
 * @description 2026-11 审计：`contact_disclosure` 此前只被读出来回显、没有任何分支用它，
 *              等于「采购方选了不公开，平台照样全给」；`authorization.signerName` 更是
 *              直接进了非 owner 的公开视图（任何人打开已发布需求都能看到签署人真名）。
 *              这里按四级 + 未知值 + owner/guest 六组口径钉死。
 */
import { describe, it, expect } from "vitest";
import { projectDetailViewOf } from "@/lib/services/procurement/views";
import type { ProjectDetailBundle } from "@/lib/services/procurement/projects";

const PID = 7;

describe("projectDetailViewOf — contact_disclosure 分级裁剪", () => {
  function bundleWith(level: string): ProjectDetailBundle {
    return {
      project: {
        id: PID,
        reference: "OSPR-2026-000007",
        version_no: 2,
        status: "published",
        close_reason: null,
        title_zh: "采购学生课桌椅",
        title_en: null,
        background: "背景",
        purpose: "real",
        internal_project_no: "INT-1",
        object_types: "goods",
        budget_amount: "120000.00",
        budget_currency: "USD",
        budget_public: 0,
        budget_approved: "approved",
        delivery_country: "肯尼亚",
        delivery_city: "内罗毕",
        delivery_address: "某学校",
        deadline_date: "2026-12-31",
        install_needs: "installation",
        logistics_note: "特殊包装",
        incoterm: "CIF",
        payment_terms: "30% 预付",
        guarantees: "performance_bond",
        supplier_country_limit: null,
        manufacturer_only: 0,
        supplier_quals: "ISO9001",
        quote_deadline_at: 1_780_000_000,
        compliance: null,
        contact_disclosure: level,
        procurement_mode: "rfq",
        requirement_verify: "pass",
        fund_verify: "unverified",
        submitted_at: 1_777_000_000,
        published_at: 1_777_500_000,
        created_at: 1_776_000_000,
      } as never,
      buyerOrgName: "某教育局",
      lots: [],
      items: [],
      attachments: [],
      reviews: [],
      authorization: { status: "verified" as const, signerName: "张三", signedAt: 2 },
    };
  }

  it("none：隐机构名与预算，交付地址仍公开（需求信息）", () => {
    const v = projectDetailViewOf(bundleWith("none"), { isOwner: false }) as Record<string, unknown>;
    expect(v.buyerOrgName).toBe("");
    expect(v.budgetAmount).toBeNull();
    expect(v.deliveryAddress).toBe("某学校");
    expect(v.contactDisclosure).toBe("none");
  });

  it("org_only：公开机构名，预算仍受 budget_public 控制", () => {
    const v = projectDetailViewOf(bundleWith("org_only"), { isOwner: false }) as Record<string, unknown>;
    expect(v.buyerOrgName).toBe("某教育局");
    expect(v.budgetAmount).toBeNull();
  });

  it("budget_all：公开机构名与预算", () => {
    const v = projectDetailViewOf(bundleWith("budget_all"), { isOwner: false }) as Record<string, unknown>;
    expect(v.buyerOrgName).toBe("某教育局");
    expect(v.budgetAmount).toBe(120000);
  });

  it("未知/历史空值按 org_only 处理，不静默匿名化存量数据", () => {
    const v = projectDetailViewOf(bundleWith(""), { isOwner: false }) as Record<string, unknown>;
    expect(v.buyerOrgName).toBe("某教育局");
    expect(v.contactDisclosure).toBe("org_only");
  });

  it("签署人姓名只给 owner；非 owner 只保留核验状态", () => {
    const owner = projectDetailViewOf(bundleWith("org_only"), { isOwner: true }) as Record<string, unknown>;
    expect((owner.authorization as Record<string, unknown>).signerName).toBe("张三");

    const guest = projectDetailViewOf(bundleWith("org_only"), { isOwner: false }) as Record<string, unknown>;
    const auth = guest.authorization as Record<string, unknown>;
    expect(auth.status).toBe("verified");
    expect(auth.signerName).toBeNull();
    expect(auth.signedAt).toBeNull();
  });
});

