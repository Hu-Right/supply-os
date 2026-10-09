/**
 * 页签检索字段路由测试
 * @module tests/unit/lib/repos/supplier-directory-field-search.test.ts
 * @description 钉住「点哪个页签，关键词就落在哪一列」（此前七个页签是装饰性的，
 *              选中状态从未进过查询）：product→FULLTEXT、country→country/country_code、
 *              certification→certification、factory→business_type/business_type_code、
 *              unspsc→画像表编码前缀、industry→行业面子树（行业节点码集，**不是** industry
 *              自由文本）；缺省与白名单外字段一律
 *              回落公司名 LIKE（与旧行为一致）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo.listDirectoryPaginated — 页签字段路由", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
  });

  async function sqlFor(
    field?: string,
    search = "测试词",
    extra?: { industryCodes?: readonly string[] },
  ): Promise<string> {
    // 每次调用自补两条返回值：第 1 条是 COUNT，第 2 条才是取数查询
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await repo.listDirectoryPaginated({ limit: 9, offset: 0, search, field, ...extra });
    return mockQuery.mock.calls[1][0] as string;
  }

  async function valuesFor(field?: string, search = "测试词", extra?: { industryCodes?: readonly string[] }) {
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await repo.listDirectoryPaginated({ limit: 9, offset: 0, search, field, ...extra });
    return mockQuery.mock.calls[1][1] as unknown[];
  }

  it("缺省（无 field）→ 关键词落公司名 LIKE（保持旧行为）", async () => {
    expect(await sqlFor(undefined)).toContain("company LIKE ?");
  });

  it("field=factory（工厂/贸易商页签）→ business_type 原文 + business_type_code 枚举双列", async () => {
    const sql = await sqlFor("factory", "制造商");
    expect(sql).toContain("business_type LIKE ?");
    expect(sql).toContain("business_type_code = ?");
  });

  it("field=product → FULLTEXT MATCH（与后台多维检索同一索引）", async () => {
    expect(await sqlFor("product")).toContain("MATCH(s.products, s.product_keywords)");
  });

  it("field=country → country 与 country_code 双列", async () => {
    const sql = await sqlFor("country", "中国");
    expect(sql).toContain("country LIKE ?");
    expect(sql).toContain("country_code LIKE ?");
  });

  it("field=certification → certification LIKE", async () => {
    expect(await sqlFor("certification", "ISO9001")).toContain("certification LIKE ?");
  });

  it("field=industry → 走行业面子树 EXISTS，绝不再 LIKE 自由文本 industry 列", async () => {
    const sql = await sqlFor("industry", "机械", { industryCodes: ["UGT-I-03", "UGT-I-33"] });
    expect(sql).toContain("crm_supplier_industry_rel");
    // 多个候选节点 = 多个前缀 OR，而传参仍是占位符（码永不拼进 SQL）
    expect((sql.match(/ir\.industry_code LIKE \?/g) ?? []).length).toBe(2);
    expect(sql).not.toContain("industry LIKE ?");
    expect(await valuesFor("industry", "机械", { industryCodes: ["UGT-I-03"] })).toContain("UGT-I-03%");
  });

  it("field=industry 但树上没解析出节点 → 1 = 0（无结果），不默默退回文本口径", async () => {
    for (const codes of [[], ["不是码"], undefined]) {
      const sql = await sqlFor("industry", "家具", { industryCodes: codes });
      expect(sql).toContain("1 = 0");
      expect(sql).not.toContain("crm_supplier_industry_rel");
    }
  });

  it("field=unspsc → 画像表编码前缀 EXISTS", async () => {
    const sql = await sqlFor("unspsc", "4411");
    expect(sql).toContain("crm_supplier_unspsc_interests");
    expect(sql).toContain("i.code LIKE ?");
  });

  it("白名单外 field → 回落公司名 LIKE（field 永不拼接进 SQL，无注入面）", async () => {
    expect(await sqlFor("; drop table --")).toContain("company LIKE ?");
    expect(await sqlFor("; drop table --")).not.toContain("drop table");
  });

  it("引用 s. 别名的分支必须配得上 FROM supplier s（无别名时 MySQL 报错、路由吐空列表）", async () => {
    // 产品走 FULLTEXT、unspsc 与行业码走 EXISTS 相关子查询：三个都写 s.
    for (const field of ["product", "unspsc", "factory", "country", "certification", "company", "industry"]) {
      const sql = await sqlFor(field);
      if (/\bs\./.test(sql)) {
        expect(sql, `field=${field} 引用了 s. 但 FROM 无别名`).toMatch(/FROM supplier s/);
      }
    }
  });
});
