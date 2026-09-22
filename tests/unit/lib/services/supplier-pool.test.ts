/**
 * 供应商资源库服务测试
 * @module tests/unit/lib/services/supplier-pool.test.ts
 * @description 上限校验、平台匹配/复用 pending/新建的事务编排、重复与回滚路径。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  countByUser, findVerifiedByCompany, findLatestQualificationId, addFromPlatform,
  findPendingByExactCompany, createPendingSupplier, addManual,
} = vi.hoisted(() => ({
  countByUser: vi.fn(),
  findVerifiedByCompany: vi.fn(),
  findLatestQualificationId: vi.fn(),
  addFromPlatform: vi.fn(),
  findPendingByExactCompany: vi.fn(),
  createPendingSupplier: vi.fn(),
  addManual: vi.fn(),
}));

vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: any) {
    Object.assign(this, {
      countByUser, findVerifiedByCompany, findLatestQualificationId, addFromPlatform,
      findPendingByExactCompany, createPendingSupplier, addManual,
    });
  },
}));

import { addSupplierToPool, MAX_POOL_SIZE } from "@/lib/services/supplier-pool";

/** 模拟事务连接与连接池 */
const makePool = () => {
  const conn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = { getConnection: vi.fn(async () => conn) };
  return { pool: pool as any, conn };
};

beforeEach(() => {
  vi.clearAllMocks();
  countByUser.mockResolvedValue(0);
  addFromPlatform.mockResolvedValue(7);
  addManual.mockResolvedValue(9);
  createPendingSupplier.mockResolvedValue(55);
});

describe("addSupplierToPool", () => {
  it("资源库已满 → pool_full，不做任何写入", async () => {
    countByUser.mockResolvedValue(MAX_POOL_SIZE);
    const { pool } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂A");
    expect(res).toEqual({ ok: false, reason: "pool_full" });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it("平台目录命中 → 关联最新诊断记录，返回 platform", async () => {
    findVerifiedByCompany.mockResolvedValue({ id: 10, company: "工厂A", industry: "电子" });
    findLatestQualificationId.mockResolvedValue(33);
    const { pool } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂A");
    expect(res).toEqual({ ok: true, poolId: 7, source: "platform", supplierId: 10 });
    expect(addFromPlatform).toHaveBeenCalledWith(1, 10, 33);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it("平台命中但已在资源库（insertId=0）→ duplicate", async () => {
    findVerifiedByCompany.mockResolvedValue({ id: 10, company: "工厂A", industry: "电子" });
    addFromPlatform.mockResolvedValue(0);
    const { pool } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂A");
    expect(res).toEqual({ ok: false, reason: "duplicate" });
  });

  it("未命中目录但有同名 pending 记录 → 复用不新建，事务提交", async () => {
    findVerifiedByCompany.mockResolvedValue(null);
    findPendingByExactCompany.mockResolvedValue({ id: 44 });
    const { pool, conn } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂B");
    expect(res).toEqual({ ok: true, poolId: 9, source: "manual", supplierId: 44 });
    expect(createPendingSupplier).not.toHaveBeenCalled();
    expect(addManual).toHaveBeenCalledWith(1, 44, conn);
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it("无 pending 记录 → 事务内新建 supplier + 资源库行", async () => {
    findVerifiedByCompany.mockResolvedValue(null);
    findPendingByExactCompany.mockResolvedValue(null);
    const { pool, conn } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂C");
    expect(res).toEqual({ ok: true, poolId: 9, source: "manual", supplierId: 55 });
    expect(createPendingSupplier).toHaveBeenCalledWith("工厂C", conn);
    expect(addManual).toHaveBeenCalledWith(1, 55, conn);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it("事务内失败 → 回滚且释放连接，异常上抛", async () => {
    findVerifiedByCompany.mockResolvedValue(null);
    findPendingByExactCompany.mockResolvedValue(null);
    addManual.mockRejectedValue(new Error("boom"));
    const { pool, conn } = makePool();
    await expect(addSupplierToPool(pool, 1, "工厂D")).rejects.toThrow("boom");
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it("唯一键冲突（ER_DUP_ENTRY）→ 映射为 duplicate 而非抛错", async () => {
    findVerifiedByCompany.mockResolvedValue(null);
    findPendingByExactCompany.mockResolvedValue({ id: 44 });
    addManual.mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
    const { pool } = makePool();
    const res = await addSupplierToPool(pool, 1, "工厂E");
    expect(res).toEqual({ ok: false, reason: "duplicate" });
  });
});
