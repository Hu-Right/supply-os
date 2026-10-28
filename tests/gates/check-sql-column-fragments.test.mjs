/**
 * 门禁脚本自测：证明 SQL 列分隔符红线真的会拦，而不是永远绿
 * 口径同 check-commodity-groups（用环境变量把扫描根换成 fixture）
 * 用法：node --test tests/gates/check-sql-column-fragments.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-sql-column-fragments.mjs");
// 不用 execFileSync("npx"|"node", shell 包装)：Windows 下命中 .ps1/.cmd 时子进程 stdout 被接走会报错
function run(env = {}) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, ...env } }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 在临时目录里造一个 src/ 扫描根（门禁只看 <ROOT>/src 下的 .ts/.tsx） */
function fixture(name, content) {
  const root = mkdtempSync(join(tmpdir(), "sqlshape-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", name), content, "utf8");
  return root;
}

test("真实 src 应通过（本仓已把列清单收敛到 columns()）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /SQL 列分隔符红线通过/);
});

test("SQ1：列片段带尾逗号必须报错（线上 1064 的原始写法）", () => {
  const root = fixture(
    "bad.ts",
    [
      'export function q(locale?: string) {',
      '  const trSelect = locale ? "tr.title_tr AS title_i18n," : "";',
      '  return trSelect;',
      '}',
    ].join("\n"),
  );
  const r = run({ SQL_SHAPE_SCAN_ROOT: root });
  assert.equal(r.code, 1, "带尾逗号的片段没有被拦住");
  assert.match(r.out, /\[SQ1\]/);
});

test("SQ2：逗号紧跟 FROM 的语句必须报错", () => {
  const root = fixture(
    "bad2.ts",
    [
      'export const SQL = `SELECT n.id, n.title,',
      '     FROM bid_notices n`;',
    ].join("\n"),
  );
  const r = run({ SQL_SHAPE_SCAN_ROOT: root });
  assert.equal(r.code, 1, "「, FROM」形态没有被拦住");
  assert.match(r.out, /\[SQ2\]/);
});

test("分隔符字面量与注释里的反例不得误报", () => {
  const root = fixture(
    "good.ts",
    [
      '// 反例（仅注释）：const treSelect = "tre.title_tr AS title_en,"',
      'export function build(allColumns: string[]) {',
      '  const updateColumns = allColumns.filter((c) => c !== "id").map((c) => `${c}=VALUES(${c})`).join(", ");',
      '  return updateColumns;',
      '}',
    ].join("\n"),
  );
  const r = run({ SQL_SHAPE_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});
