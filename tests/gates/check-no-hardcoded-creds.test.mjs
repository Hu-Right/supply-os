/**
 * 门禁自测：证明「硬编码凭据零残留门禁」真会拦明文口令，且不误伤环境变量、负例口令与模板占位。
 * 用法：node --test tests/gates/check-no-hardcoded-creds.test.mjs
 *
 * 靶子键名与值一律码位拼装：本文件自身不出现连续明文（否则它自己就是命中，射程 A 会把它抓出来）。
 * 夹具是独立 mini git 仓库：射程 A 以 git ls-files 枚举，故 fixture 必须 add 进索引。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-no-hardcoded-creds.mjs");

// 码位拼装靶子
const PW = ["pass", "word"].join("");
const DQ = '"';
const SQ = "'";
const SECRET = ["S3cret", "Value"].join(""); // 假凭据，只为触发规则

function run(repoRoot) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, CREDS_GATE_ROOT: repoRoot } }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 造临时 git 仓库；extraDirs 用于模拟执行机的临时脚本区（runtime/temp） */
function makeRepo(files, extraFiles = []) {
  const repo = mkdtempSync(join(tmpdir(), "nocreds-"));
  const git = (args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  for (const f of [...files, ...extraFiles]) {
    const full = join(repo, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf8");
    if (f.tracked !== false) git(["add", "--", f.path]);
  }
  return repo;
}

test("正例：凭据取环境变量（含 || 空串兜底）→ 放行", () => {
  const repo = makeRepo([
    { path: "src/pool.ts", content: `const cfg = { ${PW}: process.env.DB_PASSWORD || "" };\n` },
    { path: "scripts/tools/x.ts", content: `const cfg = { ${PW.toUpperCase()}: process.env.SYNC_SOURCE_PASSWORD };\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /通过/);
});

test("正例：负例口令与模板占位不计（认证失败用例、.env 模板样例值）", () => {
  const repo = makeRepo([
    { path: "tests/a.ts", content: `await login({ ${PW}: ${DQ}wrong${DQ} });\n` },
    { path: "tests/b.ts", content: `await login({ ${PW}: ${DQ}definitely-wrong-password${DQ} });\n` },
    { path: "tests/c.ts", content: `const cfg = { ${PW}: ${DQ}your-db-password${DQ} };\n` },
    { path: "tests/d.ts", content: `const cfg = { ${PW}: ${DQ}<请输入>${DQ} };\n` },
    { path: "deploy.sh", content: `${PW.toUpperCase()}=$DB_PASSWORD\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, `自声明非秘密的值被误拦：\n${r.out}`);
});

test("反例：TS 连接配置写明文口令必须报错", () => {
  const repo = makeRepo([
    { path: "scripts/tools/leak.ts", content: `const c = await mysql.createConnection({ host: "127.0.0.1", ${PW}: ${DQ}${SECRET}${DQ} });\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, "明文口令没被拦住");
  assert.match(r.out, /scripts\/tools\/leak\.ts/);
});

test("反例：shell 的 KEY=明文 与 JS 的 KEY: '明文' 两种形态都算", () => {
  const repo = makeRepo([
    { path: "deploy.sh", content: `export ${PW.toUpperCase()}=${SQ}${SECRET}${SQ}\n` },
    { path: "src/m.ts", content: `const cfg = { ${PW}: '${SECRET}' };\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 1, `= / : 两种赋值形态未全覆盖：\n${r.out}`);
});

test("反例：弱口令 123456 不得被当占位放行", () => {
  const repo = makeRepo([{ path: "src/w.ts", content: `const cfg = { ${PW}: ${DQ}123456${DQ} };\n` }]);
  const r = run(repo);
  assert.equal(r.code, 1, "弱口令被误放行");
});

test("反例：执行机临时脚本区（runtime/）写明文口令必须报错", () => {
  const repo = makeRepo(
    [{ path: "src/ok.ts", content: `const cfg = { ${PW}: process.env.DB_PASSWORD };\n` }],
    [{ path: "runtime/probe.ts", content: `const cfg = { ${PW}: ${DQ}${SECRET}${DQ} };\n`, tracked: false }],
  );
  const r = run(repo);
  assert.equal(r.code, 1, `射程 B 未拦住临时脚本区：\n${r.out}`);
  assert.match(r.out, /runtime\/probe\.ts/);
});

test("降级：无临时脚本区目录时只 WARN 不判红（CI 干净 clone 口径）", () => {
  const repo = makeRepo([{ path: "src/ok.ts", content: `const cfg = { ${PW}: process.env.DB_PASSWORD };\n` }]);
  const r = run(repo);
  assert.equal(r.code, 0, r.out);
});

test("不误伤：node_modules 子树与 .json/.md 不在射程", () => {
  const repo = makeRepo(
    [{ path: "src/ok.ts", content: `const cfg = { ${PW}: process.env.DB_PASSWORD };\n` }],
    [
      { path: "temp/head-check/node_modules/dep/index.js", content: `const cfg = { ${PW}: ${DQ}${SECRET}${DQ} };\n`, tracked: false },
      { path: "src/i18n.json", content: `{ "${PW}": "Password" }\n` },
      { path: "docs/note.md", content: `示例里写过 ${PW}: "${SECRET}"\n` },
    ],
  );
  const r = run(repo);
  assert.equal(r.code, 0, `第三方/文案被误扫：\n${r.out}`);
});

test("不误伤：password_hash 等派生列名与 type=password 属性不算凭据", () => {
  const repo = makeRepo([
    { path: "src/h.ts", content: `const u = { ${PW}_hash: ${DQ}$2b$10$abc${DQ}, ${PW}_hash_type: ${DQ}bcrypt${DQ} };\n` },
    { path: "src/f.tsx", content: `const el = <input type=${DQ}${PW}${DQ} />;\n` },
  ]);
  const r = run(repo);
  assert.equal(r.code, 0, `派生列名/属性被误拦：\n${r.out}`);
});

test("输出打码：命中提示不得回显口令本身（门禁自己不能把凭据抄进日志）", () => {
  const repo = makeRepo([{ path: "src/l.ts", content: `const cfg = { ${PW}: ${DQ}${SECRET}${DQ} };\n` }]);
  const r = run(repo);
  assert.equal(r.code, 1, r.out);
  assert.ok(!r.out.includes(SECRET), "命中提示回显了完整口令");
  assert.match(r.out, /S3\*+/);
});
