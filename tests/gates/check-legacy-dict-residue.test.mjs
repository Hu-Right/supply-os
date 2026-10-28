/**
 * 门禁自测：证明「旧字典零残留门禁」真的会拦，而不是永远绿；并钉死三条收紧口径——
 *   ① 负向守卫行（not.to…）、② why: 说明行、③ 非 baseline 文件里的裸列名，
 * 都不得再被当作豁免（旧实现按整行内容放行，构成绕过面）。
 * 用法：node --test tests/gates/check-legacy-dict-residue.test.mjs
 *
 * 靶子字样一律码位拼装，本测试文件自身不出现连续旧字样（否则它自己就是残留）。
 * 夹具是「独立 mini git 仓库」：门禁以 git ls-files 枚举跟踪文件，故 fixture 必须 add 进索引。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-legacy-dict-residue.mjs");

const L = ["un", "sp", "sc"].join(""); // 码位拼装：连续明文只出现在被检靶子，不出现在本文件
const DICT_TABLE = `crm_${L}_codes`; // 旧品目字典表（已物理 DROP）
const MATCH_COL = `${L}_match_status`; // supplier 外部列（基线里合法、别处非法）
const LEVEL_COL = `${L}_level1`; // 旧宽表五级列（任何地方都不得再出现）

// 子进程直连 node + 脚本路径，不经 shell 包装（Windows 命中 .cmd/.ps1 时 stdout 会被接走报错）
function run(repoRoot) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], {
        encoding: "utf8",
        env: { ...process.env, LEGACY_DICT_REPO_ROOT: repoRoot },
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 造一个临时 git 仓库：files = [{ path, content }]，写入并 git add（不 commit，无需身份） */
function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), "legacydict-"));
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

/** baseline 里「合法的两列外部快照」原样形态（DDL 行以列名反引号开头） */
const BASELINE_OK = [
  "-- baseline",
  "CREATE TABLE `supplier` (",
  `  \`${L}_codes_snapshot\` text COMMENT '品类候选码快照',`,
  `  \`${MATCH_COL}\` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '品类补码状态',`,
  ") ENGINE=InnoDB;",
  "",
].join("\n");

test("正例：干净源码 + baseline 两列外部快照 → 放行", () => {
  const repo = makeRepo([
    { path: "src/a.ts", content: 'export const v = "commodity backbone";\n' },
    { path: "db/schema/baseline.sql", content: BASELINE_OK },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /通过/);
});

test(`反例：源码出现旧字典表查询 ${DICT_TABLE} 必须报错`, () => {
  const repo = makeRepo([{ path: "src/leak.ts", content: `const q = "SELECT * FROM ${DICT_TABLE}";\n` }]);
  const r = run(repo);
  assert.equal(r.code, 1, "旧字典表查询没被拦住");
  assert.match(r.out, /src\/leak\.ts/);
});

test("反例：不得用 not.toMatch 的『负向守卫』绕过（旧实现的豁免面）", () => {
  const repo = makeRepo([
    { path: "src/sneaky.ts", content: `expect(row).not.toMatch("${DICT_TABLE}");\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "整行内容豁免仍在放行负向守卫，绕过面没堵死");
});

test("反例：不得用 why: 说明行绕过", () => {
  const repo = makeRepo([
    { path: "src/why.ts", content: `const rule = { why: "${DICT_TABLE} 已退役" };\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "why: 整行豁免仍在放行");
});

test("反例：裸列名出现在非 baseline 文件必须报错（列名豁免只锁 baseline）", () => {
  const repo = makeRepo([{ path: "src/snap.ts", content: `const col = "${MATCH_COL}";\n` }]);
  const r = run(repo);
  assert.equal(r.code, 1, "跨文件裸列名仍被全局豁免，收紧没生效");
});

test("反例：baseline 精确豁免只放两列，旧五级列混进基线仍要报错", () => {
  const repo = makeRepo([
    {
      path: "db/schema/baseline.sql",
      content: `CREATE TABLE \`bid_notices\` (\n  \`${LEVEL_COL}\` int,\n);`,
    },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "baseline 不是整文件全放行——非白名单列必须仍被拦");
});
