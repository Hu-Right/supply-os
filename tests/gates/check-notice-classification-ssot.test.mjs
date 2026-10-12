/**
 * 门禁自测：证明公告分类口径红线真的会拦，而不是永远绿。
 * 口径同 check-sql-column-fragments（用环境变量把扫描根换成 fixture）。
 * 用法：node --test tests/gates/check-notice-classification-ssot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-notice-classification-ssot.mjs");

// 不用 execFileSync("npx"|"node", shell 包装)：Windows 下命中 .ps1/.cmd 时子进程 stdout 被接走会报错
function run(env = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [GATE], { encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 在临时目录按给定相对路径造文件 */
function fixture(relPath, content) {
  const root = mkdtempSync(join(tmpdir(), "noticecls-"));
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
  return root;
}

test("真实 src 应通过（读结果链路已只认品目树）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /公告分类口径单一事实源（品目树）检查通过/);
});

test("NC1：检索编排层出现 ns.unspsc_level3 必须报错（第二口径）", () => {
  const root = fixture(
    join("src", "lib", "services", "search-orchestrator", "leak.ts"),
    'export const W = "AND ns.unspsc_level3 = ?";\n',
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 1, "旧字典宽表列没被拦住");
  assert.match(r.out, /NC1/);
});

test("NC1：features 层引用 precise_level3_id Meili 属性必须报错", () => {
  const root = fixture(
    join("src", "features", "search", "x.ts"),
    'const f = "precise_level3_id = 123";\n',
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 1, "旧字典 precise 镜像属性没被拦住");
});

test("白名单：search-sync/ 构建层引用 unspsc_level1 允许（写列合法）", () => {
  const root = fixture(
    join("src", "lib", "services", "search-sync", "builder.ts"),
    'export const C = "unspsc_level1, unspsc_level2";\n',
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test("裸 levelN_id 不误报（与用户偏好 crm_user_industry_prefs 同命名空间）", () => {
  const root = fixture(
    join("src", "app", "api", "user", "industry-prefs", "route.ts"),
    'export const P = { level1_id: 1, level3_id: null };\n',
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test("注释里的旧 token 不误报（文档会引用反例原文）", () => {
  const root = fixture(
    join("src", "lib", "services", "search-orchestrator", "note.ts"),
    '// 旧口径已移出：不再拼 level1_id = <旧字典行 id>\nexport const ok = 1;\n',
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});
