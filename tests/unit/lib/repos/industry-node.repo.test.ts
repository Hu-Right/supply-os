/**
 * 行业面读层 SQL 契约测试
 * @module tests/unit/lib/repos/industry-node.repo.test.ts
 * @description 门户行业标签与级联下拉都走这一层。钉几件事：
 *              1. 空入参不发 SQL（目录页首屏常有整页无码的行，别让它们打出 IN ()）；
 *              2. 级联的层级参数走白名单、父码先验合法性，越界/非法值直接返回空集而不是拼进 SQL；
 *              3. 级联读**完整分类树**（status=1、按码序），不再 JOIN supplier 算计数——
 *                 零挂靠节点同样下发、同样可选（选中后正常出「无结果」）；
 *              4. 关键词节点检索只走占位符、通配符先转义（用户输入 % 不能变成「搜全部」），
 *                 且官方名/释义两个粒度各自独立（名命中时不得把释义一起拉进来）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndustryNodeRepo } from "@/lib/repos/industry-node.repo";

describe("IndustryNodeRepo", () => {
  const mockQuery = vi.fn();
  const mockPool = { query: mockQuery } as never;
  let repo: IndustryNodeRepo;

  beforeEach(() => {
    repo = new IndustryNodeRepo(mockPool);
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([[]]);
  });

  it("findNodesByCodes：空入参零查询；非空入参按码占位符展开（不拼字符串）", async () => {
    await repo.findNodesByCodes([]);
    expect(mockQuery).not.toHaveBeenCalled();

    await repo.findNodesByCodes(["UGT-I-03", "UGT-I-0326"]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("code IN (?, ?)");
    expect(params).toEqual(["UGT-I-03", "UGT-I-0326"]);
  });

  it("listLinksBySupplierIds：非正整数 id 先剔除，空集不发 SQL", async () => {
    await repo.listLinksBySupplierIds([0, -1, NaN]);
    expect(mockQuery).not.toHaveBeenCalled();

    await repo.listLinksBySupplierIds([3, 7]);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([3, 7]);
  });

  it("listNodesByLevel：层级白名单外的值不发 SQL（level 永不进字符串拼接）", async () => {
    await repo.listNodesByLevel("subclass' --" as never);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("listNodesByLevel：读完整树某一层，status=1、按码序，不再 JOIN supplier 算计数", async () => {
    await repo.listNodesByLevel("section");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("level = ?");
    expect(sql).toContain("status = 1");
    expect(sql).toContain("ORDER BY code");
    expect(sql).not.toContain("WITH RECURSIVE");
    expect(sql).not.toContain("crm_supplier_industry_rel");
    expect(params).toEqual(["section"]);
    expect(sql).not.toContain("section' --");
  });

  it("listChildNodes：非法父码不发 SQL；合法父码走 parent_code 等值 + status=1 + 码序（无计数）", async () => {
    await repo.listChildNodes("bad-code");
    expect(mockQuery).not.toHaveBeenCalled();

    await repo.listChildNodes("UGT-I-03");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("parent_code = ?");
    expect(sql).toContain("status = 1");
    expect(sql).toContain("ORDER BY code");
    expect(sql).not.toContain("crm_supplier_industry_rel");
    expect(params).toEqual(["UGT-I-03"]);
  });

  it("searchNodesByKeyword：空白词零查询（不为空搜索打一次全表 LIKE）", async () => {
    expect(await repo.searchNodesByKeyword("   ")).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("searchNodesByName：不碰释义（释义是「本层包括哪些活动」的枚举，细分词会被冲到门类级）", async () => {
    await repo.searchNodesByName("照明");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("name_zh LIKE ?");
    expect(sql).toContain("name_en LIKE ?");
    expect(sql).not.toContain("description");
    expect(params).toEqual(["%照明%", "%照明%", 200]);
  });

  it("searchNodesByName：空白词零查询，与 keyword 版同一套转义/限长规则", async () => {
    expect(await repo.searchNodesByName("  ")).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
    await repo.searchNodesByName("100%", 999999);
    expect(mockQuery.mock.calls[0][1]).toEqual(["%100\\%%", "%100\\%%", 500]);
  });

  it("searchNodesByKeyword：中英文与官方释义三处同搜（英文界面也要能按行业搜）", async () => {
    await repo.searchNodesByKeyword("lighting");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("name_zh LIKE ?");
    expect(sql).toContain("name_en LIKE ?");
    expect(sql).toContain("description LIKE ?");
    expect(params).toEqual(["%lighting%", "%lighting%", "%lighting%", 200]);
  });

  it("searchNodesByKeyword：用户输入的通配符先转义，% 不会被当成「匹配全部」", async () => {
    await repo.searchNodesByKeyword("%");
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe("%\\%%");
  });

  it("searchNodesByKeyword：按码长升序取祖先优先，limit 越界值先夹到安全区间", async () => {
    await repo.searchNodesByKeyword("制造", 999999);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("ORDER BY CHAR_LENGTH(code)");
    expect(params[3]).toBe(500);

    await repo.searchNodesByKeyword("制造", 0);
    expect(mockQuery.mock.calls[1][1][3]).toBe(200);
  });
});
