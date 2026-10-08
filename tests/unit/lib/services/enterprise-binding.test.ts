/**
 * 企业绑定排他换绑编排服务测试（路线三：分状态）
 * @module tests/unit/lib/services/enterprise-binding.test.ts
 * @description 钉住闸口的两条分叉：已认证 → 拒绝并引导客服；未拿下认证的旧绑定 →
 *              自动撤回（解绑账号 + 作废 pending 认领 + 清主体的认领中标记）后放行。
 *              同时钉住 SQL 顺序与守卫条件：数据保留原则下不动 supplier 行本身。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));

import {
  assertBindingAllowsSubject,
  assertVerifiedSubjectIdentityStable,
  describeBindingConflict,
  readCurrentBinding,
  withdrawBinding,
  withdrawCurrentBinding,
} from "@/lib/services/enterprise-binding";

function ctxWith(boundRow: Record<string, unknown> | null, fullRow: Record<string, unknown> | null = null) {
  return {
    supplier: {
      directoryRepo: {
        findBoundSubjectByUserId: vi.fn().mockResolvedValue(boundRow),
        findFullById: vi.fn().mockResolvedValue(fullRow),
      },
    },
  } as never;
}

describe("readCurrentBinding", () => {
  it("无绑定行 → null", async () => {
    expect(await readCurrentBinding(ctxWith(null), 42)).toBeNull();
  });

  it("绑定行按状态归类，公司名取 name_confirmed 优先", async () => {
    const b = await readCurrentBinding(
      ctxWith({ id: 100, company: "旧名", name_confirmed: "杭州原绑定企业有限公司", verify_status: "done", claim_status: null }),
      42,
    );
    expect(b).toEqual({ supplierId: 100, companyName: "杭州原绑定企业有限公司", state: "verified" });
  });

  it("超长公司名截断，避免撑爆提示条", async () => {
    const b = await readCurrentBinding(
      ctxWith({ id: 1, company: "中".repeat(40), name_confirmed: null, verify_status: "pending", claim_status: null }),
      42,
    );
    expect(b?.companyName).toHaveLength(25); // 24 字 + 省略号
    expect(b?.companyName.endsWith("…")).toBe(true);
  });
});

describe("describeBindingConflict", () => {
  const binding = { supplierId: 100, companyName: "某公司", state: "verified" } as never;

  it("已认证账号：两种动作各给措辞，均含唯一主体约束与客服出口", () => {
    expect(describeBindingConflict(binding, "certify")).toContain("一个账号只能认证一家企业");
    expect(describeBindingConflict(binding, "certify")).toContain("联系客服");
    expect(describeBindingConflict(binding, "claim")).toContain("一个账号只能认领一家企业");
    expect(describeBindingConflict(binding, "claim")).toContain("联系客服");
  });
});

describe("withdrawBinding", () => {
  beforeEach(() => poolExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]));

  it("已认证 → 400/40008，一行数据都不写", async () => {
    await expect(
      withdrawBinding(42, { supplierId: 100, companyName: "已认证公司", state: "verified" }),
    ).rejects.toMatchObject({ status: 400, code: 40008 });
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("审核中 → 先解绑账号，再作废 pending 认领，最后清主体的认领中标记", async () => {
    await withdrawBinding(42, { supplierId: 100, companyName: "审核中公司", state: "pending" });
    const sqls = poolExecute.mock.calls.map((c) => String(c[0]).replace(/\s+/g, " "));
    expect(sqls[0]).toContain("UPDATE crm_users SET supplier_id = NULL, supplier_link_status = 'none'");
    expect(sqls[1]).toContain("UPDATE crm_supplier_claims SET status = 'cancelled'");
    expect(sqls[1]).toContain("AND status = 'pending'");
    expect(sqls[2]).toContain("UPDATE supplier SET claim_status = NULL");
    expect(sqls[2]).toContain("AND claim_status = 'pending'");
    expect(sqls[2]).toContain("NOT EXISTS");
    expect(poolExecute.mock.calls[0][1]).toEqual([42, 100]);
    expect(poolExecute.mock.calls[1][1]).toEqual([42, 100]);
    expect(poolExecute.mock.calls[2][1]).toEqual([100]);
  });

  it("解绑带 supplier_id 条件：并发换绑时不会误写别人的新绑定", async () => {
    await withdrawBinding(42, { supplierId: 100, companyName: "旧公司", state: "rejected" });
    expect(String(poolExecute.mock.calls[0][0])).toContain("WHERE id = ? AND supplier_id = ?");
  });

  it("已驳回与无状态绑定同样可撤回（旧申请作废，supplier 行保留）", async () => {
    await withdrawBinding(42, { supplierId: 7, companyName: "旧公司", state: "linked" });
    expect(poolExecute).toHaveBeenCalledTimes(3);
    expect(String(poolExecute.mock.calls[1][0])).not.toContain("DELETE");
  });
});

describe("withdrawCurrentBinding", () => {
  beforeEach(() => poolExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]));

  it("未绑定 → null 且不执行任何写（幂等入口）", async () => {
    expect(await withdrawCurrentBinding(ctxWith(null), 42)).toBeNull();
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("审核中绑定 → 撤回并返回旧绑定概况（供前端提示）", async () => {
    const got = await withdrawCurrentBinding(
      ctxWith({ id: 100, company: "杭州原绑定企业有限公司", verify_status: "pending", claim_status: null }),
      42,
    );
    expect(got).toEqual({ supplierId: 100, companyName: "杭州原绑定企业有限公司", state: "pending" });
    expect(poolExecute).toHaveBeenCalledTimes(3);
  });

  it("已认证绑定 → 400，不执行任何写", async () => {
    const ctx = ctxWith({ id: 100, company: "已认证公司", verify_status: "done", claim_status: null });
    await expect(withdrawCurrentBinding(ctx, 42)).rejects.toMatchObject({ status: 400 });
    expect(poolExecute).not.toHaveBeenCalled();
  });
});

describe("assertBindingAllowsSubject", () => {
  beforeEach(() => poolExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]));

  it("未绑定 → 直接放行，不写任何表", async () => {
    expect(await assertBindingAllowsSubject(ctxWith(null), 42, null, 200, "certify")).toBeNull();
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("目标即当前绑定行 → 放行（重复保存自己的资料），不撤回", async () => {
    const b = { supplierId: 100, companyName: "某公司", state: "verified" } as never;
    expect(await assertBindingAllowsSubject(ctxWith(null), 42, b, 100, "certify")).toBeNull();
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("已认证 + 目标他主体 → 400/40008，旧绑定不被拆掉", async () => {
    const b = { supplierId: 100, companyName: "已认证公司", state: "verified" } as never;
    await expect(assertBindingAllowsSubject(ctxWith(null), 42, b, 200, "claim")).rejects.toMatchObject({
      status: 400,
      code: 40008,
      message: expect.stringContaining("一个账号只能认领一家企业"),
    });
    expect(poolExecute).not.toHaveBeenCalled();
  });

  it("审核中 + 目标他主体 → 自动撤回旧绑定后放行（不再静默覆盖）", async () => {
    const b = { supplierId: 100, companyName: "审核中公司", state: "pending" } as never;
    const switched = await assertBindingAllowsSubject(ctxWith(null), 42, b, 200, "certify");
    expect(switched).toEqual({ supplierId: 100, companyName: "审核中公司", state: "pending" });
    expect(poolExecute).toHaveBeenCalledTimes(3);
  });
});

describe("assertVerifiedSubjectIdentityStable", () => {
  const stored = {
    company: "杭州原绑定企业有限公司",
    name_confirmed: "杭州原绑定企业有限公司",
    credit_code: "91330100MA2XXXXXX1",
    verify_status: "done",
    claim_status: null,
  };

  it("body 不含身份字段 → 不回查、不拦截", async () => {
    const ctx = ctxWith(null, null);
    await expect(assertVerifiedSubjectIdentityStable(ctx, 100, { contact: "李四" })).resolves.toBeUndefined();
    expect((ctx as never as { supplier: { directoryRepo: { findFullById: ReturnType<typeof vi.fn> } } })
      .supplier.directoryRepo.findFullById).not.toHaveBeenCalled();
  });

  it("身份字段原值回传（含大小写/空白差异）→ 放行", async () => {
    const ctx = ctxWith(null, stored);
    await expect(
      assertVerifiedSubjectIdentityStable(ctx, 100, {
        company: " 杭州原绑定企业有限公司 ",
        credit_code: "91330100ma2xxxxxx1",
      }),
    ).resolves.toBeUndefined();
  });

  it("已认证改成另一家公司 → 400/40008", async () => {
    const ctx = ctxWith(null, stored);
    await expect(assertVerifiedSubjectIdentityStable(ctx, 100, { company: "上海另一家公司有限公司" })).rejects.toMatchObject({
      status: 400,
      code: 40008,
    });
  });

  it("审核中（非 verified）允许补正身份字段", async () => {
    const ctx = ctxWith(null, { ...stored, verify_status: "pending" });
    await expect(assertVerifiedSubjectIdentityStable(ctx, 100, { credit_code: "91330100MA2YYYYYY2" })).resolves.toBeUndefined();
  });

  it("当前行查不到（孤儿绑定）→ 不拦截，交由主流程处理", async () => {
    const ctx = ctxWith(null, null);
    await expect(assertVerifiedSubjectIdentityStable(ctx, 100, { company: "任意" })).resolves.toBeUndefined();
  });
});
