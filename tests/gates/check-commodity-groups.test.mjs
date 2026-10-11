/**
 * 门禁脚本自测：证明 CG1~CG4 真的会拦，而不是永远绿
 * 口径同 check-wide-table-ssot（用环境变量把校验对象换成 fixture）
 * 用法：node --test tests/gates/check-commodity-groups.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-commodity-groups.ts");
// 不用 execFileSync("npx", …)：Windows 下 spawn 命中的是 npx.ps1/npx.cmd 包装，
// 在子进程 stdout 被接走时会报 StandardOutputEncoding 错；直调 node + tsx CLI 两端一致。
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function run(env = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [TSX, GATE], { encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function fixture(name, groups) {
  const file = join(mkdtempSync(join(tmpdir(), "cg-")), name);
  writeFileSync(file, JSON.stringify(groups), "utf8");
  return file;
}

test("真实常量应通过", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /CG1~CG4 通过/);
  assert.match(r.out, /32 类 \/ 58 段前缀/);
});

test("CG3：一段挂两类必须报错", () => {
  const f = fixture("dup.json", [
    { code: "UGT-G-01", nameZh: "甲", prefixes: ["72"] },
    { code: "UGT-G-02", nameZh: "乙", prefixes: ["72"] },
  ]);
  const r = run({ COMMODITY_GROUPS_FIXTURE: f });
  assert.equal(r.code, 1);
  assert.match(r.out, /CG3 段 72 重复归属：UGT-G-01 vs UGT-G-02/);
});

test("CG1 + CG4：类数不为 32、名称为空都要报", () => {
  const f = fixture("bad.json", [{ code: "UGT-G-01", nameZh: "  ", prefixes: ["10"] }]);
  const r = run({ COMMODITY_GROUPS_FIXTURE: f });
  assert.equal(r.code, 1);
  assert.match(r.out, /CG4 UGT-G-01 的 name_zh 为空/);
  assert.match(r.out, /CG1 大类数应为 32，实际 1/);
});

test("CG2：段前缀形制非法要报", () => {
  const f = fixture("fmt.json", [{ code: "UGT-G-01", nameZh: "甲", prefixes: ["7", "abc"] }]);
  const r = run({ COMMODITY_GROUPS_FIXTURE: f });
  assert.equal(r.code, 1);
  assert.match(r.out, /CG2 UGT-G-01 段前缀形制非法：7/);
  assert.match(r.out, /CG2 UGT-G-01 段前缀形制非法：abc/);
});

test("CG1：大类码形制非法要报（不是 UGT-G-NN）", () => {
  const f = fixture("code.json", [{ code: "GROUP-1", nameZh: "甲", prefixes: ["10"] }]);
  const r = run({ COMMODITY_GROUPS_FIXTURE: f });
  assert.equal(r.code, 1);
  assert.match(r.out, /CG1 大类码形制非法：GROUP-1/);
});
