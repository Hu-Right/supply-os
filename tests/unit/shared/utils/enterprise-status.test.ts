/**
 * 企业绑定状态口径（classifyEnterpriseBindState）测试
 * @module tests/unit/shared/utils/enterprise-status.test.ts
 * @description 钉住「账号侧绑定状态」的唯一口径，服务端排他守卫与前端状态徽章共用：
 *              1. 无绑定行 → none；
 *              2. hasPendingClaim（认领/临时绑定待核）→ pending，优先级高于主体的
 *                 verify_status=done（认领一家已通过资质审核的公司时，账号自身仍是审核中）；
 *              3. verify_status=done → verified（认领归属不再靠 supplier.claim_status 参与资质判定，
 *                 该列已退役，ADR-0017）；
 *              4. verify_status=pending → pending；rejected → rejected；
 *              5. 已绑定但资质标量为空 → linked（复用他人未认证档案的历史行）；
 *              6. 换绑锁只给已认证：未拿下认证的旧绑定可以自助撤回重来（路线三）。
 */
import { describe, it, expect } from "vitest";
import {
  classifyEnterpriseBindState,
  enterpriseBindStateText,
  isBindingLockedForSubjectSwitch,
} from "@/shared/utils/enterprise-status";

describe("classifyEnterpriseBindState", () => {
  it("无绑定行 → none", () => {
    expect(classifyEnterpriseBindState(null)).toBe("none");
    expect(classifyEnterpriseBindState(undefined)).toBe("none");
  });

  it("hasPendingClaim 优先于 verify_status=done（认领审核中）", () => {
    expect(classifyEnterpriseBindState({ verifyStatus: "done", hasPendingClaim: true })).toBe("pending");
    expect(classifyEnterpriseBindState({ verifyStatus: null, hasPendingClaim: true })).toBe("pending");
    expect(classifyEnterpriseBindState({ hasPendingClaim: true })).toBe("pending");
  });

  it("资质只看 verify_status=done（认领归属不再视同已认证）", () => {
    expect(classifyEnterpriseBindState({ verifyStatus: "done", hasPendingClaim: false })).toBe("verified");
    expect(classifyEnterpriseBindState({ verifyStatus: "done" })).toBe("verified");
    // 资质列未写：归 linked，这类行属于审核端回写不完整，应在后台修而非展示层兜底
    expect(classifyEnterpriseBindState({ verifyStatus: null, hasPendingClaim: false })).toBe("linked");
    expect(classifyEnterpriseBindState({ verifyStatus: "pending", hasPendingClaim: false })).toBe("pending");
  });

  it("自注册资料待审 → pending；驳回 → rejected", () => {
    expect(classifyEnterpriseBindState({ verifyStatus: "pending" })).toBe("pending");
    expect(classifyEnterpriseBindState({ verifyStatus: "rejected" })).toBe("rejected");
  });

  it("已绑定但无任何审核状态 → linked", () => {
    expect(classifyEnterpriseBindState({ verifyStatus: null, hasPendingClaim: false })).toBe("linked");
    // 入参改成具名结构后，少给键会跑成默认判定（verify 空、无 pending → linked）；
    // 调用方应显式给出 hasPendingClaim，避免「忘了查认领事实」被静默当成无 pending。
    expect(classifyEnterpriseBindState({ verifyStatus: null })).toBe("linked");
  });

  it("空串列视同 NULL（外部同步可能写入空串）", () => {
    expect(classifyEnterpriseBindState({ verifyStatus: "", hasPendingClaim: false })).toBe("linked");
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

describe("isBindingLockedForSubjectSwitch", () => {
  it("仅已认证锁死换绑；审核中/已驳回/已绑定无状态都可自助切换", () => {
    expect(isBindingLockedForSubjectSwitch("verified")).toBe(true);
    expect(isBindingLockedForSubjectSwitch("pending")).toBe(false);
    expect(isBindingLockedForSubjectSwitch("rejected")).toBe(false);
    expect(isBindingLockedForSubjectSwitch("linked")).toBe(false);
    expect(isBindingLockedForSubjectSwitch("none")).toBe(false);
  });

  it("认领待核也不锁（绑定仍是临时态，撤回旧申请是正当路径）", () => {
    expect(isBindingLockedForSubjectSwitch(classifyEnterpriseBindState({ verifyStatus: "done", hasPendingClaim: true }))).toBe(false);
  });
});
