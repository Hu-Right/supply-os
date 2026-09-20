/**
 * 宽表单一写入者门禁自测（标准必须可执行，否则退化成注释）
 *
 * 用临时目录构造违规/合规夹具，跑真实脚本，断言 exit code 与报错内容；
 * 最后一条断言真实仓库当前必须通过（门禁与代码收口同批落地）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(process.cwd(), "scripts/check-wide-table-ssot.mjs");

function run(root: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, SSOT_SCAN_ROOT: root },
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

let tmp = "";
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wide-ssot-"));
  fs.mkdirSync(path.join(tmp, "src/lib/services/search-sync"), { recursive: true });
});
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function write(rel: string, content: string): void {
  const p = path.join(tmp, "src/lib", rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}
function rm(rel: string): void {
  fs.rmSync(path.join(tmp, "src/lib", rel), { force: true });
}

describe("check-wide-table-ssot", () => {
  it("I1：services 里 UPDATE crm_notice_search → fail", () => {
    write("services/search-sync/bad.ts", `const s = "UPDATE crm_notice_search SET title = 'x'";\nexport default s;`);
    const r = run(tmp);
    expect(r.code).toBe(1);
    expect(r.out).toContain("I1");
    expect(r.out).toContain("bad.ts");
    rm("services/search-sync/bad.ts");
  });

  it("I1：db/migrations 下的一次性收敛不在扫描范围", () => {
    fs.mkdirSync(path.join(tmp, "src/lib/db/migrations"), { recursive: true });
    write("db/migrations/032-x.ts", `const s = "UPDATE crm_notice_search SET description = LEFT(description, 2000)";\nexport default s;`);
    expect(run(tmp).code).toBe(0);
    rm("db/migrations/032-x.ts");
  });

  it("I2：JS 裸 slice(0, 2000) → fail", () => {
    write("services/search-sync/bad2.ts", `export const f = (v: string) => v.slice(0, 2000);`);
    const r = run(tmp);
    expect(r.code).toBe(1);
    expect(r.out).toContain("I2");
    expect(r.out).toContain("WIDE_LIMITS");
    rm("services/search-sync/bad2.ts");
  });

  it("I2：SQL 裸 LEFT(col, 300) → fail", () => {
    write("services/search-sync/bad6.ts", `export const s = "LEFT(description, 300) AS description";`);
    expect(run(tmp).code).toBe(1);
    rm("services/search-sync/bad6.ts");
  });

  it("I2：skip-same-lang 字面量（死分支源头）→ fail", () => {
    write("services/search-sync/bad3.ts", `export const m = "skip-same-lang";`);
    expect(run(tmp).code).toBe(1);
    rm("services/search-sync/bad3.ts");
  });

  it("I2：内联合格机会谓词 → fail（须复用 qualifiedOppWhere）", () => {
    write("services/search-sync/bad4.ts", `export const w = "opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1";`);
    const r = run(tmp);
    expect(r.code).toBe(1);
    expect(r.out).toContain("qualifiedOppWhere");
    rm("services/search-sync/bad4.ts");
  });

  it("I2：内联 COALESCE(opp.description, n.description) → fail（须复用 DESC_SOURCE_EXPR）", () => {
    write("services/search-sync/bad5.ts", `export const s = "COALESCE(opp.description, n.description) AS description";`);
    const r = run(tmp);
    expect(r.code).toBe(1);
    expect(r.out).toContain("DESC_SOURCE_EXPR");
    rm("services/search-sync/bad5.ts");
  });

  it("引用常量的合规写法 → 通过", () => {
    write("services/search-sync/good.ts", [
      `import { WIDE_LIMITS, TRANSLATION_MODEL, DESC_SOURCE_EXPR } from "../../utils/notice-field-limits";`,
      `export const f = (v: string) => v.slice(0, WIDE_LIMITS.description);`,
      `export const m = TRANSLATION_MODEL.SAME_LANG;`,
      `export const e = DESC_SOURCE_EXPR;`,
      `export const q = \`LEFT(description_en, \${WIDE_LIMITS.i18nTeaser})\`;`,
    ].join("\n"));
    expect(run(tmp).code).toBe(0);
    rm("services/search-sync/good.ts");
  });

  it("真实仓库当前必须通过（门禁与代码同批落地）", () => {
    const r = run(process.cwd());
    expect(r.out).toContain("✓");
    expect(r.code).toBe(0);
  });
});
