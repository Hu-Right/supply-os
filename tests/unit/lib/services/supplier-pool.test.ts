/**
 * 供应商资源库服务测试
 * @module tests/unit/lib/services/supplier-pool.test.ts
 * @description 入口收敛后只剩「按平台目录 id 入池」：上限、未认证、重复、成功四条路径。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { countByUser, findVerifiedById, addFromPlatform } = vi.hoisted(() => ({
  countByUser: vi.fn(),
  findVerifiedById: vi.fn(),
  addFromPlatform: vi.fn(),
}));

vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: any) {
    Object.assign(this, { countByUser, findVerifiedById, addFromPlatform });
  },
}));

import { addSupplierByIdToPool, MAX_POOL_SIZE } from "@/lib/services/supplier-pool";

beforeEach(() => {
  vi.clearAllMocks();
  countByUser.mockResolvedValue(0);
  findVerifiedById.mockResolvedValue({ id: 10, company: "工厂A", industry: "电子" });
  addFromPlatform.mockResolvedValue(7);
});

describe("addSupplierByIdToPool", () => {
  it("资源库已满 → pool_full，不查目录、不写入", async () => {
    countByUser.mockResolvedValue(MAX_POOL_SIZE);
    const res = await addSupplierByIdToPool({} as any, 1, 10);
    expect(res).toEqual({ ok: false, reason: "pool_full" });
    expect(findVerifiedById).not.toHaveBeenCalled();
    expect(addFromPlatform).not.toHaveBeenCalled();
  });

  it("目录里没有该 id 或未通过认证 → not_found", async () => {
    findVerifiedById.mockResolvedValue(null);
    const res = await addSupplierByIdToPool({} as any, 1, 10);
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(addFromPlatform).not.toHaveBeenCalled();
  });

  it("已在资源库（insertId=0）→ duplicate", async () => {
    addFromPlatform.mockResolvedValue(0);
    const res = await addSupplierByIdToPool({} as any, 1, 10);
    expect(res).toEqual({ ok: false, reason: "duplicate" });
  });

  it("成功 → 返回 platform 来源与 supplierId", async () => {
    const res = await addSupplierByIdToPool({} as any, 1, 10);
    expect(res).toEqual({ ok: true, poolId: 7, source: "platform", supplierId: 10 });
    expect(addFromPlatform).toHaveBeenCalledWith(1, 10);
  });
});
