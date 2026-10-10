import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * 门禁自测：seed-test-db.ts 的表名/列清单必须被 db/schema/*.sql 卡住。
 * 被测脚本与本文件同侧（都在已跟踪区），runner 走 node --test。
 */
const GATE = resolve("scripts/gates/check-seed-schema-compat.mjs");
const FIX = resolve("test-results/seed-compat-fixtures");

function fixture(name, schemaSql, seedSource) {
  const dir = join(FIX, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "schema"), { recursive: true });
  writeFileSync(join(dir, "schema", "baseline.sql"), schemaSql, "utf8");
  const seedFile = join(dir, "seed.ts");
  writeFileSync(seedFile, seedSource, "utf8");
  return { schemaDir: join(dir, "schema"), seedFile: relativeToCwd(seedFile) };
}

function relativeToCwd(abs) {
  const rel = abs.slice(resolve(".").length + 1).replace(/\\/g, "/");
  return rel;
}

function runGate({ schemaDir, seedFile }) {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: "utf8",
    env: { ...process.env, SEED_SCHEMA_DIR: schemaDir, SEED_SQL_FILE: seedFile },
    timeout: 20_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const SCHEMA = `
CREATE TABLE \`plan\` (
  \`plan_code\` varchar(64) NOT NULL,
  \`price\` decimal(10,2) NOT NULL,
  PRIMARY KEY (\`plan_code\`)
) ENGINE=InnoDB;

CREATE TABLE \`users\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`email\` varchar(190) DEFAULT NULL,
  \`password_hash\` varchar(128) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
`;

test.after(() => rmSync(FIX, { recursive: true, force: true }));

test("列与表都对得上 → 通过", () => {
  const f = fixture(
    "ok",
    SCHEMA,
    `const a = "INSERT IGNORE INTO users (email, password_hash) VALUES (?, ?)";
     const b = "SELECT COUNT(*) AS total FROM plan";
     export { a, b };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);
});

test("引用了基线里不存在的表 → 拦下（crm_membership_plans 那类腐烂）", () => {
  const f = fixture(
    "dead-table",
    SCHEMA,
    `const a = "SELECT COUNT(*) AS total FROM retired_plans";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 1);
  assert.match(out, /S1 未知表 retired_plans/);
});

test("INSERT IGNORE INTO 的列清单里有死列 → 拦下（回归：正则曾漏 INTO 导致整条静默逃检）", () => {
  const f = fixture(
    "dead-col",
    SCHEMA,
    `const a = "INSERT IGNORE INTO users (email, is_vip, unlock_quota) VALUES (?, ?, ?)";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 1);
  assert.match(out, /S2 users 没有列 is_vip/);
  assert.match(out, /S2 users 没有列 unlock_quota/);
});

test("值的个数与列个数不符 → 拦下", () => {
  const f = fixture(
    "placeholder",
    SCHEMA,
    `const a = "INSERT INTO plan (plan_code, price) VALUES (?, ?, ?)";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 1);
  assert.match(out, /S3 plan 列 2 个但首组值 3 个/);
});

test("VALUES 里混写字面量（NULL / 'bcrypt'）→ 不误报", () => {
  const f = fixture(
    "literals",
    SCHEMA,
    `const a = "INSERT INTO users (email, password_hash) VALUES (?, 'bcrypt')";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);
});

test("多行 VALUES 且列数匹配 → 不误报（回归：曾把括号算进占位符导致恒少 2 个）", () => {
  const f = fixture(
    "multi-row",
    SCHEMA,
    `const a = "INSERT IGNORE INTO plan (plan_code, price) VALUES (?, ?), (?, ?), (?, ?)";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);
});

test("VALUES 里含函数调用（NOW() / DATE_ADD(a, b)）→ 不被拆成多值误报", () => {
  const f = fixture(
    "fn-in-values",
    SCHEMA,
    `const a = "INSERT INTO plan (plan_code, price) VALUES (?, IFNULL(NOW(), 0))";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);
});

test("分组由模板动态拼出（\${...}）→ 跳过个数核对，列名仍核对", () => {
  const f = fixture(
    "dynamic-group",
    SCHEMA,
    "const a = `INSERT INTO users (email, password_hash) VALUES ${rows.map(() => \"(?, ?)\").join(\",\")}`;\n     export { a };",
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);

  const bad = fixture(
    "dynamic-group-badcol",
    SCHEMA,
    "const a = `INSERT INTO users (email, ghost_col) VALUES ${rows.map(() => \"(?, ?)\").join(\",\")}`;\n     export { a };",
  );
  const r = runGate(bad);
  assert.equal(r.code, 1);
  assert.match(r.out, /S2 users 没有列 ghost_col/);
});

test("information_schema 等内置库不误报", () => {
  const f = fixture(
    "builtin",
    SCHEMA,
    `const a = "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()";
     export { a };`,
  );
  const { code, out } = runGate(f);
  assert.equal(code, 0, out);
});

test("真实种子脚本与真实结构基线一致（防基线更新后种子掉队）", () => {
  const { code, out } = runGate({ schemaDir: resolve("db/schema"), seedFile: "scripts/gates/seed-test-db.ts" });
  assert.equal(code, 0, out);
});
