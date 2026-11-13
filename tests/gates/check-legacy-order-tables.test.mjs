/**
 * 门禁自测：证明「退役订单表零读写门禁」真的会拦，且不误伤注释、豁免目录与存活表。
 * 用法：node --test tests/gates/check-legacy-order-tables.test.mjs
 *
 * 靶子表名一律码位拼装，本测试文件自身不出现连续明文（否则它自己就是残留）。
 * 夹具是「独立 mini git 仓库」：门禁以 git ls-files 枚举跟踪文件，故 fixture 必须 add 进索引。
 * 三面必测：真仓库必绿 + fixture 必拦得住 + 合规写法不得误伤。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-legacy-order-tables.mjs");

// 码位拼装：连续明文只出现在被检靶子，不出现在本文件
const PAYMENT_T = ["payment", "_orders"].join("");
const LEARNING_T = ["learning", "_orders"].join("");
const TRAINING_T = ["training", "_orders"].join("");
const SERVICE_T = ["service", "_orders"].join("");

function run(repoRoot) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], {
        encoding: "utf8",
        env: { ...process.env, LEGACY_ORDER_REPO_ROOT: repoRoot },
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 造一个临时 git 仓库：files = [{ path, content }]，写入并 git add（不 commit，无需身份） */
function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), "legacyorder-"));
  const git = (args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  for (const f of files) {
    const full = join(repo, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf8");
    git(["add", "--", f.path]);
  }
  return repo;
}

test("真仓库必绿：现行代码对三旧表零读写", () => {
  const r = run(ROOT);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /通过/);
});

test("fixture 必拦：SQL 代码引用退役表 → exit 1", () => {
  const repo = makeRepo([
    { path: "src/a.ts", content: `const rows = await pool.query("SELECT * FROM ${PAYMENT_T} WHERE id = ?");\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /零读写门禁/);
  assert.match(r.out, new RegExp(PAYMENT_T));
});

test("三张表逐一必拦（INSERT 形态）", () => {
  for (const t of [PAYMENT_T, LEARNING_T, TRAINING_T]) {
    const repo = makeRepo([
      { path: "src/b.ts", content: `await pool.execute("INSERT INTO ${t} (order_no) VALUES (?)", [no]);\n` },
    ]);
    const r = run(repo);
    assert.equal(r.code, 1, `${t} 未被拦截：\n${r.out}`);
  }
});

test("合规不误伤：退役说明注释不计（历史记录合法）", () => {
  const repo = makeRepo([
    {
      path: "src/c.ts",
      content: [
        `// 会员单历史表 ${PAYMENT_T} 已退役，读写一律走 orders`,
        `/* ${LEARNING_T}/${TRAINING_T} 仅作回滚与外部系统兼容保留 */`,
        ` * 续行说明 ${PAYMENT_T} 也不该被拦`,
        'const kind = "plan";',
      ].join("\n"),
    },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
});

test("合规不误伤：migrations 目录豁免（历史 DDL 与将来 DROP 的唯一出口）", () => {
  const repo = makeRepo([
    { path: "src/lib/db/migrations/010-drop-legacy.ts", content: `await pool.query("DROP TABLE IF EXISTS ${TRAINING_T}");\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
});

test("合规不误伤：service_orders 未退役（线下台账），照常放行", () => {
  const repo = makeRepo([
    { path: "src/d.ts", content: `const rows = await pool.query("SELECT * FROM ${SERVICE_T} WHERE status = 'lead'");\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
});

test(".sql 与 .md 不扫描（结构快照与文档合法描述历史）", () => {
  const repo = makeRepo([
    { path: "db/schema/baseline.sql", content: `CREATE TABLE \`${PAYMENT_T}\` (id int);\n` },
    { path: "docs/数据库设计/x.md", content: `# ${LEARNING_T} 说明\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
});
