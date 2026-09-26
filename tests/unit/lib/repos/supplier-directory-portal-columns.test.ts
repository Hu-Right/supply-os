/**
 * supplier 门户读列白名单测试（断掉历史上的 `SELECT *` 整行透传）
 * @module tests/unit/lib/repos/supplier-directory-portal-columns.test.ts
 * @description supplier 是 supply-os 与 intelligence-daily 共用的 54 列外部表。
 *              findFullById 的结果会经 GET /api/user/enterprise 直达前端，历史上是 `SELECT *`：
 *              站外加列/改名会以「前端字段突然 undefined」的形式暴露，而不是在变更当场被发现。
 *              本测试钉三件事：
 *              1. 查询必须是显式列清单，绝不回到 `SELECT *`；
 *              2. 白名单必须覆盖全部可编辑列（否则企业编辑表单回填会静默缺字段）；
 *              3. 白名单必须覆盖前端在企业卡片/资料页真正在读的那些状态与展示列。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo 门户读列白名单", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[]]);
  });

  it("白名单覆盖全部可编辑列 + 门户另需的状态/展示列", () => {
    const cols = SupplierDirectoryRepo.PORTAL_COLUMNS as readonly string[];
    for (const c of SupplierDirectoryRepo.EDITABLE_COLUMNS) {
      expect(cols).toContain(c);
    }
    // 前端 EnterpriseInfoCard / ProfileContent 实际读到的非编辑列，逐个点名（缺一个就会静默丢显示）
    for (const c of [
      "id", "verify_status", "claim_status", "coop_status", "check_note",
      "data_quality_score", "addtime", "license_url",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("白名单不得包含门户不读的站外列（防有人顺手加回 SELECT *）", () => {
    const cols = SupplierDirectoryRepo.PORTAL_COLUMNS as readonly string[];
    for (const c of [
      "merged_id", "product_keywords", "business_scope", "source_url", "tenant_id",
      "industry_id", "info_check", "webcheck_status", "enrich_suggested", "enrich_status",
      "certification_tags", "business_type_code", "unspsc_match_status", "last_match_at",
    ]) {
      expect(cols).not.toContain(c);
    }
  });

  it("findFullById 用显式列清单查询，且不再出现 SELECT *", async () => {
    await repo.findFullById(123);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    // 列清单由白名单拼接：首个是 EDITABLE_COLUMNS 首位 company，id 作为附加列在后
    expect(sql).toContain("SELECT `company`");
    expect(sql).toContain("`id`");
    expect(sql).toContain("`credit_code`");
    expect(sql).toContain("`license_url`");
    expect(sql).toContain("FROM supplier WHERE id = ? LIMIT 1");
    expect(params).toEqual([123]);
    // 列数必须与白名单一致（防止漏拼或重复）
    const listed = sql.slice(sql.indexOf("SELECT") + 6, sql.indexOf("FROM supplier")).split(",").length;
    expect(listed).toBe(SupplierDirectoryRepo.PORTAL_COLUMNS.length);
  });
});
