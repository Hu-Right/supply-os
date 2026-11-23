/**
 * 迁移 069（诊断 V3 影子换表）单元测试
 *
 * @module tests/unit/lib/db/migration-069-diagnosis-v3
 * @description 换表类迁移最贵的错误是「列集两边不一致」：建影子表时漏一列、
 *              INSERT ... SELECT 两侧列数不等，都会在真库上表现为
 *              「数据静默丢一列」或直接 1054 Unknown column。这里用假 pool 把 SQL 录下来逐条钉：
 *              1. 影子表含 V3 四列，且**不丢**既有列（尤其 report_ai 这种本仓已无引用、但仍有数据的列）；
 *              2. 复制的两侧列清单必须逐项相等（顺序一致、数量一致）；
 *              3. 双表 RENAME 是一条语句（原子换入），旧表归档到 z_retired_*；
 *              4. 重入幂等：已换表则只清理残留影子表，不再 RENAME。
 */
import { describe, it, expect } from "vitest";
import { migration } from "@/lib/db/migrations/069-supplier-diagnosis-v3-shadow";

interface Captured {
  sql: string;
  params?: unknown[];
}

function columnsOfList(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim().replace(/`/g, ""))
    .filter(Boolean);
}

function makePool(state: { current: boolean; shadowExists?: boolean; currentColumns: string[] }) {
  const calls: Captured[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("information_schema.tables")) {
        const table = String((params ?? [])[0] ?? "");
        const exists =
          table === "supplier_diagnosis"
            ? state.current
            : table === "supplier_diagnosis_v3_shadow"
              ? Boolean(state.shadowExists)
              : false;
        return [[{ n: exists ? 1 : 0 }], []];
      }
      if (sql.includes("information_schema.columns")) {
        const column = String((params ?? [])[1] ?? "");
        return [[{ n: state.currentColumns.includes(column) ? 1 : 0 }], []];
      }
      return [{ affectedRows: 0 }, []];
    },
  };
  return { pool: pool as never, calls };
}

function createSql(calls: Captured[]): string {
  const hit = calls.find((c) => /CREATE TABLE `supplier_diagnosis_v3_shadow`/.test(c.sql));
  if (!hit) throw new Error("shadow CREATE TABLE not issued");
  return hit.sql;
}

describe("迁移 069：诊断 V3 影子换表", () => {
  it("版本与名称登记正确（runner 按版本升序执行，069 必须排在 068 之后）", () => {
    expect(migration.version).toBe(69);
    expect(migration.name).toBe("supplier_diagnosis_v3_shadow_swap");
  });

  it("影子表含 V3 四列，且保留了 report_ai 等既有列（换表不删列）", async () => {
    const { pool, calls } = makePool({ current: true, currentColumns: ["report_ai"] });
    await migration.up(pool);

    const create = createSql(calls);
    for (const col of ["target_markets", "qual_grade", "qual_breakdown", "qual_scored_at"]) {
      expect(create).toContain(`\`${col}\``);
    }
    // 既有列一个不少（report_ai 本仓已无引用，但仍有历史数据，顺带删列会静默丢数据）
    for (const col of ["report_ai", "bid_willingness", "schema_version", "score_breakdown", "submitted_at"]) {
      expect(create).toContain(`\`${col}\``);
    }
    // V3 默认值口径：新的投标意愿默认「是」、代次默认 3、分级默认 NULL
    expect(create).toMatch(/`bid_willingness`[^,]*DEFAULT '是'/);
    expect(create).toMatch(/`schema_version`[^,]*DEFAULT 3/);
    expect(create).toMatch(/`qual_grade`[^,]*DEFAULT NULL/);
  });

  it("整表复制的两侧列清单逐项相等（顺序与数量都必须一致）", async () => {
    const { pool, calls } = makePool({ current: true, currentColumns: ["report_ai"] });
    await migration.up(pool);

    const copy = calls.find((c) => /INSERT INTO `supplier_diagnosis_v3_shadow`/.test(c.sql));
    expect(copy).toBeTruthy();
    const sql = copy!.sql;

    const insertList = /INSERT INTO `supplier_diagnosis_v3_shadow` \(([\s\S]*?)\)\s*SELECT/.exec(sql)?.[1];
    const selectList = /SELECT([\s\S]*?)FROM `supplier_diagnosis`/.exec(sql)?.[1];
    expect(insertList).toBeTruthy();
    expect(selectList).toBeTruthy();

    const left = columnsOfList(insertList!);
    const right = columnsOfList(selectList!);
    expect(left).toEqual(right);
    // 主键与唯一键依赖的两列必须在复制清单里（否则换表后一司一份会断）
    expect(left).toContain("id");
    expect(left).toContain("supplier_id");
    expect(left).toContain("schema_version");
    expect(left).toContain("report_ai");
  });

  it("老库没有 report_ai 列时，复制清单自动跳过它（硬写列名会 1054 卡死整次迁移）", async () => {
    const { pool, calls } = makePool({ current: true, currentColumns: [] });
    await migration.up(pool);

    const copy = calls.find((c) => /INSERT INTO `supplier_diagnosis_v3_shadow`/.test(c.sql))!;
    const insertList = /INSERT INTO `supplier_diagnosis_v3_shadow` \(([\s\S]*?)\)\s*SELECT/.exec(copy.sql)?.[1];
    const selectList = /SELECT([\s\S]*?)FROM `supplier_diagnosis`/.exec(copy.sql)?.[1];
    const left = columnsOfList(insertList!);
    expect(left).not.toContain("report_ai");
    expect(left).toEqual(columnsOfList(selectList!));
    // 换表本身照常发生
    expect(calls.some((c) => /^RENAME TABLE/.test(c.sql.trim()))).toBe(true);
  });

  it("双表 RENAME 原子换入，旧表归档到 z_retired_supplier_diagnosis_v2", async () => {
    const { pool, calls } = makePool({ current: true, currentColumns: ["report_ai"] });
    await migration.up(pool);

    const renames = calls.filter((c) => /^RENAME TABLE/.test(c.sql.trim()));
    expect(renames).toHaveLength(1);
    expect(renames[0].sql).toContain("`supplier_diagnosis` TO `z_retired_supplier_diagnosis_v2`");
    expect(renames[0].sql).toContain("`supplier_diagnosis_v3_shadow` TO `supplier_diagnosis`");
  });

  it("空库首次初始化：只有单表改名落位，不产生归档表", async () => {
    const { pool, calls } = makePool({ current: false, currentColumns: [] });
    await migration.up(pool);

    expect(calls.some((c) => /INSERT INTO `supplier_diagnosis_v3_shadow`/.test(c.sql))).toBe(false);
    const renames = calls.filter((c) => /^RENAME TABLE/.test(c.sql.trim()));
    expect(renames).toHaveLength(1);
    expect(renames[0].sql).not.toContain("z_retired_supplier_diagnosis_v2");
  });

  it("重入幂等：当前表已有 target_markets → 只清理残留影子表，不再换表", async () => {
    const { pool, calls } = makePool({
      current: true,
      currentColumns: ["report_ai", "target_markets"],
      shadowExists: true,
    });
    await migration.up(pool);

    expect(calls.some((c) => /^DROP TABLE `supplier_diagnosis_v3_shadow`/.test(c.sql.trim()))).toBe(true);
    expect(calls.some((c) => /^RENAME TABLE/.test(c.sql.trim()))).toBe(false);
    expect(calls.some((c) => /CREATE TABLE/.test(c.sql))).toBe(false);
  });
});
