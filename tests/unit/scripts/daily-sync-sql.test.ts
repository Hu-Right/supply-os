/**
 * daily-sync 内容对账的纯 SQL/判定构件（决定「文档等被改写但不推 update_time 的行」能否被补同步）
 *
 * 背景：daily-sync 增量只按 `id > 水位 OR update_time > 水位` 拉取，接不住「documents 被
 * 外部管道补写、update_time 纹丝不动」的行（本库实测踩过，见 notices-shadow-phase2-cutover.mjs
 * 第 9-13 行的同款结论）。为此新增一条按**全列行指纹**逐片找差异行的对账链路，其可测的纯构件
 * 全部下沉到 scripts/tools/daily-sync-sql.cjs（与 crawler-sync-sql.ts 叶子同构）。
 *
 * 这里静默决定：指纹能否区分 NULL 与空串（CONCAT_WS 跳过 NULL ⇒ 对账假通过）、交集列口径、
 * 「哪些行算差异」的判定、以及补写 ODKU 的覆盖语义。任一分支错误都会漏同步或误覆盖。
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// 叶子是零副作用 CommonJS 纯模块（不读 env、不连库），可在单测里安全 require。
const require = createRequire(import.meta.url);
const ds = require("../../../scripts/tools/daily-sync-sql.cjs") as {
  NUMERIC_TYPES: Set<string>;
  buildOdkuUpdateClause: (updateCols: string[], colTypes: Record<string, string>, keepCols: Set<string>, pkCol: string) => string;
  buildSliceFingerprintExpr: (cols: string[]) => string;
  buildRowFingerprintExpr: (cols: string[]) => string;
  computeEffectiveColumns: (sourceCols: { COLUMN_NAME: string }[], targetCols: { COLUMN_NAME: string }[]) => string[];
  selectDriftIds: (sourceRows: { id: number; fp: number | string }[], targetRows: { id: number; fp: number | string }[]) => number[];
};

// 与影子表 rowFingerprintExpr 同一 NULL 可区分口径：每列前挂标记字节（NULL→CHAR(1)，非空→CHAR(2)+值）
const term = (c: string) =>
  "IF(`" + c + "` IS NULL, CHAR(1 USING utf8mb4), CONCAT(CHAR(2 USING utf8mb4), IFNULL(CAST(`" + c + "` AS CHAR), '')))";

describe("buildRowFingerprintExpr / buildSliceFingerprintExpr", () => {
  it("逐行指纹 = CRC32(CONCAT(带标记的列…))，NULL 与空串可区分", () => {
    expect(ds.buildRowFingerprintExpr(["title", "documents"])).toBe(
      `CRC32(CONCAT(${term("title")}, ${term("documents")}))`,
    );
    // 关键性质：非空分支前置 CHAR(2) 标记、空值分支用 CHAR(1) 标记 ⇒ '' 与 NULL 不同码
    const expr = ds.buildRowFingerprintExpr(["documents"]);
    expect(expr).toContain("IS NULL");
    expect(expr).toContain("CHAR(1 USING utf8mb4)");
    expect(expr).toContain("CHAR(2 USING utf8mb4)");
  });

  it("逐片聚合 = SUM(CRC32(CONCAT(同口径列)))，与逐行指纹一致可下钻", () => {
    const slice = ds.buildSliceFingerprintExpr(["title", "documents"]);
    expect(slice).toBe(`SUM(${ds.buildRowFingerprintExpr(["title", "documents"])})`);
  });

  it("单列也保持标记前缀（JSON 列 CAST AS CHAR 参与指纹）", () => {
    expect(ds.buildRowFingerprintExpr(["documents"])).toBe(`CRC32(CONCAT(${term("documents")}))`);
  });
});

describe("computeEffectiveColumns", () => {
  it("取源∩目标交集、保持源列序，目标缺失列被剔除", () => {
    const source = [{ COLUMN_NAME: "id" }, { COLUMN_NAME: "title" }, { COLUMN_NAME: "documents" }, { COLUMN_NAME: "new_col" }];
    const target = [{ COLUMN_NAME: "id" }, { COLUMN_NAME: "documents" }, { COLUMN_NAME: "title" }];
    // 顺序按源（id, title, documents），new_col 目标没有 ⇒ 剔除
    expect(ds.computeEffectiveColumns(source, target)).toEqual(["id", "title", "documents"]);
  });

  it("全缺 → 空数组（无从对账，调用方应跳过）", () => {
    expect(ds.computeEffectiveColumns([{ COLUMN_NAME: "a" }], [{ COLUMN_NAME: "b" }])).toEqual([]);
  });
});

describe("selectDriftIds", () => {
  it("目标缺行（新增/漏同步）→ 拾出", () => {
    const ids = ds.selectDriftIds([{ id: 1, fp: 111 }, { id: 2, fp: 222 }], [{ id: 1, fp: 111 }]);
    expect(ids).toEqual([2]);
  });

  it("指纹不等（内容漂移，含 documents 被改写）→ 拾出", () => {
    const ids = ds.selectDriftIds([{ id: 5, fp: 100 }], [{ id: 5, fp: 999 }]);
    expect(ids).toEqual([5]);
  });

  it("指纹相等 → 不动", () => {
    expect(ds.selectDriftIds([{ id: 7, fp: 42 }], [{ id: 7, fp: 42 }])).toEqual([]);
  });

  it("number 与 string 混合的 fp 按字符串比较（mysql2 SUM/CRC32 可能回 BIGINT 字符串）", () => {
    expect(ds.selectDriftIds([{ id: 9, fp: 42 }], [{ id: 9, fp: "42" }])).toEqual([]);
    expect(ds.selectDriftIds([{ id: 9, fp: "42" }], [{ id: 9, fp: 43 }])).toEqual([9]);
  });

  it("仅目标多出的行（orphan）不拾取（daily-sync 语义只增不删）", () => {
    const ids = ds.selectDriftIds([{ id: 1, fp: 10 }], [{ id: 1, fp: 10 }, { id: 2, fp: 20 }]);
    expect(ids).toEqual([]);
  });
});

describe("buildOdkuUpdateClause", () => {
  const colTypes = { id: "int", title: "varchar", funding_agency: "varchar", prequal: "tinyint" };

  it("普通列：源库直通覆盖", () => {
    expect(ds.buildOdkuUpdateClause(["title"], colTypes, new Set(), "id")).toBe("`title` = VALUES(`title`)");
  });

  it("非破坏字符串列：NULL 与空串都保留目标值", () => {
    expect(ds.buildOdkuUpdateClause(["funding_agency"], colTypes, new Set(["funding_agency"]), "id")).toBe(
      "`funding_agency` = IF((VALUES(`funding_agency`) IS NULL OR VALUES(`funding_agency`) = ''), `funding_agency`, VALUES(`funding_agency`))",
    );
  });

  it("非破坏数值列：仅 NULL 算未提供（0 是合法值）", () => {
    expect(ds.buildOdkuUpdateClause(["prequal"], colTypes, new Set(["prequal"]), "id")).toBe(
      "`prequal` = IF(VALUES(`prequal`) IS NULL, `prequal`, VALUES(`prequal`))",
    );
  });

  it("非破坏 JSON 列：NULL / [] / {} 保留目标值", () => {
    expect(
      ds.buildOdkuUpdateClause(
        ["documents"],
        { ...colTypes, documents: "json" },
        new Set(["documents"]),
        "id",
      ),
    ).toBe(
      "`documents` = IF((VALUES(`documents`) IS NULL OR JSON_LENGTH(VALUES(`documents`)) = 0), `documents`, VALUES(`documents`))",
    );
  });

  it("无更新列 → 退化为主键自等（幂等空更新）", () => {
    expect(ds.buildOdkuUpdateClause([], colTypes, new Set(), "id")).toBe("`id` = VALUES(`id`)");
  });
});

describe("NUMERIC_TYPES", () => {
  it("覆盖常见整数/浮点/decimal（update_time 与数值列判型口径）", () => {
    for (const t of ["tinyint", "int", "bigint", "decimal", "double"]) expect(ds.NUMERIC_TYPES.has(t)).toBe(true);
    expect(ds.NUMERIC_TYPES.has("varchar")).toBe(false);
    expect(ds.NUMERIC_TYPES.has("json")).toBe(false);
  });
});
