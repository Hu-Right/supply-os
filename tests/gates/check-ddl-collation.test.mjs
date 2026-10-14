/**
 * 门禁自测：证明建表字符集/排序守卫真的会拦，而不是永远绿
 * 口径同 check-opp-slim（用环境变量把扫描根换成 fixture）
 * 用法：node --test tests/gates/check-ddl-collation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-ddl-collation.mjs");

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
  const root = mkdtempSync(join(tmpdir(), "ddlcoll-"));
  for (const [rel, content] of Object.entries(entries)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

test("真实仓应通过（已把 runner/daily-sync/baseline 三处漏写或错写修正）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /建表字符集\/排序红线通过/);
});

test("DC1 破坏性：CHARSET=utf8mb4 漏写 COLLATE 必须报错", () => {
  const root = fixture({
    "src/a.sql": "CREATE TABLE `foo` (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
  });
  const r = run({ DDL_COLLATION_SCAN_ROOT: root });
  assert.equal(r.code, 1, "漏写 COLLATE 没被拦住");
  assert.match(r.out, /\[DC1\].*foo.*漏 COLLATE/);
});

test("DC1 破坏性：表级写成 utf8mb4_unicode_ci 必须报错", () => {
  const root = fixture({
    "src/b.sql": "CREATE TABLE `bar` (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
  });
  const r = run({ DDL_COLLATION_SCAN_ROOT: root });
  assert.equal(r.code, 1, "错 collation 没被拦住");
  assert.match(r.out, /\[DC1\].*bar.*utf8mb4_unicode_ci/);
});

test("DC2 破坏性：utf8mb3 字符集必须报错", () => {
  const root = fixture({
    "src/c.sql": "CREATE TABLE `baz` (id INT) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;",
  });
  const r = run({ DDL_COLLATION_SCAN_ROOT: root });
  assert.equal(r.code, 1, "utf8mb3 没被拦住");
  assert.match(r.out, /\[DC2\].*baz.*utf8mb3/);
});

test("不误报：表级 0900_ai_ci + 列级 bin 例外、CREATE TABLE LIKE 均应通过", () => {
  const root = fixture({
    "src/ok.sql":
      "CREATE TABLE `good` (id INT, token CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin) " +
      "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n" +
      "CREATE TABLE `shadow_tbl` LIKE `good`;\n",
  });
  const r = run({ DDL_COLLATION_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});
