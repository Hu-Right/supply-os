/**
 * 用户身份互斥判定测试
 * @module tests/unit/lib/services/identity.test.ts
 * @description ADR-0001 服务端强制点：绑定企业 / 资源库占用的判定逻辑。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findProfileById, countByUser } = vi.hoisted(() => ({
  findProfileById: vi.fn(),
  countByUser: vi.fn(),
}));

vi.mock("@/lib/repos/users.repo", () => ({
  UsersRepo: function (this: any) {
    Object.assign(this, { findProfileById });
  },
}));

vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: any) {
    Object.assign(this, { countByUser });
  },
}));

import { hasEnterpriseBinding, hasSupplierPool } from "@/lib/services/identity";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasEnterpriseBinding", () => {
  it("supplier_id 非空 → 已绑定企业", async () => {
    findProfileById.mockResolvedValue({ id: 1, supplier_id: 10, supplier_link_status: "verified" });
    await expect(hasEnterpriseBinding({} as any, 1)).resolves.toBe(true);
  });

  it("supplier_id 为空 → 未绑定", async () => {
    findProfileById.mockResolvedValue({ id: 1, supplier_id: null, supplier_link_status: "none" });
    await expect(hasEnterpriseBinding({} as any, 1)).resolves.toBe(false);
  });

  it("用户不存在 → 未绑定（不抛错）", async () => {
    findProfileById.mockResolvedValue(null);
    await expect(hasEnterpriseBinding({} as any, 1)).resolves.toBe(false);
  });
});

describe("hasSupplierPool", () => {
  it("资源库非空 → 已占用外贸员身份", async () => {
    countByUser.mockResolvedValue(2);
    await expect(hasSupplierPool({} as any, 1)).resolves.toBe(true);
  });

  it("资源库为空 → 未占用", async () => {
    countByUser.mockResolvedValue(0);
    await expect(hasSupplierPool({} as any, 1)).resolves.toBe(false);
  });
});
