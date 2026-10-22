/**
 * 门禁自测：证明服务表 SSOT 守卫真会拦，而不是永远绿
 * 口径同 check-ddl-collation（用 NP_SCAN_ROOT 把扫描根换成 fixture）
 * 用法：node --test tests/gates/check-notice-public-ssot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-notice-public-ssot.mjs");

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

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), "npcp-"));
  for (const [rel, content] of Object.entries(entries)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

const baseline = (cols) =>
  "CREATE TABLE `crm_notice_public` (\n" +
  cols.map((c) => `  \`${c}\` varchar(20) DEFAULT NULL,`).join("\n") +
  "\n  PRIMARY KEY (`notice_pk`)\n) ENGINE=InnoDB;\n";
const v2 = (cols) => `const COLS = [\n  ${cols.map((c) => `"${c}"`).join(", ")},\n];\n`;
const OKCOLS = ["notice_pk", "industry"];

test("真实仓应通过（baseline==v2 且仅 v2 写服务表）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /检查通过/);
});

test("fixture：baseline 与 v2 列一致 → 通过", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    "scripts/ops/notice-public-v2.ts": v2(OKCOLS),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test("fixture：v2 多一列（schema 漂移）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    "scripts/ops/notice-public-v2.ts": v2([...OKCOLS, "phantom_col"]),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /schema 漂移/);
  assert.match(r.out, /phantom_col/);
});

test("fixture：非 v2 代码手写 UPDATE 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    "scripts/ops/notice-public-v2.ts": v2(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("UPDATE crm_notice_public SET industry = ?");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：非 v2 代码 TRUNCATE 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    "scripts/ops/notice-public-v2.ts": v2(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("TRUNCATE TABLE crm_notice_public");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：非 v2 代码 REPLACE INTO 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    "scripts/ops/notice-public-v2.ts": v2(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("REPLACE INTO crm_notice_public (notice_pk) VALUES (?)");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：baseline 未定义服务表 → 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": "CREATE TABLE `other` (`id` int);\n",
    "scripts/ops/notice-public-v2.ts": v2(OKCOLS),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /未定义/);
});
