/**
 * 目录检索条件拼装测试（行业为轴 + 产品/公司关键词）
 * @module tests/unit/lib/repos/supplier-directory-field-search.test.ts
 * @description 钉四件事：
 *              1. 关键词只能落 product（FULLTEXT）或 company（LIKE），其余值一律回落公司名；
 *                 国家/认证/工厂·贸易商/UNSPSC 四个入口已于 2026-10-10 下线，不得复活；
 *              2. industryCodes 的**三态**语义（未提 / 提了但解不到 / 解到了）；
 *              3. sort 只从白名单取表达式，用户输的东西永不进 ORDER BY；
 *              4. 引用 s. 别名的分支必须配得上 FROM supplier s（曾经无别名被路由吞成空列表）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";

describe("SupplierDirectoryRepo.listDirectoryPaginated — 检索条件拼装", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as any;
  let repo: SupplierDirectoryRepo;

  beforeEach(() => {
    repo = new SupplierDirectoryRepo(mockPool);
    mockQuery.mockReset();
  });

  /** limit/offset 由本 helper 统一填，用例只关心条件拼装 */
  type CallParams = Omit<Parameters<SupplierDirectoryRepo["listDirectoryPaginated"]>[0], "limit" | "offset">;

  /** 跑一次并拿到取数查询的 SQL 与参数（第 1 条是 COUNT）。
   *  ★ 必须先 mockClear：calls 数组只在 beforeEach 清，一个用例里连跑两次 call 时
   *  第二次仍会读到第一次的 SQL——sort=newest 曾因此读到 completeness 的 ORDER BY 而误判，
   *  而「空数组→1 = 0」那条则是读了上一条的 SQL 恰好蒙对（假通过）。 */
  async function call(params: CallParams) {
    mockQuery.mockClear();
    mockQuery.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await repo.listDirectoryPaginated({ limit: 9, offset: 0, ...params });
    const sql = mockQuery.mock.calls[1][0] as string;
    return {
      sql,
      values: mockQuery.mock.calls[1][1] as unknown[],
      /** 只看 WHERE 片段：SELECT 列白名单本来就带着 certification / business_type_code，
       *  拿整条 SQL 断「不得出现某列」会在退役维度用例上误报。 */
      where: sql.slice(sql.indexOf("WHERE") + 6, sql.indexOf("ORDER BY")),
    };
  }

  it("缺省（无 field）与 field=company → 关键词落公司名 LIKE", async () => {
    expect((await call({ search: "测试词" })).sql).toContain("company LIKE ?");
    expect((await call({ search: "测试词", field: "company" })).sql).toContain("company LIKE ?");
  });

  it("field=product → FULLTEXT MATCH（与后台多维检索同一索引）", async () => {
    expect((await call({ search: "LED", field: "product" })).sql).toContain("MATCH(s.products, s.product_keywords)");
  });

  it("已下线的四个维度不得复活：传入也只回落公司名，不碰它们自己的列", async () => {
    for (const field of ["country", "certification", "factory", "unspsc"]) {
      const { where } = await call({ search: "whatever", field });
      expect(where, `field=${field} 应回落公司名`).toContain("company LIKE ?");
      expect(where).not.toContain("country_code");
      expect(where).not.toContain("certification");
      expect(where).not.toContain("business_type");
      expect(where).not.toContain("crm_supplier_unspsc_interests");
    }
  });

  it("白名单外 field → 回落公司名 LIKE（field 永不拼接进 SQL，无注入面）", async () => {
    const { sql } = await call({ search: "x", field: "; drop table --" });
    expect(sql).toContain("company LIKE ?");
    expect(sql).not.toContain("drop table");
  });

  it("industryCodes 未提（undefined）→ 不产生任何行业条件", async () => {
    const { sql } = await call({ search: "LED", field: "product" });
    expect(sql).not.toContain("crm_supplier_industry_rel");
    expect(sql).not.toContain("1 = 0");
  });

  it("industryCodes 提了但树上解不到（空数组）→ 1 = 0，不默默退回文本口径", async () => {
    const { sql } = await call({ industryCodes: [] });
    expect(sql).toContain("1 = 0");
    expect(sql).not.toContain("crm_supplier_industry_rel");
    // 非法码等同于解不到：不得把注入串当码前缀
    expect((await call({ industryCodes: ["UGT-I-03' OR 1=1--"] })).sql).toContain("1 = 0");
  });

  it("industryCodes 解到了 → 子树前缀 OR，多个候选就多条占位符", async () => {
    const { sql, values } = await call({ industryCodes: ["UGT-I-03", "UGT-I-33"] });
    expect(sql).toContain("EXISTS (SELECT 1 FROM crm_supplier_industry_rel ir");
    expect((sql.match(/ir\.industry_code LIKE \?/g) ?? []).length).toBe(2);
    expect(values).toContain("UGT-I-03%");
    expect(values).toContain("UGT-I-33%");
  });

  it("门类 chip + 行业词 + 产品关键词三者可叠加（AND 交集）", async () => {
    const { sql, values } = await call({
      search: "电气", field: "product", industryCode: "UGT-I-03", industryCodes: ["UGT-I-0326"],
    });
    expect(sql).toContain("MATCH(s.products, s.product_keywords)");
    expect((sql.match(/ir\.industry_code LIKE \?/g) ?? []).length).toBe(2);
    expect(values).toContain("UGT-I-03%");
    expect(values).toContain("UGT-I-0326%");
  });

  it("sort 只从白名单取表达式，白名单外与缺省都回落最新", async () => {
    expect((await call({ sort: "completeness" })).sql).toContain("ORDER BY s.data_quality_score DESC, s.id DESC");
    expect((await call({ sort: "newest" })).sql).toContain("ORDER BY s.id DESC");
    expect((await call({})).sql).toContain("ORDER BY s.id DESC");
    const bad = await call({ sort: "id ASC; drop table supplier" });
    expect(bad.sql).toContain("ORDER BY s.id DESC");
    expect(bad.sql).not.toContain("drop table");
  });

  it("sort 命中原型链键也不能破白名单（对象字面量会把 constructor/__proto__ 当合法值）", async () => {
    for (const sort of ["constructor", "__proto__", "toString", "valueOf"]) {
      const { sql } = await call({ sort });
      expect(sql, `sort=${sort}`).toContain("ORDER BY s.id DESC");
      expect(sql).not.toMatch(/function|object Object/);
    }
  });

  it("引用 s. 别名的分支必须配得上 FROM supplier s（无别名时 MySQL 报错、路由吐空列表）", async () => {
    // 产品走 FULLTEXT，行业 chip 与行业词走 EXISTS 相关子查询：三个都写 s.
    const cases = [
      { search: "LED", field: "product" },
      { search: "华为", field: "company" },
      { industryCode: "UGT-I-03" },
      { industryCodes: ["UGT-I-0326"] },
      { sort: "completeness" },
    ];
    for (const params of cases) {
      const { sql } = await call(params);
      if (/\bs\./.test(sql)) {
        expect(sql, JSON.stringify(params) + " 引用了 s. 但 FROM 无别名").toMatch(/FROM supplier s/);
      }
    }
  });
});
