/**
 * 骨架索引缓存（宽表写入侧）单测
 *
 * 钉住的四件事，都是会"静默改掉搜索结果"的分支：
 * 1. 换算结果含**全部祖先**且链顶是大类码 —— 筛选走 FIND_IN_SET/数组等值，缺一级就筛不到；
 * 2. 无码 / 全换不出 / 索引不可用 三种情况一律 **null**，绝不写空串（门禁 BB7 把空串判违规）；
 * 3. TTL 内不重复载入整树（实测载入十几秒），刷新失败时沿用旧索引而不是退回空；
 * 4. 超列宽直接抛错 —— 截断等于把公告的归属改掉，本项目对"宁可停线也不静默"有明确纪律。
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
 * 故意构了三个形状不同的族，因为换算器对族级粗码的规则是「最深可证实唯一」：
 *   单成员族→落 L4；多成员但同一个小类→落 L3；多成员跨小类但同中类→落 L2。
 * 只造一个族就测不出这三档差别，而这三档直接决定「用户选到哪一层能看到这条公告」。
 */
const TREE = [
  { code: "UGT-B-01", parent_code: "", level: 1, unspsc_prefix: null },
  { code: "UGT-B-0101", parent_code: "UGT-B-01", level: 2, unspsc_prefix: null },
  { code: "UGT-B-010101", parent_code: "UGT-B-0101", level: 3, unspsc_prefix: null },
  { code: "UGT-B-010102", parent_code: "UGT-B-0101", level: 3, unspsc_prefix: null },
  { code: "UGT-B-010103", parent_code: "UGT-B-0101", level: 3, unspsc_prefix: null },
  // 族 1010：只有一个子类行 → 族 ≡ 该子类，落 L4
  { code: "UGT-B-01010101", parent_code: "UGT-B-010101", level: 4, unspsc_prefix: "101015" },
  // 族 1011：两个子类行跨两个小类（同中类）→ 只能落到 L2
  { code: "UGT-B-01010201", parent_code: "UGT-B-010102", level: 4, unspsc_prefix: "101115" },
  { code: "UGT-B-01010301", parent_code: "UGT-B-010103", level: 4, unspsc_prefix: "101116" },
  // 族 1012：两个子类行同属一个小类 → 落到 L3
  { code: "UGT-B-01010202", parent_code: "UGT-B-010102", level: 4, unspsc_prefix: "101215" },
  { code: "UGT-B-01010203", parent_code: "UGT-B-010102", level: 4, unspsc_prefix: "101216" },
  { code: "UGT-B-0101010101", parent_code: "UGT-B-01010101", level: 5, unspsc_prefix: "10101504" },
];

/** 按 SQL 特征分派：树、大类段归属，其余空集；failTree 用于模拟载入失败 */
function fakePool(opts: { tree?: typeof TREE; failTree?: boolean; failSegments?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    if (/FROM crm_commodity_backbone WHERE status = 1/.test(s)) {
      if (opts.failTree) throw new Error("db down");
      return [opts.tree ?? TREE];
    }
    if (/crm_commodity_group_segments/.test(s)) {
      if (opts.failSegments) throw new Error("db down");
      return [[{ seg: "10", node_code: "UGT-B-01" }]];
    }
    return [[]];
  });
  return { pool: { query } as unknown as Pool, query };
}

const CHAIN = "UGT-B-01,UGT-B-0101,UGT-B-010101,UGT-B-01010101,UGT-B-0101010101";

beforeEach(() => {
  resetBackboneCache();
  vi.restoreAllMocks();
});

