/**
 * 行业面码筛选测试（目录分页）
 * @module tests/unit/lib/repos/supplier-directory-industry-code.test.ts
 * @description /api/suppliers?industry_code= 是行业主轴（门类 chip）的入口：2026-10-10 起
 *              它是唯一的行业点选口径（旧 ?industry= 自由文本等值参数已退役，大类也不再进控件）。
 *              钉四条：
 *              1. 选中的是**节点子树**（大类要含其下中类/小类的挂靠），不是等值匹配；
 *              2. 判定走 crm_supplier_industry_rel，与卡片多行业标签、facet 计数同一张表
 *                 （chip 数字、筛选结果、卡片标签三处必须同源，否则用户看到自相矛盾的数字）；
 *              3. 非法码 = 不筛选，且码永不拼进 SQL；
 *              4. 取列必须带上 industry_code，否则映射层拿不到码，卡片只能退回旧文本。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo.listDirectoryPaginated — industryCode 子树筛选", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as never;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
  });

  async function callFor(industryCode?: string) {
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await repo.listDirectoryPaginated({ limit: 8, offset: 0, industryCode });
    return {
      sql: mockQuery.mock.calls[1][0] as string,
      values: mockQuery.mock.calls[1][1] as unknown[],
    };
  }

  it("门类码 → rel 表 EXISTS + 前缀 LIKE（含整棵子树）", async () => {
    const { sql, values } = await callFor("UGT-I-03");
    expect(sql).toContain("EXISTS (SELECT 1 FROM crm_supplier_industry_rel ir");
    expect(sql).toContain("ir.industry_code LIKE ?");
    expect(values).toContain("UGT-I-03%");
  });

  it("大类码同样按前缀展开，选中大类能带出其下中类与小类", async () => {
    const { values } = await callFor("UGT-I-0326");
    expect(values).toContain("UGT-I-0326%");
  });

  it("非法码（品目面码、注入串）不产生筛选条件，等同未选", async () => {
    for (const bad of ["UGT-C-03260701", "UGT-I-03' OR 1=1--", "任意文本"]) {
      const { sql } = await callFor(bad);
      expect(sql).not.toContain("crm_supplier_industry_rel");
      expect(sql).not.toContain(bad);
    }
  });

  it("取列包含 industry_code（缺了它就等于白装这条链路）", async () => {
    const { sql } = await callFor("UGT-I-03");
    expect(sql).toMatch(/SELECT[\s\S]*industry_code[\s\S]*FROM supplier/);
  });

  it("已退役的自由文本检索不得复活：对 supplier.industry 列的任何谓词都不允许出现", async () => {
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await repo.listDirectoryPaginated({
      limit: 8, offset: 0, search: "制造业", field: "company", industryCode: "UGT-I-03", industryCodes: [],
    });
    const sql = mockQuery.mock.calls[1][0] as string;
    // 出现 industry = ? / industry LIKE ? 就是脏数据重回检索路径（取列里的 s.industry 不算谓词）
    expect(sql).not.toMatch(/\bindustry = \?/);
    expect(sql).not.toMatch(/\bindustry LIKE \?/);
    expect(sql).toContain("1 = 0");
  });
});
