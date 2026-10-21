/**
 * 主表同步「列所有权 / 行免疫」语义 —— 两个写入者必须逐字同口径
 *
 * 为什么这道测试存在（全部实测坐实，见 runtime/api-dq-134/142/143 探针留档）：
 *   · 平台行（entry_source='platform'）撞号被爬虫行就地改写：本仓两套同步原先零护栏
 *     （护栏只在后台 syncRunner 里），云端 AUTO_INCREMENT 恰等于源库 MAX(id)+1，敞口是结构性的；
 *   · is_featured 实测云端=1 / 源库=0 且两侧 update_time 相等 ⇒ 精选是云端拥有的运营动作，
 *     源库直通覆盖会把精选抹掉；
 *   · 商机表审核四列方向相反（源库较新、要往云端流）⇒ **不得**登记为云端拥有列，
 *     本测试反向钉死这一点，防止后人「顺手保护」把审核结果堵死。
 *
 * 红线：daily-sync-sql.cjs（手动兜底）与 crawler-sync-sql.ts（应用内正式写入者）产出的
 * ODKU 子句必须逐字相等 —— 「看着一样其实不一样」是本仓已多次踩到的最坏漂移。
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  buildOdkuClause, NON_DESTRUCTIVE_COLUMNS, MONOTONE_RISE_COLUMNS, TARGET_WINS_COLUMNS, PLATFORM_IMMUNE,
} from "@/lib/services/search-sync/crawler-sync-sql";

const require = createRequire(import.meta.url);
const ds = require("../../../../../scripts/tools/daily-sync-sql.cjs") as {
  buildOdkuUpdateClause: (
    updateCols: string[], colTypes: Record<string, string>, keepCols: Set<string>, pkCol: string,
    opts?: { monotoneCols?: Set<string>; targetWins?: Set<string> },
  ) => string;
  NON_DESTRUCTIVE_COLUMNS: Record<string, string[]>;
  MONOTONE_RISE_COLUMNS: Record<string, string[]>;
  TARGET_WINS_COLUMNS: Record<string, string[]>;
  PLATFORM_IMMUNE: { table: string; column: string; value: string };
};

const colTypes: Record<string, string> = {
  id: "int", title: "varchar", documents: "json", is_featured: "tinyint", entry_source: "varchar",
};

describe("单调上升列（云端拥有的运营标记）", () => {
  it("is_featured：GREATEST 合并，任一侧为 1 即为 1，NULL 安全", () => {
    const clause = buildOdkuClause(["id", "is_featured"], ["id"], colTypes, new Set(), "id", {
      monotoneCols: new Set(["is_featured"]),
    });
    expect(clause).toBe("`is_featured` = GREATEST(IFNULL(`is_featured`, 0), IFNULL(VALUES(`is_featured`), 0))");
  });

  it("未登记的列仍是源库直通覆盖（不得悄悄扩大保护面）", () => {
    expect(buildOdkuClause(["id", "title"], ["id"], colTypes, new Set(), "id", {})).toBe("`title` = VALUES(`title`)");
  });

  it("keepCols 与 monotone 同时命中时，monotone 优先（合并语义强于「源空保留」）", () => {
    const clause = buildOdkuClause(["id", "is_featured"], ["id"], colTypes, new Set(["is_featured"]), "id", {
      monotoneCols: new Set(["is_featured"]),
    });
    expect(clause).toContain("GREATEST(");
  });
});

describe("两个写入者的 ODKU 口径一致性", () => {
  const updateCols = ["title", "documents", "is_featured", "entry_source"];
  const keep = new Set(["documents"]);
  const mono = new Set(["is_featured"]);

  it("同输入 ⇒ 子句逐字相等（crawler-sync-sql.ts vs daily-sync-sql.cjs）", () => {
    const tsClause = buildOdkuClause(["id", ...updateCols], ["id"], colTypes, keep, "id", { monotoneCols: mono });
    const cjsClause = ds.buildOdkuUpdateClause(updateCols, colTypes, keep, "id", { monotoneCols: mono });
    expect(tsClause).toBe(cjsClause);
  });

  it("配置表也须一致（保护名单不能一半人改）", () => {
    expect(ds.NON_DESTRUCTIVE_COLUMNS).toEqual(NON_DESTRUCTIVE_COLUMNS);
    expect(ds.MONOTONE_RISE_COLUMNS).toEqual(MONOTONE_RISE_COLUMNS);
    expect(ds.PLATFORM_IMMUNE).toEqual(PLATFORM_IMMUNE);
  });

  it("目标优先档是**有意的不对称**，必须被显式断言而不是默默漂移", () => {
    // 应用内路径写入前已用 normalizeTitle 清洗 ⇒ 不登记；
    // daily-sync 没有那一步 ⇒ 只能靠目标优先防回退。两边不能同开、也不能同关。
    expect(TARGET_WINS_COLUMNS).toEqual({});
    expect(ds.TARGET_WINS_COLUMNS).toEqual({ crm_bid_notices: ["title"] });
  });

  it("目标优先式：目标非空就不动，空了才接源值", () => {
    expect(ds.buildOdkuUpdateClause(["title"], colTypes, new Set(), "id", {
      targetWins: new Set(["title"]),
    })).toBe("`title` = IF(`title` IS NULL OR `title` = '', VALUES(`title`), `title`)");
  });

  it("登记内容钉死：公告表保护附件三列 + is_featured 单调上升；商机表零保护列", () => {
    expect(NON_DESTRUCTIVE_COLUMNS.crm_bid_notices).toEqual(["documents", "procurement_files", "external_links"]);
    expect(MONOTONE_RISE_COLUMNS.crm_bid_notices).toEqual(["is_featured"]);
    // 反向断言：商机审核域是「源库→云端」的正向流入，任何人把它登记成保护列都必须红
    expect(NON_DESTRUCTIVE_COLUMNS.crm_bid_opportunities).toBeUndefined();
    expect(MONOTONE_RISE_COLUMNS.crm_bid_opportunities).toBeUndefined();
  });
});

describe("平台行整行免疫", () => {
  it("钉死挂点：公告表有 entry_source，商机表没有（护栏只能挂在公告表）", () => {
    expect(PLATFORM_IMMUNE).toEqual({ table: "crm_bid_notices", column: "entry_source", value: "platform" });
  });

  it("源码里必须真的把免疫集合用上（防止只改常量不改调用点的半截改动）", () => {
    const ts = readFileSync("src/lib/services/search-sync/crawler-sync.ts", "utf8");
    const cjs = readFileSync("scripts/tools/daily-sync.cjs", "utf8");
    expect(ts).toMatch(/loadPlatformImmuneIds|platformImmune/);
    expect(cjs).toMatch(/loadPlatformImmuneIds|platformImmune/);
  });

  it("应用内路径必须真的接入 title 清洗（否则不对称就不成立）", () => {
    const ts = readFileSync("src/lib/services/search-sync/crawler-sync.ts", "utf8");
    expect(ts).toMatch(/normalizeTitle/);
  });
});
