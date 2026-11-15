/**
 * 匹配引擎单测（纯函数 + 兜底分支）
 *
 * 只覆盖可离线验证的部分：品类码解析、分数归一化、命中理由生成、
 * 以及"主品类缺失 → 明细兜底 → 仍缺失则 0 候选"这条短路。
 * 真实 SQL 打分由 Task 4 的端到端 dry-run 覆盖。
 */
import { describe, it, expect, vi } from "vitest";
import {
  demandCategoryPath,
  normalizeScore,
  buildReasons,
  generateMatchCandidates,
  type RawScore,
} from "@/lib/services/procurement/matching";

const FULL: RawScore = {
  catScore: 40,
  coopScore: 10,
  qualityScore: 10,
  accountScore: 15,
  relScore: 8,
};

describe("demandCategoryPath — UGT 码取三段前缀", () => {
  it("6 位码给出 L1/L2/L3", () => {
    expect(demandCategoryPath("UGT-030201")).toEqual({ l1: "03", l2: "0302", l3: "030201" });
  });

  it("4 位码只有 L1/L2，L3 为 null（避免与 L2 同档重复计分）", () => {
    expect(demandCategoryPath("UGT-0301")).toEqual({ l1: "03", l2: "0301", l3: null });
  });

  it("空值、非 UGT 前缀、非数字一律 null", () => {
    expect(demandCategoryPath(null)).toBeNull();
    expect(demandCategoryPath("")).toBeNull();
    expect(demandCategoryPath("ABC-0301")).toBeNull();
    expect(demandCategoryPath("UGT-abcd")).toBeNull();
  });
});

describe("normalizeScore — 按可得信号归一", () => {
  it("全信号满分 → 100", () => {
    // 实际可得信号满分：品类 40 + 合作 10 + 质量 10 + 账号 15 + 行业标签 8 = 83
    // （原「省份 15」随迁移 026 删除 delivery_province 死列一并移除）
    expect(normalizeScore(FULL, 83)).toBe(100);
  });

  it("只有品类 L1 命中（无账号/无附加信号）→ 按 83 分母折算", () => {
    expect(
      normalizeScore(
        { catScore: 20, coopScore: 0, qualityScore: 0, accountScore: 0, relScore: 0 },
        83,
      ),
    ).toBe(24);
  });

  it("分母为 0 时不产生 NaN/Infinity", () => {
    expect(normalizeScore(FULL, 0)).toBe(0);
  });

  it("结果被夹在 0..100（脏数据不越界）", () => {
    expect(normalizeScore({ ...FULL, catScore: 400 }, 83)).toBe(100);
  });
});

describe("buildReasons — 可解释的命中理由", () => {
  it("L3 命中 + 行业标签 + 合作中 + 已注册 + 资料分", () => {
    const r = buildReasons(FULL, { hasAccount: true, quality: 88 });
    expect(r).toContain("品类L3");
    expect(r).toContain("行业标签");
    expect(r).toContain("合作中");
    expect(r).toContain("已注册");
    expect(r).toContain("资料分88");
  });

  it("只有 L1 命中且无附加信号时，理由只有品类", () => {
    const r = buildReasons(
      { catScore: 20, coopScore: 0, qualityScore: 0, accountScore: 0, relScore: 0 },
      { hasAccount: false, quality: 0 },
    );
    expect(r).toBe("品类L1");
  });
});

describe("generateMatchCandidates — 品类码兜底链", () => {
  function fakeDb(projectRow: unknown, itemRow: unknown, candidateRows: unknown[] = []) {
    const queries: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push(String(sql));
        if (String(sql).includes("FROM procurement_projects")) return [[projectRow], []];
        if (String(sql).includes("FROM procurement_items")) return [itemRow ? [itemRow] : [], []];
        if (String(sql).includes("INSERT INTO procurement_matches")) {
          return [{ affectedRows: candidateRows.length }, []];
        }
        if (String(sql).includes("FROM supplier")) return [candidateRows, []];
        return [[], []];
      }),
    };
    return { db: db as never, queries };
  }

  it("主品类为空时从第一条明细的 ugt_code 兜底", async () => {
    const { db, queries } = fakeDb(
      { primary_ugt_code: null },
      { ugt_code: "UGT-010101" },
      [
        {
          supplier_id: 1,
          email: "a@b.com",
          province: "广东",
          company: "A",
          cat_score: 40,
          coop_score: 0,
          quality_score: 5,
          account_score: 0,
          rel_score: 0,
        },
      ],
    );
    const n = await generateMatchCandidates(db, 41);
    expect(queries.some((q) => q.includes("FROM procurement_items"))).toBe(true);
    expect(queries.some((q) => q.includes("INSERT INTO procurement_matches"))).toBe(true);
    expect(n).toBe(1);
  });

  it("主品类与明细都为空 → 0 候选，且不写候选表", async () => {
    const { db, queries } = fakeDb({ primary_ugt_code: null }, null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const n = await generateMatchCandidates(db, 50);
    expect(n).toBe(0);
    expect(queries.some((q) => q.includes("INSERT INTO procurement_matches"))).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
