/**
 * 门禁自测：证明服务表 SSOT 守卫真会拦，而不是永远绿
 * 口径同 check-ddl-collation（用 NP_SCAN_ROOT 把扫描根换成 fixture）
 * 用法：node --test tests/gates/check-notice-public-ssot.test.mjs
 *
 * 2026-10-27 管道翻转：唯一写入者与 PUBLIC_COLS 均在 src/lib/services/notice-public/build.ts
 * （已跟踪），N1/N2 在 CI 干净 clone 全量生效——不再有「ops 缺失降级 SKIP」的形态，
 * 缺 build.ts 本身就是 N2 违规。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-notice-public-ssot.mjs");
const BUILDER = "src/lib/services/notice-public/build.ts";

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
  "CREATE TABLE `notice_public` (\n" +
  cols.map((c) => `  \`${c}\` varchar(20) DEFAULT NULL,`).join("\n") +
  "\n  PRIMARY KEY (`notice_pk`)\n) ENGINE=InnoDB;\n";
const builder = (cols) => `const PUBLIC_COLS = [\n  ${cols.map((c) => `"${c}"`).join(", ")},\n] as const;\n`;
const OKCOLS = ["notice_pk", "industry"];

test("真实仓应通过（baseline==PUBLIC_COLS 且仅 build.ts 写服务表）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /检查通过/);
});

test("fixture：baseline 与 PUBLIC_COLS 列一致 → 通过", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder(OKCOLS),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test("fixture：缺 build.ts（写入者文件丢失）→ N2 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /找不到 src\/lib\/services\/notice-public\/build\.ts/);
});

test("fixture：PUBLIC_COLS 多一列（schema 漂移）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder([...OKCOLS, "phantom_col"]),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /schema 漂移/);
  assert.match(r.out, /phantom_col/);
});

test("fixture：非写入者代码手写 UPDATE 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("UPDATE notice_public SET industry = ?");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：非写入者代码 TRUNCATE 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("TRUNCATE TABLE notice_public");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：非写入者代码 REPLACE INTO 服务表（越权写）→ 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder(OKCOLS),
    "src/lib/repos/rogue.ts": 'await conn.query("REPLACE INTO notice_public (notice_pk) VALUES (?)");',
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /单一写入者/);
});

test("fixture：非写入者的运维壳（一次性 CLI 壳）不含写语句 → 不拦", () => {
  // 管道翻转后运维壳只剩 DROP/CREATE/SELECT：都不在 N1 写语句清单里，
  // 真正的 INSERT/DELETE 只允许出现在 build.ts。
  const root = fixture({
    "db/schema/baseline.sql": baseline(OKCOLS),
    [BUILDER]: builder(OKCOLS),
    "scripts/ops-shell.ts": "await conn.query(`DROP TABLE IF EXISTS notice_public`);",
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test("fixture：baseline 未定义服务表 → 拦截", () => {
  const root = fixture({
    "db/schema/baseline.sql": "CREATE TABLE `other` (`id` int);\n",
    [BUILDER]: builder(OKCOLS),
  });
  const r = run({ NP_SCAN_ROOT: root });
  assert.equal(r.code, 1);
  assert.match(r.out, /未定义/);
});
