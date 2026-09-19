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
