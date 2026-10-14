/**
 * 骨架索引缓存（宽表写入侧）单测（旧品类码 全面退役 R4'）
 *
 * 钉住的分歧：
 * 1. 换算结果含**全部祖先**且链顶是大类码 —— 筛选走 FIND_IN_SET/数组等值，缺一级就筛不到；
 * 2. 无码 / 全换不出 / 索引不可用 三种情况一律 **null**，绝不写空串（门禁 BB7 把空串判违规）；
 * 3. TTL 内不重复载入整树（实测载入十几秒），刷新失败时沿用旧索引而不是退回空；
 * 4. 超列宽直接抛错 —— 截断等于把公告的归属改掉，本项目对"宁可停线也不静默"有明确纪律。
 *
 * R4' 变更：数字码入口（byPrefix / famToDeepest / segToL1）已剥 ⇒ 换算只走 UGT 直认一条分支。
 * 老单测里那些「族级/段级/类级 粗码 → 不同层落点」的四档换算用例都随入口消失。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  backbonePathOfCodes,
  getBackboneIndex,
  hasBackboneIndex,
  resetBackboneCache,
} from "@/lib/services/commodity/backbone-cache";
import { BACKBONE_PATH_LIMIT } from "@/lib/services/commodity/backbone-path";

/**
 * 一棵够小的启用中树：R4' 后 `loadBackboneIndex` 的 SELECT 只取 code/parent_code/level 三列，
 * 不再读 旧前缀映射列 / group_code。fake 行集按新列形制给。
 */
const TREE = [
  { code: "UGT-01", parent_code: "", level: 1 },
  { code: "UGT-0101", parent_code: "UGT-01", level: 2 },
  { code: "UGT-010101", parent_code: "UGT-0101", level: 3 },
  { code: "UGT-010102", parent_code: "UGT-0101", level: 3 },
  { code: "UGT-01010101", parent_code: "UGT-010101", level: 4 },
  { code: "UGT-01010201", parent_code: "UGT-010102", level: 4 },
  { code: "UGT-0101010101", parent_code: "UGT-01010101", level: 5 },
];

/** 按 SQL 特征分派：只认整树一条查询（R4' 后列域缩到 code/parent_code/level）；failTree 用于模拟载入失败 */
function fakePool(opts: { tree?: typeof TREE; failTree?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    if (/FROM crm_commodity_backbone WHERE status = 1/.test(s)) {
      if (opts.failTree) throw new Error("db down");
      return [opts.tree ?? TREE];
    }
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

const CHAIN = "UGT-01,UGT-0101,UGT-010101,UGT-01010101,UGT-0101010101";

beforeEach(() => {
  resetBackboneCache();
  vi.restoreAllMocks();
});

describe("backbonePathOfCodes 换算形状（UGT 直认）", () => {
  it("L5 节点 → 自身加全部祖先，链顶是大类", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["UGT-0101010101"])).toBe(CHAIN);
  });

  it("L4/L3/L2/L1 各层直认，祖先全存", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["UGT-01010101"])).toBe(
      "UGT-01,UGT-0101,UGT-010101,UGT-01010101",
    );
    expect(await backbonePathOfCodes(pool, ["UGT-01"])).toBe("UGT-01");
  });

  it("树上不存在的 UGT 键 → 一律 miss，不上浮不猜最近节点", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["UGT-99"])).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("多码合并去重，且与入参顺序无关", async () => {
    const { pool } = fakePool();
    const a = await backbonePathOfCodes(pool, ["UGT-0101010101", "UGT-01010101", "UGT-01"]);
    const b = await backbonePathOfCodes(pool, ["UGT-01", "UGT-01010101", "UGT-0101010101"]);
    expect(a).toBe(CHAIN);
    expect(b).toBe(CHAIN);
  });

  it("取树 SQL 只碰新树，不回读旧树，也不再碰退役的大类维表族", async () => {
    const { pool, query } = fakePool();
    await backbonePathOfCodes(pool, ["UGT-0101010101"]);
    for (const call of query.mock.calls) {
      expect(String(call[0])).not.toContain("crm_commodity_nodes");
      expect(String(call[0])).not.toContain("crm_commodity_group");
      expect(String(call[0])).not.toContain("unspsc_prefix");
    }
  });
});

