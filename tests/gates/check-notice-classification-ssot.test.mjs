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

// 靶子名用码位拼装：被禁列已物理 DROP，但夹具必须喂给门禁真实形制；
// 仓库文本层不出现连续旧字样（口径见 scripts/gates/check-legacy-dict-residue.mjs）。
const LEGACY_DICT = ["un", "sp", "sc"].join("");

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

test(`NC1：检索编排层出现 ns.${LEGACY_DICT}_level3 必须报错（第二口径）`, () => {
  const root = fixture(
    join("src", "lib", "services", "search-orchestrator", "leak.ts"),
    `export const W = "AND ns.${LEGACY_DICT}_level3 = ?";\n`,
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

test(`白名单：search-sync/ 构建层引用 ${LEGACY_DICT}_level1 允许（写列合法）`, () => {
  const root = fixture(
    join("src", "lib", "services", "search-sync", "builder.ts"),
    `export const C = "${LEGACY_DICT}_level1, ${LEGACY_DICT}_level2";\n`,
  );
  const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});

test(`B1 后索引层不再豁免：meilisearch/ 引用 ${LEGACY_DICT}_level1 必须报错`, () => {
  // 钉住「白名单只收缩不反弹」：曾经这两项在 ALLOWLIST 里，现在移出后必须真的拦得住
  // （否则移出只是字面修改，门禁对索引层仍是 noop）
  for (const rel of [
    join("src", "lib", "services", "meilisearch", "sync.ts"),
    join("src", "lib", "services", "meilisearch", "client.ts"),
  ]) {
    const root = fixture(rel, `export const A = ["${LEGACY_DICT}_level1"];\n`);
    const r = run({ NOTICE_CLASSIFICATION_SCAN_ROOT: root });
    assert.equal(r.code, 1, `${rel} 已移出白名单却没被拦住，这条收缩是假的`);
    assert.match(r.out, /NC1/);
  }
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
