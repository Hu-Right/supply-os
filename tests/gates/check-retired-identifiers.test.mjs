/**
 * 门禁自测：证明「退役标识符零残留门禁」真的会拦，且不误伤注释与子串。
 * 用法：node --test tests/gates/check-retired-identifiers.test.mjs
 *
 * 靶子标识符一律码位拼装，本测试文件自身不出现连续明文（否则它自己就是残留）。
 * 夹具是「独立 mini git 仓库」：门禁以 git ls-files 枚举跟踪文件，故 fixture 必须 add 进索引。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-retired-identifiers.mjs");

// 码位拼装：连续明文只出现在被检靶子，不出现在本文件
const GROUP_CODE = ["group", "Code"].join("");
const GROUP_NODES = ["group", "Nodes"].join("");
const L1_OF_GROUP = ["l1NodesOf", "Group"].join("");

// 子进程直连 node + 脚本路径，不经 shell 包装（Windows 命中 .cmd/.ps1 时 stdout 会被接走报错）
function run(repoRoot) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], {
        encoding: "utf8",
        env: { ...process.env, RETIRED_ID_REPO_ROOT: repoRoot },
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 造一个临时 git 仓库：files = [{ path, content }]，写入并 git add（不 commit，无需身份） */
function makeRepo(files) {
  const repo = mkdtempSync(join(tmpdir(), "retiredid-"));
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

test("正例：现行字段 l1Code/l1Nodes → 放行", () => {
  const repo = makeRepo([
    { path: "src/a.ts", content: 'const s = { scoped: true, l1Code: "X", l1Nodes: ["X"] };\n' },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /通过/);
});

test("正例：退役说明注释不计（历史记录合法）", () => {
  const repo = makeRepo([
    {
      path: "src/b.ts",
      content: [
        `// 不再读偏好表，不再经 ${L1_OF_GROUP} 翻译`,
        `/* ${GROUP_CODE}/${GROUP_NODES} 已退役为 l1Code/l1Nodes */`,
        ` * 续行说明 ${GROUP_CODE} 也不该被拦`,
        "export const v = 1;",
        "",
      ].join("\n"),
    },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, `注释里的退役字样被误拦：\n${r.out}`);
});

test("反例：源码使用退役字段必须报错", () => {
  const repo = makeRepo([
    { path: "src/leak.ts", content: `const s = { ${GROUP_CODE}: "X" };\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "退役字段没被拦住");
  assert.match(r.out, /src\/leak\.ts/);
});

test("反例：集成测试 mock 用旧字段（复刻行业墙 403 漂移）必须报错", () => {
  const repo = makeRepo([
    {
      path: "tests/integration/x.test.ts",
      content: `resolveIndustryScope.mockResolvedValue({ scoped: true, ${GROUP_NODES}: [] });\n`,
    },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "测试 mock 的旧字段漂移未被拦下");
  assert.match(r.out, /x\.test\.ts/);
});

test("反例：退役函数名出现在代码必须报错", () => {
  const repo = makeRepo([
    { path: "src/fn.ts", content: `const nodes = ${L1_OF_GROUP}(g);\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "退役函数名没被拦住");
});

test("反例：SQL/文档不在射程（.sql/.md 不扫）", () => {
  const repo = makeRepo([
    { path: "docs/note.md", content: `历史用过 ${GROUP_CODE}\n` },
    { path: "db/schema/x.sql", content: `-- ${GROUP_CODE}\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, `非代码文件被误扫：\n${r.out}`);
});

test("子串不误伤：groupCodeExtra 等更长标识符不命中词边界", () => {
  const repo = makeRepo([
    { path: "src/edge.ts", content: `const ${GROUP_CODE}Extra = 1; const xGroupCodeY = 2;\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, `词边界误伤更长标识符：\n${r.out}`);
});
