/**
 * 爬虫同步纯 SQL 构件（决定主表增量同步的正确性与「数据全面」）
 *
 * 这些纯函数静默决定：跨库写入的值转义、非破坏列的合并语义、增量拉取的 WHERE、
 * 水位线推进。任一分支错误都会导致漏同步 / 覆盖人工数据 / 全表扫描。
 */
import { describe, it, expect } from "vitest";
import {
  escapeVal, buildOdkuClause, buildIncrementalWhere, buildWatermark,
  NON_DESTRUCTIVE_COLUMNS,
} from "@/lib/services/search-sync/crawler-sync-sql";

describe("escapeVal", () => {
  it("null/undefined → NULL；number 直出", () => {
    expect(escapeVal(null, "varchar")).toBe("NULL");
    expect(escapeVal(undefined, "varchar")).toBe("NULL");
    expect(escapeVal(0, "int")).toBe("0");
    expect(escapeVal(12.5, "decimal")).toBe("12.5");
  });

  it("字符串转义反斜杠与单引号", () => {
    expect(escapeVal("O'Brien", "varchar")).toBe("'O\\'Brien'");
    expect(escapeVal("a\\b", "varchar")).toBe("'a\\\\b'");
  });

  it("JSON 列：合法原样、非法落 NULL", () => {
    expect(escapeVal('{"a":1}', "json")).toBe("'{\"a\":1}'");
    expect(escapeVal("not-json", "json")).toBe("NULL");
  });

  it("JSON 列：mysql2 二进制协议返回 object 时须 JSON.stringify 而非 String(object)", () => {
    // mysql2 execute() 自动解析 JSON → JS object，旧代码 String(object) = "[object Object]" 导致写 NULL
    expect(escapeVal({ a: 1 }, "json")).toBe("'{\"a\":1}'");
    expect(escapeVal([1, 2, 3], "json")).toBe("'[1,2,3]'");
    expect(escapeVal({ nested: { x: "y" } }, "json")).toBe("'{\"nested\":{\"x\":\"y\"}}'");
  });

  it("Buffer → 十六进制字面量", () => {
    expect(escapeVal(Buffer.from([0xde, 0xad]), "blob")).toBe("X'dead'");
  });
});

describe("buildOdkuClause", () => {
  const colTypes = { id: "int", title: "varchar", funding_agency: "varchar", prequal: "tinyint" };

  it("非破坏字符串列：NULL 与空串都保留目标值", () => {
    const clause = buildOdkuClause(
      ["id", "funding_agency"], ["id"], colTypes,
      new Set(["funding_agency"]), "id",
    );
    expect(clause).toBe(
      "`funding_agency` = IF((VALUES(`funding_agency`) IS NULL OR VALUES(`funding_agency`) = ''), `funding_agency`, VALUES(`funding_agency`))",
    );
  });

  it("非破坏数值列：仅 NULL 算未提供（0 是合法值，不被当空）", () => {
    const clause = buildOdkuClause(
      ["id", "prequal"], ["id"], colTypes,
      new Set(["prequal"]), "id",
    );
    expect(clause).toBe(
      "`prequal` = IF(VALUES(`prequal`) IS NULL, `prequal`, VALUES(`prequal`))",
    );
  });

  it("非破坏 JSON 列：NULL / [] / {} 都保留目标值", () => {
    const clause = buildOdkuClause(
      ["id", "documents"], ["id"], { ...colTypes, documents: "json" },
      new Set(["documents"]), "id",
    );
    expect(clause).toBe(
      "`documents` = IF((VALUES(`documents`) IS NULL OR JSON_LENGTH(VALUES(`documents`)) = 0), `documents`, VALUES(`documents`))",
    );
  });

  it("普通列：源库直通覆盖", () => {
    const clause = buildOdkuClause(["id", "title"], ["id"], colTypes, new Set(), "id");
    expect(clause).toBe("`title` = VALUES(`title`)");
  });

  it("机会表已无人工精编保护列；公告表保护附件/外链 JSON（2026-10-21）", () => {
    // 反向断言：若有人把退役列重新登记回白名单，本用例必须红
    expect(NON_DESTRUCTIVE_COLUMNS.crm_bid_opportunities).toBeUndefined();
    expect(NON_DESTRUCTIVE_COLUMNS.crm_bid_notices).toEqual([
      "documents",
      "procurement_files",
      "external_links",
    ]);
    expect(Object.keys(NON_DESTRUCTIVE_COLUMNS)).toHaveLength(1);
  });
});

describe("buildIncrementalWhere", () => {
  it("无水位线 → 空串（首轮全量）", () => {
    expect(buildIncrementalWhere("id", 0, null, true, false)).toBe("");
  });

  it("仅 id 水位线", () => {
    expect(buildIncrementalWhere("id", 100, null, false, false)).toBe("WHERE (`id` > 100)");
  });

  it("数值 update_time：按秒数比较，类型不匹配的水位线被丢弃", () => {
    expect(buildIncrementalWhere("id", 100, "1700000000", true, true))
      .toBe("WHERE (`id` > 100 OR `update_time` > 1700000000)");
    // 非数值字符串水位线（脏数据）→ 退化为纯 id，避免全表条件
    expect(buildIncrementalWhere("id", 100, "2026-01-01 00:00:00", true, true))
      .toBe("WHERE (`id` > 100)");
  });

  it("DATETIME update_time：按字符串比较并转义单引号", () => {
    expect(buildIncrementalWhere("id", 0, "2026-09-01 10:00:00", true, false))
      .toBe("WHERE (`update_time` > '2026-09-01 10:00:00')");
  });
});

describe("buildWatermark", () => {
  it("有 update_time：保留时间水位（空串归一为 null）", () => {
    expect(buildWatermark(true, 500, "1700000000")).toEqual({ id: 500, time: "1700000000" });
    expect(buildWatermark(true, 500, "")).toEqual({ id: 500, time: null });
  });

  it("无 update_time：退化为纯 id 水位线", () => {
    expect(buildWatermark(false, 500, "whatever")).toEqual({ id: 500, time: null });
  });
});
