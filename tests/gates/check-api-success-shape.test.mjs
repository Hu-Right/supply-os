/**
 * 门禁脚本自测：证明「2xx 成功不得返回 {code:0,message,data} 信封」红线真的会拦，而不是永远绿。
 * 口径同 check-sql-column-fragments（用环境变量把扫描根换成 fixture）。
 * 用法：node --test tests/gates/check-api-success-shape.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-api-success-shape.mjs");

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

/** 在临时目录里造 <root>/src/app/api/<name>/route.ts */
function fixture(relDir, content) {
  const root = mkdtempSync(join(tmpdir(), "apishape-"));
  const dir = join(root, "src", "app", "api", relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "route.ts"), content, "utf8");
  return root;
}

test("真实 src/app/api 应通过（2026-10 信封迁移已归零，无任何成功信封）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /API 成功信封红线通过/);
});

test("[ENVELOPE]：非白名单端点用成功信封 code:0 必须被拦", () => {
  const root = fixture(
    "brand-new",
    [
      'import { NextResponse } from "next/server";',
      "export const GET = () => {",
      '  return NextResponse.json({ code: 0, message: "ok", data: { ok: true } });',
      "};",
    ].join("\n"),
  );
  try {
    const r = run({ API_SHAPE_SCAN_ROOT: root });
    assert.equal(r.code, 1, "成功信封没有被拦住");
    assert.match(r.out, /\[ENVELOPE\]/);
    assert.match(r.out, /brand-new/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("裸载荷端点不得误报（成功返回不带 code:0 信封）", () => {
  const root = fixture(
    "clean",
    [
      'import { NextResponse } from "next/server";',
      "export const GET = () => {",
      '  return NextResponse.json({ items: [], total: 0 });',
      "};",
    ].join("\n"),
  );
  try {
    const r = run({ API_SHAPE_SCAN_ROOT: root });
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("错误信封 { code: <非0>, message } 是标准形态，不得误报", () => {
  const root = fixture(
    "err-ok",
    [
      'import { NextResponse } from "next/server";',
      "export const GET = () => {",
      '  return NextResponse.json({ code: 40004, message: "不存在" }, { status: 404 });',
      "};",
    ].join("\n"),
  );
  try {
    const r = run({ API_SHAPE_SCAN_ROOT: root });
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
