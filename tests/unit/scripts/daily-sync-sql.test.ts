/**
 * daily-sync 内容对账的纯 SQL/判定构件（决定「文档等被改写但不推 update_time 的行」能否被补同步）
 *
 * 背景：daily-sync 增量只按 `id > 水位 OR update_time > 水位` 拉取，接不住「documents 被
 * 外部管道补写、update_time 纹丝不动」的行（本库实测踩过，见 notices-shadow-phase2-cutover.mjs
 * 第 9-13 行的同款结论）。为此新增一条按**全列行指纹**逐片找差异行的对账链路，其可测的纯构件
 * 全部下沉到 scripts/tools/daily-sync-sql.cjs（原与已摘除的 crawler-sync-sql.ts 同构）。
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
  NULL_AS_ZERO_COLUMNS: Record<string, string[]>;
  TARGET_WINS_COLUMNS: Record<string, string[]>;
  buildOdkuUpdateClause: (
    updateCols: string[],
    colTypes: Record<string, string>,
    keepCols: Set<string>,
    pkCol: string,
    opts?: { monotoneCols?: Set<string>; targetWins?: Set<string> },
  ) => string;
  buildSliceFingerprintExpr: (cols: string[], opts?: { nullAsZero?: Set<string> }) => string;
  buildRowFingerprintExpr: (cols: string[], opts?: { nullAsZero?: Set<string> }) => string;
  computeEffectiveColumns: (sourceCols: { COLUMN_NAME: string }[], targetCols: { COLUMN_NAME: string }[]) => string[];
  selectDriftIds: (sourceRows: { id: number; fp: number | string }[], targetRows: { id: number; fp: number | string }[]) => number[];
  selectUniqueKeyConflicts: (
    rows: Array<Record<string, unknown>>,
    existingKeyToPk: Map<string, number | string>,
    keyCol: string,
    pkCol: string,
  ) => { writable: Array<Record<string, unknown>>; conflicts: Array<{ pk: number; key: string; existingPk: number }> };
  findOverlongValues: (
    row: Record<string, unknown>,
    columns: Array<{ COLUMN_NAME: string; CHAR_MAX?: number | string | null }>,
  ) => Array<{ column: string; length: number; max: number }>;
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

describe("指纹的 NULL→0 归一（deadline_ts）", () => {
  it("nullAsZero 列：NULL 与 0 同码，正常值仍带标记参与比较", () => {
    const expr = ds.buildRowFingerprintExpr(["deadline_ts"], { nullAsZero: new Set(["deadline_ts"]) });
    expect(expr).toBe(
      "CRC32(CONCAT(CONCAT(CHAR(2 USING utf8mb4), CAST(IFNULL(`deadline_ts`, 0) AS CHAR))))",
    );
    // 与默认口径不同：默认仍区分 NULL 与 ''（CHAR(1) 标记）
    expect(ds.buildRowFingerprintExpr(["deadline_ts"])).toContain("CHAR(1 USING utf8mb4)");
  });

  it("未登记的列不受 nullAsZero 影响，片级指纹与逐行同口径", () => {
    const opts = { nullAsZero: new Set(["deadline_ts"]) };
    expect(ds.buildSliceFingerprintExpr(["title", "deadline_ts"], opts)).toBe(
      `SUM(${ds.buildRowFingerprintExpr(["title", "deadline_ts"], opts)})`,
    );
    expect(ds.buildRowFingerprintExpr(["title"], opts)).toBe(`CRC32(CONCAT(${term("title")}))`);
  });

  it("归一登记与归一函数同一事实源：bid_notices.deadline_ts 已登记", () => {
    expect(ds.NULL_AS_ZERO_COLUMNS.bid_notices).toContain("deadline_ts");
  });
});

describe("selectUniqueKeyConflicts（ODKU 唯一键撞行预检）", () => {
  it("key 在云端已存在且主键不同 → 跳过，不改写别人的行", () => {
    const rows = [{ id: 10, notice_id: "N-1" }, { id: 11, notice_id: "N-2" }];
    const existing = new Map([["N-1", 99]]);
    const { writable, conflicts } = ds.selectUniqueKeyConflicts(rows, existing, "notice_id", "id");
    expect(writable.map((r) => r.id)).toEqual([11]);
    expect(conflicts).toEqual([{ pk: 10, key: "N-1", existingPk: 99 }]);
  });

  it("key 相同且主键相同（正常更新）→ 放行", () => {
    const { writable, conflicts } = ds.selectUniqueKeyConflicts(
      [{ id: 10, notice_id: "N-1" }],
      new Map([["N-1", 10]]),
      "notice_id",
      "id",
    );
    expect(writable.map((r) => r.id)).toEqual([10]);
    expect(conflicts).toEqual([]);
  });

  it("同一批内 key 重复且主键不同 → 后者跳过（先写入者占住唯一键）", () => {
    const { writable, conflicts } = ds.selectUniqueKeyConflicts(
      [{ id: 10, notice_id: "N-1" }, { id: 11, notice_id: "N-1" }],
      new Map(),
      "notice_id",
      "id",
    );
    expect(writable.map((r) => r.id)).toEqual([10]);
    expect(conflicts).toEqual([{ pk: 11, key: "N-1", existingPk: 10 }]);
  });

  it("NULL key 不受唯一键约束 → 全部放行", () => {
    const { writable, conflicts } = ds.selectUniqueKeyConflicts(
      [{ id: 10, notice_id: null }, { id: 11, notice_id: undefined }],
      new Map(),
      "notice_id",
      "id",
    );
    expect(writable.length).toBe(2);
    expect(conflicts).toEqual([]);
  });
});

describe("findOverlongValues（超列宽预检，防 strict 模式整批失败）", () => {
  const cols = [
    { COLUMN_NAME: "contact_phone", CHAR_MAX: 63 },
    { COLUMN_NAME: "delivery_address", CHAR_MAX: 255 },
    { COLUMN_NAME: "description", CHAR_MAX: null },
  ];

  it("未超宽 → 空清单", () => {
    expect(ds.findOverlongValues({ contact_phone: "021-12345678", description: "x".repeat(100) }, cols)).toEqual([]);
  });

  it("超宽 → 报列名/实际长度/上限（longtext 无上限不参与）", () => {
    const row = { delivery_address: "x".repeat(256), description: "x".repeat(100000) };
    expect(ds.findOverlongValues(row, cols)).toEqual([{ column: "delivery_address", length: 256, max: 255 }]);
  });

  it("非字符串值（数字/NULL/JSON 对象）不参与列宽判定", () => {
    expect(ds.findOverlongValues({ contact_phone: null, delivery_address: 123 }, cols)).toEqual([]);
  });

  it("emoji 按码点复核：UTF-16 长度超、字符数不超 → 不误杀", () => {
    // 63 个 emoji = UTF-16 长度 126 > 63，但 MySQL 字符数 63 → 不应判超宽
    expect(ds.findOverlongValues({ contact_phone: "😀".repeat(63) }, cols)).toEqual([]);
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

  it("目标优先列：字符串按 NULL/空串算「空」，数值列只把 NULL 算「空」", () => {
    expect(
      ds.buildOdkuUpdateClause(["title"], colTypes, new Set(), "id", { targetWins: new Set(["title"]) }),
    ).toBe("`title` = IF(`title` IS NULL OR `title` = '', VALUES(`title`), `title`)");
    expect(
      ds.buildOdkuUpdateClause(["converted_opp_id"], { converted_opp_id: "bigint" }, new Set(), "id", {
        targetWins: new Set(["converted_opp_id"]),
      }),
    ).toBe("`converted_opp_id` = IF(`converted_opp_id` IS NULL, VALUES(`converted_opp_id`), `converted_opp_id`)");
  });

  it("converted_opp_id 已登记为目标优先（云端转商机关系不被源库旧值打回）", () => {
    expect(ds.TARGET_WINS_COLUMNS.bid_notices).toContain("converted_opp_id");
  });
});

describe("NUMERIC_TYPES", () => {
  it("覆盖常见整数/浮点/decimal（update_time 与数值列判型口径）", () => {
    for (const t of ["tinyint", "int", "bigint", "decimal", "double"]) expect(ds.NUMERIC_TYPES.has(t)).toBe(true);
    expect(ds.NUMERIC_TYPES.has("varchar")).toBe(false);
    expect(ds.NUMERIC_TYPES.has("json")).toBe(false);
  });
});
