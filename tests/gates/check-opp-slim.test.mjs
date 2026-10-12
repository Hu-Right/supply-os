/**
 * 门禁自测：证明机会表精简守卫真的会拦，而不是永远绿
 * 口径同 check-sql-column-fragments（用环境变量把扫描根换成 fixture）
 * 用法：node --test tests/gates/check-opp-slim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-opp-slim.mjs");

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

/** 造一个临时扫描根：rel 是相对 fixture 根的路径（门禁只看这些点） */
function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), "oppslim-"));
  for (const [rel, content] of Object.entries(entries)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

test("真实仓应通过（退役列的读取点已在本轮同批摘除）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /机会表精简守卫通过/);
});

test("OS2 破坏性：读取点重新 SELECT 退役列必须报错（列已从库里消失）", () => {
  const root = fixture({
    "src/lib/services/notices/featured.ts": [
      "const fields = `",
      "  id, unspsc_codes, thresholds, difficulty,",
      "  audit_status, review_status, is_qualified",
      "`;",
      "export { fields };",
    ].join("\n"),
  });
  const r = run({ OPP_SLIM_SCAN_ROOT: root });
  assert.equal(r.code, 1, "退役列被重新 SELECT 没有被拦住");
  assert.match(r.out, /\[OS2\].*thresholds/);
  assert.match(r.out, /\[OS2\].*difficulty/);
});

test("OS1 破坏性：intl_procurement 契约复活必须报错", () => {
  const root = fixture({
    "src/lib/services/notices/index.ts": [
      "export function build(opportunity: any) {",
      "  return { intl_procurement: opportunity };",
      "}",
    ].join("\n"),
  });
  const r = run({ OPP_SLIM_SCAN_ROOT: root });
  assert.equal(r.code, 1, "退役契约符号复活没有被拦住");
  assert.match(r.out, /\[OS1\]/);
});

test("注释与 CRM 侧 hasIntlProcurement 不得误报（守卫只管退役列与退役契约）", () => {
  const root = fixture({
    "src/lib/services/notices/featured.ts": [
      "// 历史：thresholds / difficulty / key_dates 已于 2026-10-12 退役，见 opp-slim-plan.mjs",
      "export const fields = `id, unspsc_codes, audit_status`;",
    ].join("\n"),
    "src/types/crm.ts": "export interface Lead { hasIntlProcurement: boolean; }",
  });
  const r = run({ OPP_SLIM_SCAN_ROOT: root });
  assert.equal(r.code, 0, r.out);
});
