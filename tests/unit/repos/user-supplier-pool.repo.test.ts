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
    await repo.addFromPlatform(100, 10);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("INSERT IGNORE INTO user_supplier_pool");
    expect(mockExecute.mock.calls[0][1]).toEqual([100, 10]);
  });

  it("updateNotes 更新备注", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.updateNotes(100, 5, "新备注");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("UPDATE user_supplier_pool SET notes");
  });

  it("remove 删除记录", async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.remove(100, 5);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0];
    expect(sql).toContain("DELETE FROM user_supplier_pool");
  });

  it("countByUser 统计数量", async () => {
    mockQuery.mockResolvedValue([[{ cnt: 3 }]]);
    const count = await repo.countByUser(100);
    expect(count).toBe(3);
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

describe("UserSupplierPoolRepo 目录候选搜索（添加入口唯一来源）", () => {
  it("候选搜索：LIKE 通配符已转义", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[{ id: 11, company: "工厂A有限公司", industry: "", in_pool: 1 }]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    const rows = await repo.searchVerifiedByCompany("50%折扣_厂", 8, 100);
    expect(rows[0]).toEqual({ id: 11, company: "工厂A有限公司", industry: "", in_pool: 1 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("LEFT JOIN user_supplier_pool");
    expect(params[0]).toBe(100);
    expect(params[1]).toBe("%50\\%折扣\\_厂%");
  });

  it("addFromPlatform 支持事务连接执行", async () => {
    const connExecute = vi.fn().mockResolvedValue([{ insertId: 5 }]);
    const repo = new UserSupplierPoolRepo({} as any);
    await repo.addFromPlatform(1, 10, { execute: connExecute } as any);
    expect(connExecute).toHaveBeenCalledTimes(1);
  });
});

describe("searchVerifiedByCompany / findVerifiedById 边界", () => {
  it("不带 userId → 不 JOIN 资源库表，params 仅关键词", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await repo.searchVerifiedByCompany("工厂", 8);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("LEFT JOIN user_supplier_pool");
    expect(params).toEqual(["%工厂%"]);
  });

  it("limit 钳制到 1-20：0 归为默认 8，50 归为 20", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await repo.searchVerifiedByCompany("工厂", 0);
    expect(mockQuery.mock.calls[0][0]).toContain("LIMIT 8");
    await repo.searchVerifiedByCompany("工厂", 50);
    expect(mockQuery.mock.calls[1][0]).toContain("LIMIT 20");
  });

  it("行字段为 NULL → company/industry/in_pool 兜底", async () => {
    const mockQuery = vi.fn().mockResolvedValue([[{ id: 7, company: null, industry: null, in_pool: null }]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    const rows = await repo.searchVerifiedByCompany("工厂", 8, 1);
    expect(rows[0]).toEqual({ id: 7, company: "", industry: "", in_pool: 0 });
  });

  it("findVerifiedById 命中/未命中/仅认证可见", async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([[{ id: 10, company: "工厂A" }]])
      .mockResolvedValueOnce([[]]);
    const repo = new UserSupplierPoolRepo({ query: mockQuery } as any);
    await expect(repo.findVerifiedById(10)).resolves.toEqual({ id: 10, company: "工厂A", industry: "" });
    await expect(repo.findVerifiedById(10)).resolves.toBeNull();
    // 已认证口径只认 done（旧的空值 NULL 视同已认证兼容已删，2026-10-08 实库 NULL 行数=0）
    expect(mockQuery.mock.calls[0][0]).toContain("info_review_status = 'reviewed'");
    expect(mockQuery.mock.calls[0][0]).not.toContain("IS NULL");
  });
});
