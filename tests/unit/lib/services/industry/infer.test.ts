/**
 * 行业推断单测：打分、候选截断、路径补齐、LIKE 通配符转义
 * @module tests/unit/lib/services/industry/infer
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { inferIndustryNodes, loadIndustryTag, scoreIndustryName } from "@/lib/services/industry/infer";

function fakePool(handlers: Array<[string, (sql: string, params?: unknown[]) => unknown]>) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push([sql, params]);
    for (const [fragment, fn] of handlers) if (sql.includes(fragment)) return fn(sql, params);
    return [[]];
  });
  return { pool: { query } as unknown as Pool, calls };
}

describe("scoreIndustryName", () => {
  it("完全相等最高，前缀次之，包含最低", () => {
    expect(scoreIndustryName("光伏设备", "", "光伏设备")).toBe(1);
    expect(scoreIndustryName("光伏设备制造", "", "光伏设备")).toBe(0.9);
    expect(scoreIndustryName("太阳能光伏设备制造", "", "光伏设备")).toBe(0.75);
    expect(scoreIndustryName("无关行业", "", "光伏")).toBe(0);
  });

  it("英文不区分大小写", () => {
    expect(scoreIndustryName("", "Solar Power", "solar")).toBe(0.9);
  });
});

describe("inferIndustryNodes", () => {
  it("按分数与层级排序，并补齐路径；门类不入候选", async () => {
    const rows = [
      { code: "UGT-I-03", name_zh: "制造业", name_en: "Manufacturing", level: "section" },
      { code: "UGT-I-0301", name_zh: "光伏设备制造", name_en: "Solar equipment", level: "division" },
      { code: "UGT-I-030101", name_zh: "光伏设备", name_en: "Solar equipment", level: "group" },
    ];
    const { pool } = fakePool([
      ["FROM industry_nodes", (sql) => (sql.includes("name_zh LIKE") ? [rows] : [
        [
          { code: "UGT-I-03", name_zh: "制造业", name_en: "Manufacturing" },
          { code: "UGT-I-0301", name_zh: "光伏设备制造", name_en: "Solar equipment" },
          { code: "UGT-I-030101", name_zh: "光伏设备", name_en: "Solar equipment" },
        ],
      ])],
    ]);

    const list = await inferIndustryNodes(pool, "光伏");
    // 同为前缀命中（0.9）时，更深的层级优先（group > division）
    expect(list.length).toBe(2);
    expect(list[0].code).toBe("UGT-I-030101");
    expect(list[1].code).toBe("UGT-I-0301");
    expect(list[0].path).toEqual(["制造业", "光伏设备制造", "光伏设备"]);
  });

  it("用户输入的 % 被转义为字面量，不会退化成匹配全部", async () => {
    const { pool, calls } = fakePool([["FROM industry_nodes", () => [[]]]]);
    await inferIndustryNodes(pool, "50%");
    const params = calls[0][1] as string[];
    expect(params[0]).toBe("%50\\%%");
  });

  it("空关键词直接返回空，不查库", async () => {
    const { pool, calls } = fakePool([]);
    expect(await inferIndustryNodes(pool, "  ")).toEqual([]);
    expect(calls.length).toBe(0);
  });
});

describe("loadIndustryTag", () => {
  it("非法码不查库直接 null", async () => {
    const { pool, calls } = fakePool([]);
    expect(await loadIndustryTag(pool, "UGT-032605")).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("返回名称与祖先路径", async () => {
    const { pool } = fakePool([
      ["FROM industry_nodes", () => [
        [
          { code: "UGT-I-03", name_zh: "制造业", name_en: "Manufacturing", level: "section" },
          { code: "UGT-I-0301", name_zh: "光伏设备制造", name_en: "Solar", level: "division" },
        ],
      ]],
    ]);
    const tag = await loadIndustryTag(pool, "UGT-I-0301");
    expect(tag).toMatchObject({ code: "UGT-I-0301", nameZh: "光伏设备制造", level: "division" });
    expect(tag?.path).toEqual(["制造业", "光伏设备制造"]);
  });
});