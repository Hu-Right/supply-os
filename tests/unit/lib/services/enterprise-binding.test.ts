/**
 * 企业绑定排他编排服务测试
 * @module tests/unit/lib/services/enterprise-binding.test.ts
 * @description 钉住闸口自身的取数与文案：状态分类 → 拒绝措辞一一对应，
 *              以及「目标即当前绑定行」的放行例外（重复保存自己的资料不是新认证）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  assertBindingAllowsSubject,
  assertVerifiedSubjectIdentityStable,
  describeBindingConflict,
  readCurrentBinding,
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
  const binding = (state: string) => ({ supplierId: 100, companyName: "某公司", state } as never);

  it("认证动作：四种状态各给准确措辞", () => {
    expect(describeBindingConflict(binding("pending"), "certify")).toContain("一个账号只能认证一家企业");
    expect(describeBindingConflict(binding("verified"), "certify")).toContain("已认证");
    expect(describeBindingConflict(binding("rejected"), "certify")).toContain("已被驳回");
    expect(describeBindingConflict(binding("linked"), "certify")).toContain("一个账号只能绑定一家企业");
  });

  it("认领动作：四种状态各给准确措辞", () => {
    expect(describeBindingConflict(binding("pending"), "claim")).toContain("一个账号只能认领一家企业");
    expect(describeBindingConflict(binding("verified"), "claim")).toContain("已认证");
    expect(describeBindingConflict(binding("rejected"), "claim")).toContain("暂不能认领其他企业");
    expect(describeBindingConflict(binding("linked"), "claim")).toContain("一个账号只能认领一家企业");
  });
});

describe("assertBindingAllowsSubject", () => {
  it("未绑定 → 直接放行", () => {
    expect(assertBindingAllowsSubject(null, 200, "certify")).toBeNull();
  });

  it("目标即当前绑定行 → 放行（重复保存自己的资料）", () => {
    const b = { supplierId: 100, companyName: "某公司", state: "verified" } as never;
    expect(assertBindingAllowsSubject(b, 100, "certify")).toBe(b);
  });

  it("已绑定他主体 → 抛业务错误 400/40008", () => {
    const b = { supplierId: 100, companyName: "某公司", state: "pending" } as never;
    try {
      assertBindingAllowsSubject(b, 200, "claim");
      throw new Error("应当被拦截");
    } catch (err) {
      const e = err as { status?: number; code?: number; message?: string };
      expect(e.status).toBe(400);
      expect(e.code).toBe(40008); // EC_DUPLICATE
      expect(e.message).toContain("一个账号只能认领一家企业");
    }
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
