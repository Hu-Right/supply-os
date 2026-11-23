/**
 * 迁移 070（V3 第二版收集口径：加三列 + mandatory_docs 补默认值）单元测试
 *
 * @module tests/unit/lib/db/migration-070-diagnosis-v3b
 * @description 定点钉两件事：
 *              1. 三列必须按「不存在才加」的方式补齐（重入不重复 ALTER）；
 *              2. mandatory_docs 从「不再写入」的那天起必须有 DEFAULT ''，
 *                 否则新版 INSERT 不带该列会直接失败——这是本条迁移唯一有破坏性的前提。
 */
import { describe, it, expect } from "vitest";
import { migration } from "@/lib/db/migrations/070-supplier-diagnosis-v3-qualification-fields";

interface Captured {
  sql: string;
  params?: unknown[];
}

function makePool(state: { columns: string[]; mandatoryDocsDefault?: string | null }) {
  const calls: Captured[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("information_schema.columns") && sql.includes("COUNT(*)")) {
        const column = String((params ?? [])[1] ?? "");
        return [[{ n: state.columns.includes(column) ? 1 : 0 }], []];
      }
      if (sql.includes("COLUMN_DEFAULT")) {
        return [[{ d: state.mandatoryDocsDefault ?? null }], []];
      }
      return [{ affectedRows: 0 }, []];
    },
  };
  return { pool: pool as never, calls };
}

describe("迁移 070", () => {
  it("版本 70，名称登记正确（runner 按版本升序，070 必须排在 069 之后）", () => {
    expect(migration.version).toBe(70);
    expect(migration.name).toBe("supplier_diagnosis_v3_qualification_fields");
  });

  it("空库/未加列：补 export_entity / cert_ledger / cert_delivery 三列", async () => {
    const { pool, calls } = makePool({ columns: ["mandatory_docs"] });
    await migration.up(pool);

    const added = calls.filter((c) => /^ALTER TABLE `supplier_diagnosis` ADD COLUMN/.test(c.sql.trim()));
    expect(added).toHaveLength(3);
    for (const col of ["export_entity", "cert_ledger", "cert_delivery"]) {
      expect(added.some((c) => c.sql.includes(`\`${col}\``))).toBe(true);
    }
    // 三列都必须带 DEFAULT ''，否则新版 INSERT 不带该列会失败
    for (const c of added) expect(c.sql).toContain("DEFAULT ''");
  });

  it("mandatory_docs 无默认值时补 DEFAULT ''（列保留，AI 画像契约仍读）", async () => {
    const { pool, calls } = makePool({ columns: ["mandatory_docs"], mandatoryDocsDefault: null });
    await migration.up(pool);

    const modify = calls.find((c) => /MODIFY COLUMN `mandatory_docs`/.test(c.sql));
    expect(modify).toBeTruthy();
    expect(modify!.sql).toContain("DEFAULT ''");
  });

  it("已是 DEFAULT '' 时不重复 MODIFY（重入幂等）", async () => {
    const { pool, calls } = makePool({
      columns: ["mandatory_docs", "export_entity", "cert_ledger", "cert_delivery"],
      mandatoryDocsDefault: "",
    });
    await migration.up(pool);

    expect(calls.some((c) => /ADD COLUMN/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /MODIFY COLUMN/.test(c.sql))).toBe(false);
  });
});
