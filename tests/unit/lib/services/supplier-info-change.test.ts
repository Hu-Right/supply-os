/**
 * 供应商企业信息变更流水服务单测（fake pool，无库）
 *
 * 钉住的口径：
 * - 例外字段（legal_rep/certification）值变 → 覆盖式登记 pending_review（先删同字段旧待审再插），且不进即时生效子集；
 * - 普通字段值变 → 记一条 logged；值未变（trim 后相等）→ 不记不动（避免无改动保存刷留痕）；
 * - splitOutReviewFields 只剔除例外字段，其余原样保留；
 * - 归一：null/undefined 与空串按 '' 比对，避免「未填」与「填空」误判为变更。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute }) }));

import {
  applyVerifiedInfoChanges,
  splitOutReviewFields,
  isReviewField,
} from "@/lib/services/supplier-info-change";

beforeEach(() => execute.mockReset());

function callsFor(sqlFragment: string) {
  return execute.mock.calls.filter(([sql]) => String(sql).includes(sqlFragment));
}

describe("applyVerifiedInfoChanges", () => {
  it("例外字段变更 → 覆盖式登记 pending_review（先删后插）", async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    const r = await applyVerifiedInfoChanges({
      supplierId: 7,
      current: { legal_rep: "旧法人" },
      editableInput: { legal_rep: "新法人" },
      actorUserId: 42,
    });
    expect(r.pendingReviewCount).toBe(1);
    const dels = callsFor(`DELETE FROM crm_supplier_info_changes`);
    expect(dels).toHaveLength(1);
    expect(dels[0][1]).toEqual([7, "legal_rep"]);
    const ins = callsFor(`INSERT INTO crm_supplier_info_changes`);
    expect(ins).toHaveLength(1);
    expect(String(ins[0][0])).toContain("'pending_review'");
    expect(ins[0][1]).toEqual([7, "legal_rep", "旧法人", "新法人", 42]);
  });

  it("普通字段变更 → 记 logged；未变字段跳过", async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    const r = await applyVerifiedInfoChanges({
      supplierId: 7,
      current: { contact: "张三", phone: "13800000000" },
      editableInput: { contact: "李四", phone: "13800000000" }, // phone 未变
      actorUserId: 42,
    });
    expect(r.pendingReviewCount).toBe(0);
    const ins = callsFor(`INSERT INTO crm_supplier_info_changes`);
    expect(ins).toHaveLength(1); // 只有 contact
    expect(String(ins[0][0])).toContain("'logged'");
    expect(ins[0][1]).toEqual([7, "contact", "张三", "李四", 42]);
  });

  it("空串与缺失归一为相等 → 不误记变更", async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    const r = await applyVerifiedInfoChanges({
      supplierId: 7,
      current: { website: "" },
      editableInput: { website: null }, // null → '' 与 current '' 相等
      actorUserId: 42,
    });
    expect(r.pendingReviewCount).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("混合：例外 + 普通各变一处 → 各走各的状态", async () => {
    execute.mockResolvedValue([{ affectedRows: 0 }]);
    const r = await applyVerifiedInfoChanges({
      supplierId: 7,
      current: { certification: "ISO9001", contact: "张三" },
      editableInput: { certification: "ISO14001", contact: "李四" },
      actorUserId: 42,
    });
    expect(r.pendingReviewCount).toBe(1);
    // certification: DELETE + INSERT = 2 次；contact: INSERT = 1 次
    expect(callsFor("DELETE FROM crm_supplier_info_changes")).toHaveLength(1);
    expect(callsFor("INSERT INTO crm_supplier_info_changes")).toHaveLength(2);
  });
});

describe("splitOutReviewFields / isReviewField", () => {
  it("只剔除例外字段，其余原样保留", () => {
    const out = splitOutReviewFields({
      legal_rep: "x",
      certification: "y",
      contact: "z",
      products: "p",
    });
    expect(out).toEqual({ contact: "z", products: "p" });
  });
  it("例外集判定", () => {
    expect(isReviewField("legal_rep")).toBe(true);
    expect(isReviewField("certification")).toBe(true);
    expect(isReviewField("contact")).toBe(false);
  });
});