describe("backbonePathOfCodes 换算形状", () => {
  it("8 位品目码 → 自身加全部祖先，链顶是大类", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10101504"])).toBe(CHAIN);
  });

  it("类级粗码（后两位置 0）→ 落到子类节点", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10101500"])).toBe(
      "UGT-B-01,UGT-B-0101,UGT-B-010101,UGT-B-01010101",
    );
  });

  it("族级粗码（单成员族）→ 落子类：族 ≡ 那个子类是树的结构事实", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10100000"])).toBe(
      "UGT-B-01,UGT-B-0101,UGT-B-010101,UGT-B-01010101",
    );
  });

  it("族级粗码（多成员同小类）→ 只落到小类，不假装知道子类", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10120000"])).toBe("UGT-B-01,UGT-B-0101,UGT-B-010102");
  });

  it("族级粗码（多成员跨小类）→ 只能落到中类", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10110000"])).toBe("UGT-B-01,UGT-B-0101");
  });

  it("8 位全有效但树里没这个品目 → 不上浮到子类（不上浮就是不给公告乱挂宽节点）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10101599"])).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("段级粗码 → 大类行（归属源是 group_segments，不是旧树）", async () => {
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10000000"])).toBe("UGT-B-01");
  });

  it("多码合并去重，且与入参顺序无关", async () => {
    const { pool } = fakePool();
    const a = await backbonePathOfCodes(pool, ["10101504", "10101500", "10000000"]);
    const b = await backbonePathOfCodes(pool, ["10000000", "10101500", "10101504"]);
    expect(a).toBe(CHAIN);
    expect(b).toBe(CHAIN);
  });

  it("取树 SQL 只碰新树与大类段表，不回读旧树", async () => {
    const { pool, query } = fakePool();
    await backbonePathOfCodes(pool, ["10101504"]);
    for (const call of query.mock.calls) {
      expect(String(call[0])).not.toContain("crm_commodity_nodes");
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
    expect(await backbonePathOfCodes(pool, ["99000000", "abc"])).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("部分换得出：写已算出的部分，同时告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool();
    expect(await backbonePathOfCodes(pool, ["10101504", "99000000"])).toBe(CHAIN);
    expect(warn).toHaveBeenCalled();
  });

  it("索引从未载入成功 → null（行照写，缺位由门禁 BB7 报错）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool({ failTree: true });
    expect(await backbonePathOfCodes(pool, ["10101504"])).toBeNull();
    expect(hasBackboneIndex()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("缓存与陈旧策略", () => {
  it("TTL 内第二次调用不再载入整树（载入实测十几秒）", async () => {
    const { pool, query } = fakePool();
    await backbonePathOfCodes(pool, ["10101504"]);
    const before = query.mock.calls.length;
    await backbonePathOfCodes(pool, ["10101500"]);
    expect(query.mock.calls.length).toBe(before);
  });

  it("resetBackboneCache 之后会重新载入", async () => {
    const { pool, query } = fakePool();
    await getBackboneIndex(pool);
    const once = query.mock.calls.length;
    resetBackboneCache();
    await getBackboneIndex(pool);
    expect(query.mock.calls.length).toBe(once + 2);
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
      expect(await backbonePathOfCodes(failing.pool, ["10101504"])).toBe(CHAIN);
      expect(hasBackboneIndex()).toBe(true);
      expect(warn).toHaveBeenCalled();
      // 刷新失败后重新给了窗口：不会每轮同步都重试一次十几秒的全树查询（只试了一次取树）
      await backbonePathOfCodes(failing.pool, ["10101500"]);
      expect(failing.query.mock.calls.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("段归属表查询失败同样不算载入成功：本轮无索引 ⇒ null（不假装算得出）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = fakePool({ failSegments: true });
    expect(await backbonePathOfCodes(pool, ["10101504"])).toBeNull();
    expect(hasBackboneIndex()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("超列宽绝不截断", () => {
  it("列值超上限直接抛错，而不是写半截归属", async () => {
    // 每个品目行 16 字符 + 1 个逗号 = 17；略超上限即确证走的是“拒写”而不是“截断”
    const need = Math.ceil(BACKBONE_PATH_LIMIT / 17) + 10;
    const rows = [...TREE];
    const codes: string[] = [];
    for (let i = 0; i < need; i += 1) {
      rows.push({
        code: `UGT-B-0101${String(i).padStart(6, "0")}`,
        parent_code: "UGT-B-01010101",
        level: 5,
        unspsc_prefix: String(20_000_000 + i),
      });
      codes.push(String(20_000_000 + i));
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
        code: `UGT-B-0201${String(i).padStart(6, "0")}`,
        parent_code: "UGT-B-01010101",
        level: 5,
        unspsc_prefix: String(21_000_000 + i),
      });
      codes.push(String(21_000_000 + i));
    }
    const { pool } = fakePool({ tree: rows });
    const out = await backbonePathOfCodes(pool, codes);
    expect(out).not.toBeNull();
    expect(String(out).length).toBeLessThanOrEqual(BACKBONE_PATH_LIMIT);
  }, 30_000);
});
