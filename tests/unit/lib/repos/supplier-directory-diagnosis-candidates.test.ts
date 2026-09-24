/**
 * 诊断入口「检测并确认主体」候选查询测试
 * @module tests/unit/lib/repos/supplier-directory-diagnosis-candidates.test.ts
 * @description 钉住 bound（重复绑定提示）口径：
 *              1. SELECT 通过 EXISTS(crm_users) 计算「是否已被其他用户/账户绑定」，
 *                 并用 cu.id <> ? 排除当前用户（自己的企业不该提示「已被绑定」）；
 *              2. 占位符按出现顺序排布：excludeUserId 先于 LIKE，再于 LIMIT，避免错序；
 *              3. excludeUserId 缺省时归一为 0（不排除任何用户，任意绑定都计为 bound）；
 *              4. 用户输入的 % 必须转义，沿用认领建议同口径。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo.findDiagnosisCandidatesByName", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[]]);
  });

  it("SELECT 带出 bound：EXISTS(crm_users) 且排除当前用户，占位符顺序 uid/keyword/limit", async () => {
    mockQuery.mockResolvedValue([[{ id: 7, company: "深圳某科技有限公司", verify_status: "done", bound: 1 }]]);
    const rows = await repo.findDiagnosisCandidatesByName("深圳%某", 5, 42);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("AS bound");
    expect(sql).toContain("EXISTS(");
    expect(sql).toContain("FROM crm_users cu");
    expect(sql).toContain("cu.supplier_id = supplier.id");
    expect(sql).toContain("cu.id <> ?");
    // 已合并行仍被排除，候选口径不变
    expect(sql).toContain("merged_id IS NULL");
    // 占位符严格按出现顺序：EXISTS 内的 excludeUserId 先于 LIKE，再于 LIMIT
    expect(params[0]).toBe(42);
    expect(params[1]).toBe("深圳\\%某%"); // 用户输入的 % 被转义为 \%
    expect(params[2]).toBe(5);
    expect(rows[0]?.bound).toBe(1);
  });

  it("excludeUserId 缺省时归一为 0（不排除任何用户）", async () => {
    await repo.findDiagnosisCandidatesByName("北京", 5);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe(0);
    expect(params[1]).toBe("北京%");
  });

  it("空关键词直接返回空数组，不打库", async () => {
    const rows = await repo.findDiagnosisCandidatesByName("   ", 5, 42);
    expect(rows).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
