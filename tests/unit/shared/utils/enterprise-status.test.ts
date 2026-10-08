/**
 * 企业绑定状态口径（classifyEnterpriseBindState）测试
 * @module tests/unit/shared/utils/enterprise-status.test.ts
 * @description 钉住「账号侧绑定状态」的唯一口径，服务端排他守卫与前端状态徽章共用：
 *              1. 无绑定行 → none；
 *              2. claim_status=pending（认领/临时绑定待核）→ pending，优先级高于主体的
 *                 verify_status=done（认领一家已通过资质审核的公司时，账号自身仍是审核中）；
 *              3. verify_status=done 或 claim_status=verified → verified；
 *              4. verify_status=pending → pending；rejected → rejected；
 *              5. 已绑定但两个状态列都为空 → linked（复用他人未认证档案的历史行）。
 */
import { describe, it, expect } from "vitest";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
  isBindingLockedForNewSubject,
} from "@/shared/utils/enterprise-status";

describe("classifyEnterpriseBindState", () => {
  it("无绑定行 → none", () => {
    expect(classifyEnterpriseBindState(null)).toBe("none");
    expect(classifyEnterpriseBindState(undefined)).toBe("none");
  });

  it("claim_status=pending 优先于 verify_status=done（认领审核中）", () => {
    expect(classifyEnterpriseBindState({ verify_status: "done", claim_status: "pending" })).toBe("pending");
    expect(classifyEnterpriseBindState({ verify_status: null, claim_status: "pending" })).toBe("pending");
  });

  it("verify_status=done 或 claim_status=verified → verified", () => {
    expect(classifyEnterpriseBindState({ verify_status: "done", claim_status: null })).toBe("verified");
    // 真实故障场景：后台认领审核只写 claim_status='verified'，不碰 verify_status
    expect(classifyEnterpriseBindState({ verify_status: null, claim_status: "verified" })).toBe("verified");
  });

  it("自注册资料待审 → pending；驳回 → rejected", () => {
    expect(classifyEnterpriseBindState({ verify_status: "pending", claim_status: null })).toBe("pending");
    expect(classifyEnterpriseBindState({ verify_status: "rejected", claim_status: null })).toBe("rejected");
  });

  it("已绑定但无任何审核状态 → linked", () => {
    expect(classifyEnterpriseBindState({ verify_status: null, claim_status: null })).toBe("linked");
    expect(classifyEnterpriseBindState({})).toBe("linked");
  });

  it("空串列视同 NULL（外部同步可能写入空串）", () => {
    expect(classifyEnterpriseBindState({ verify_status: "", claim_status: "" })).toBe("linked");
  });
});

describe("enterpriseBindStateText", () => {
  it("沿用既有 i18n 键，不新增同义键", () => {
    expect(enterpriseBindStateText("none").key).toBe("authSupplierPending");
    expect(enterpriseBindStateText("pending").key).toBe("authEnterpriseVerifyProcessing");
    expect(enterpriseBindStateText("verified").key).toBe("authEnterpriseVerifyApproved");
    expect(enterpriseBindStateText("rejected").key).toBe("authEnterpriseVerifyRejected");
    expect(enterpriseBindStateText("linked").key).toBe("authEnterpriseStatusLinked");
  });
});

describe("isBindingLockedForNewSubject", () => {
  it("已绑定（含审核中/已认证/已驳回）一律锁住新主体；仅 none 放行", () => {
    expect(isBindingLockedForNewSubject("verified")).toBe(true);
    expect(isBindingLockedForNewSubject("pending")).toBe(true);
    expect(isBindingLockedForNewSubject("rejected")).toBe(true);
    expect(isBindingLockedForNewSubject("linked")).toBe(true);
    expect(isBindingLockedForNewSubject("none")).toBe(false);
  });
});
