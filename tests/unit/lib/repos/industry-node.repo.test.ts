/**
 * 行业面读层 SQL 契约测试
 * @module tests/unit/lib/repos/industry-node.repo.test.ts
 * @description 门户行业标签与筛选下拉都走这一层。钉三件事：
 *              1. 空入参不发 SQL（目录页首屏常有整页无码的行，别让它们打出 IN ()）；
 *              2. facet 的层级参数走白名单，越界值直接返回空集而不是拼进 SQL；
 *              3. facet 计数必须与目录同口径（verify_status='done' 且排除测试行），
 *                 否则下拉写着 12 家、点进去是 0 家；
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

  it("listFacets：层级白名单外的值不发 SQL（level 永不进字符串拼接）", async () => {
    await repo.listFacets("subclass' --" as never);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("listFacets：可见口径与目录一致，计数与层级都走占位符", async () => {
    await repo.listFacets("division");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("s.verify_status = 'done'");
    expect(sql).toContain("s.company <> '测试'");
    expect(sql).toContain("WITH RECURSIVE");
    expect(params).toEqual(["division", "division"]);
    expect(sql).not.toContain("division' --");
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