describe("backbonePathOfCodes 的空值边界", () => {
  it("公告没有码 → null 且不查库（无码必空的口径由写入侧保证）", async () => {
    const { pool, query } = fakePool();
    expect(await backbonePathOfCodes(pool, [])).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("码全换不出 → null（不写空串），并点名告警不静默", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool();
    // R4' 后数字码入口已剥：这些一律 miss
    expect(await backbonePathOfCodes(pool, ["10101504", "abc"])).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("部分换得出：写已算出的部分，同时告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["UGT-0101010101", "UGT-99"])).toBe(CHAIN);
    expect(warn).toHaveBeenCalled();
  });

  it("索引从未载入成功 → null（行照写，缺位由门禁 BB7 报错）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool({ failTree: true });
    expect(await backbonePathOfCodes(pool, ["UGT-0101010101"])).toBeNull();
    expect(hasBackboneIndex()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("缓存与陈旧策略", () => {
  it("TTL 内第二次调用不再载入整树（载入实测十几秒）", async () => {
    const { pool, query } = fakePool();
    await backbonePathOfCodes(pool, ["UGT-0101010101"]);
    const before = query.mock.calls.length;
    await backbonePathOfCodes(pool, ["UGT-01010101"]);
    expect(query.mock.calls.length).toBe(before);
  });

  it("resetBackboneCache 之后会重新载入", async () => {
    const { pool, query } = fakePool();
    await getBackboneIndex(pool);
    const once = query.mock.calls.length;
    resetBackboneCache();
    await getBackboneIndex(pool);
    expect(query.mock.calls.length).toBe(once + 1); // 整树一条查询
  });

  it("刷新失败时沿用旧索引（陈旧但仍正确），不返回 null", async () => {
    // 要先把时间拨过 TTL：没过期就不会刷新，“刷新失败”这条分支根本跑不到
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ok = fakePool();
      await getBackboneIndex(ok.pool);
      vi.setSystemTime(Date.now() + 61 * 60 * 1000);
      const failing = fakePool({ failTree: true });
      expect(await backbonePathOfCodes(failing.pool, ["UGT-0101010101"])).toBe(CHAIN);
      expect(hasBackboneIndex()).toBe(true);
      expect(warn).toHaveBeenCalled();
      // 刷新失败后重新给了窗口：不会每轮同步都重试一次十几秒的全树查询（只试了一次取树）
      await backbonePathOfCodes(failing.pool, ["UGT-01010101"]);
      expect(failing.query.mock.calls.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("超列宽绝不截断", () => {
  it("列值超上限直接抛错，而不是写半截归属", async () => {
    // 每行 15 字符（`UGT-` 4 + 数字 10 + 逗号 1）：略超上限即确证走的是"拒写"而不是"截断"
    const need = Math.ceil(BACKBONE_PATH_LIMIT / 15) + 10;
    const rows = [...TREE];
    const codes: string[] = [];
    for (let i = 0; i < need; i += 1) {
      rows.push({
        code: `UGT-0101${String(i).padStart(6, "0")}`,
        parent_code: "UGT-01010101",
        level: 5,
      });
      codes.push(`UGT-0101${String(i).padStart(6, "0")}`);
    }
    const { pool } = fakePool({ tree: rows });
    await expect(backbonePathOfCodes(pool, codes)).rejects.toThrow(/超长/);
  }, 30_000);

  it("刚好不超上限时正常返回（上限不是偏保守的错）", async () => {
    const under = Math.floor(BACKBONE_PATH_LIMIT / 17) - 200;
    const rows = [...TREE];
    const codes: string[] = [];
    for (let i = 0; i < under; i += 1) {
      rows.push({
        code: `UGT-0201${String(i).padStart(6, "0")}`,
        parent_code: "UGT-01010101",
        level: 5,
      });
      codes.push(`UGT-0201${String(i).padStart(6, "0")}`);
    }
    const { pool } = fakePool({ tree: rows });
    const out = await backbonePathOfCodes(pool, codes);
    expect(out).not.toBeNull();
    expect(String(out).length).toBeLessThanOrEqual(BACKBONE_PATH_LIMIT);
  }, 30_000);
});
