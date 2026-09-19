import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";

describe("UserSupplierPoolRepo", () => {
  const mockQuery = vi.fn();
  const mockExecute = vi.fn();
  const mockPool = { query: mockQuery, execute: mockExecute } as any;
  let repo: UserSupplierPoolRepo;

  beforeEach(() => {
    repo = new UserSupplierPoolRepo(mockPool);
    mockQuery.mockReset();
    mockExecute.mockReset();
  });

  it("listByUser 查询用户资源库列表", async () => {
    const fakeRows = [
      { pool_id: 1, supplier_id: 10, company: "测试工厂", industry: "电子", has_qualification: 1, notes: "备注", source: "platform", created_at: "2026-01-01" },
    ];
    mockQuery.mockResolvedValue([fakeRows]);
    const result = await repo.listByUser(100);
    expect(result).toHaveLength(1);
    expect(result[0].company).toBe("测试工厂");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("addFromPlatform 插入平台匹配记录", async () => {
    mockExecute.mockResolvedValue([{ insertId: 5 }]);
    await repo.addFromPlatform(100, 10, 20);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("INSERT IGNORE INTO crm_user_supplier_pool");
  });

  it("addManual 插入手动添加记录", async () => {
    mockExecute.mockResolvedValue([{ insertId: 6 }]);
    await repo.addManual(100, 30);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("INSERT INTO crm_user_supplier_pool");
  });

  it("updateNotes 更新备注", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.updateNotes(100, 5, "新备注");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("UPDATE crm_user_supplier_pool SET notes");
  });

  it("remove 删除记录", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.remove(100, 5);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("DELETE FROM crm_user_supplier_pool");
  });

  it("countByUser 统计数量", async () => {
    mockQuery.mockResolvedValue([[{ cnt: 3 }]]);
    const count = await repo.countByUser(100);
    expect(count).toBe(3);
  });

  it("linkQualification 回写诊断记录关联", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.linkQualification(100, 5, 99);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("qualification_id = ?");
  });

  it("fetchSupplierProfiles 获取供应商完整画像", async () => {
    const fakeProfiles = [
      { pool_id: 1, supplier_id: 10, company: "工厂A", industry: "电子", products: "芯片" },
    ];
    mockQuery.mockResolvedValue([fakeProfiles]);
    const result = await repo.fetchSupplierProfiles(100);
    expect(result).toHaveLength(1);
    expect(result[0].company).toBe("工厂A");
  });
});

describe("UserSupplierPoolRepo.countDiagnosisPending", () => {
  it("统计缺诊断资料的工厂数", async () => {
    const mockQuery = vi.fn();
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    mockQuery.mockResolvedValue([[{ cnt: 3 }]]);
    const count = await repo.countDiagnosisPending(100);
    expect(count).toBe(3);
    expect(mockQuery.mock.calls[0][0]).toContain("q.id IS NULL");
  });
});

describe("UserSupplierPoolRepo 目录查找与 pending 去重（service 编排所需）", () => {
  const row = { id: 10, company: "工厂A", industry: "电子" };

  it("findVerifiedByCompany 精确命中 → 只发一条查询", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[row]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    const found = await repo.findVerifiedByCompany("工厂A");
    expect(found).toEqual({ id: 10, company: "工厂A", industry: "电子" });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("精确未命中 → 回退模糊 LIKE，且通配符已转义", async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 11, company: "工厂A有限公司", industry: "" }]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    const found = await repo.findVerifiedByCompany("50%折扣_厂");
    expect(found?.id).toBe(11);
    const likeParam = mockQuery.mock.calls[1][1][0] as string;
    // % 与 _ 必须被反斜杠转义，避免用户输入充当 LIKE 通配符
    expect(likeParam).toBe("%50" + String.fromCharCode(92) + "%折扣" + String.fromCharCode(92) + "_厂%");
  });

  it("精确与模糊均未命中 → null", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await expect(repo.findVerifiedByCompany("不存在")).resolves.toBeNull();
  });

  it("findPendingByExactCompany 命中/未命中", async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([[{ id: 44 }]])
      .mockResolvedValueOnce([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await expect(repo.findPendingByExactCompany("工厂B")).resolves.toEqual({ id: 44 });
    await expect(repo.findPendingByExactCompany("工厂B")).resolves.toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain("verify_status = 'pending'");
  });

  it("findLatestQualificationId 返回最新诊断 id / 无记录返回 null", async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([[{ id: 99 }]])
      .mockResolvedValueOnce([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await expect(repo.findLatestQualificationId(10)).resolves.toBe(99);
    await expect(repo.findLatestQualificationId(10)).resolves.toBeNull();
  });

  it("createPendingSupplier 插入 pending 基础记录", async () => {
    const mockExecute = vi.fn().mockResolvedValue([{ insertId: 66 }]);
    const repo = new UserSupplierPoolRepo({ execute: mockExecute } as any);
    const id = await repo.createPendingSupplier("工厂C");
    expect(id).toBe(66);
    expect(mockExecute.mock.calls[0][0]).toContain("verify_status"); expect(mockExecute.mock.calls[0][1]).toEqual(["工厂C"]);
    expect(mockExecute.mock.calls[0][1]).toEqual(["工厂C"]);
  });

  it("addFromPlatform/addManual 支持事务连接执行", async () => {
    const connExecute = vi.fn().mockResolvedValue([{ insertId: 5 }]);
    const conn = { execute: connExecute };
    const repo = new UserSupplierPoolRepo({} as any);
    await repo.addFromPlatform(1, 10, null, conn as any);
    await repo.addManual(1, 10, conn as any);
    expect(connExecute).toHaveBeenCalledTimes(2);
  });
});
