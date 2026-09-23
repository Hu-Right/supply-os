/**
 * 供应商目录「认领建议」与防重查找测试
 * @module tests/unit/lib/repos/supplier-directory-suggest.test.ts
 * @description 覆盖注册 KPI「个人起步 · 认证转企业」配套的两处口径：
 *              1. findVerifiedByNameSimilar 只回已认证行（认领引导的候选池）；
 *              2. findByCreditCode / findByCompanyBest 必须带出 verify_status
 *                 （POST 防重分支据此区分「已认证→转认领 / 未认证→直接绑定」）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo 认领建议", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[]]);
  });

  it("findVerifiedByNameSimilar：只查已认证未合并行，LIKE 通配符转义，前缀优先", async () => {
    mockQuery.mockResolvedValue([[{ id: 3, company: "华为技术有限公司", country: "中国", industry: "通信" }]]);
    const rows = await repo.findVerifiedByNameSimilar("华为%", 5);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("verify_status = 'done'");
    expect(sql).toContain("merged_id IS NULL");
    // 用户输入的 % 必须转义，不能变成全表通配
    expect(params[0]).toBe("华为\\%%");
    expect(params[1]).toBe("%华为\\%%");
    expect(params[2]).toBe("华为\\%%");
    expect(params[3]).toBe(5);
    // 排序：前缀命中优先
    const orderIdx = sql.indexOf("ORDER BY");
    expect(sql.slice(orderIdx)).toContain("(company LIKE ?) DESC");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.company).toBe("华为技术有限公司");
    // 只回公开字段
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["company", "country", "id", "industry"]);
  });

  it("findByCreditCode / findByCompanyBest 的 SELECT 带出 verify_status", async () => {
    mockQuery.mockResolvedValue([[{ id: 1, verify_status: "done" }]]);
    await repo.findByCreditCode("91330000XXX");
    expect(mockQuery.mock.calls[0][0] as string).toContain("verify_status");

    mockQuery.mockResolvedValue([[{ id: 2, verify_status: "pending" }]]);
    await repo.findByCompanyBest("某某有限公司");
    expect(mockQuery.mock.calls[1][0] as string).toContain("verify_status");
  });
});
