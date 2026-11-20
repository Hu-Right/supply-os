/**
 * EcoPartnerRepo 公开列表单测（假池，不连真库）
 *
 * 钉住四类不变式：
 * 1. 内部联系人永不出网：SELECT 列清单物理上不含 contact_internal（红线的第一道闸在 SQL 层，
 *    不靠路由层「记得不吐」）；
 * 2. suspended 不出网：过滤在 WHERE 而不是内存（防止未来有人把过滤挪到视图层时漏掉）；
 * 3. 锚定位排序契约：featured DESC → sort_weight DESC → id ASC（featured 是通用位，不写死任何一家）；
 * 4. 行映射：snake 列 → camelCase、featured 1→true、NULL 直传（detail/regions_en 允许空）。
 */
import { describe, it, expect } from "vitest";
import { EcoPartnerRepo, type PoolLike } from "@/lib/repos/eco-partner.repo";

const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim();

function makePool(rows: unknown[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: norm(sql), params });
      return [rows, []];
    },
    execute: async () => [{ affectedRows: 0 }, []],
  };
  return { pool: pool as unknown as PoolLike, calls };
}

/** 一行完整的 live 伙伴（列名与真实表对齐） */
const liveRow = {
  id: 1,
  slug: "huace",
  name: "华测",
  name_en: "CTI",
  category: "compliance",
  scope: "检测认证与资质合规",
  scope_en: "Testing, certification and compliance",
  detail: "服务详情段落",
  regions: "中国",
  regions_en: "China",
  logo_url: null,
  featured: 1,
  status: "live",
  sort_weight: 10,
  listed_at: new Date("2026-11-20T00:00:00Z"),
};

describe("EcoPartnerRepo.listPublic", () => {
  it("SELECT 物理上不含 contact_internal——内部联系人永不出网", async () => {
    const { pool, calls } = makePool([liveRow]);
    await new EcoPartnerRepo(pool).listPublic();

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("FROM eco_partner");
    expect(calls[0].sql).not.toContain("contact_internal");
  });

  it("suspended 在 WHERE 层过滤，允许出网的只有三态", async () => {
    const { pool, calls } = makePool([]);
    await new EcoPartnerRepo(pool).listPublic();

    expect(calls[0].sql).toMatch(/status IN \('in-talks', 'onboarding', 'live'\)/);
  });

  it("排序契约：featured 优先 → sort_weight 降序 → id 升序（锚定位是通用位）", async () => {
    const { pool, calls } = makePool([]);
    await new EcoPartnerRepo(pool).listPublic();

    expect(calls[0].sql).toMatch(/ORDER BY featured DESC, sort_weight DESC, id ASC/);
  });

  it("行映射：snake 列 → camelCase，featured 1→true，status 透传", async () => {
    const { pool } = makePool([liveRow]);
    const rows = await new EcoPartnerRepo(pool).listPublic();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "huace",
      name: "华测",
      nameEn: "CTI",
      scope: "检测认证与资质合规",
      scopeEn: "Testing, certification and compliance",
      regions: "中国",
      regionsEn: "China",
      featured: true,
      status: "live",
      sortWeight: 10,
    });
    expect(rows[0].listedAt).toBeInstanceOf(Date);
  });

  it("NULL 直传：detail / regions_en / logoUrl 允许为空（宁缺毋假，前端自行回退）", async () => {
    const { pool } = makePool([{ ...liveRow, detail: null, regions_en: null, logo_url: null, name_en: null, scope_en: null, featured: 0, status: "onboarding" }]);
    const rows = await new EcoPartnerRepo(pool).listPublic();

    expect(rows[0].detail).toBeNull();
    expect(rows[0].regionsEn).toBeNull();
    expect(rows[0].logoUrl).toBeNull();
    expect(rows[0].featured).toBe(false);
    expect(rows[0].status).toBe("onboarding");
  });
});
