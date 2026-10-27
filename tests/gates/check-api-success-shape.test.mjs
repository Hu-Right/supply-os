/**
 * 门禁脚本自测：证明「2xx 成功不得返回 {code:0,message,data} 信封」红线真的会拦，而不是永远绿。
 * 口径与其余 API 契约门禁一致：共享跑具 + API_CONTRACT_SCAN_ROOT 指向 fixture。
 * 用法：node --test tests/gates/check-api-success-shape.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate, withFixture, runAgainst } from "./lib/gate-runner.mjs";

const GATE = "check-api-success-shape.mjs";
const route = (body) => [
  'import { NextResponse } from "next/server";',
  "export const GET = () => {",
  `  return NextResponse.json(${body});`,
  "};",
].join("\n");

test("真实 src/app/api 应通过（2026-10 信封迁移已归零，无任何成功信封）", () => {
  const r = runGate(GATE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /API 成功信封红线通过/);
});

test("[ENVELOPE]：非白名单端点用成功信封 code:0 必须被拦", () => {
  withFixture("apishape-bad", {
    "src/app/api/brand-new/route.ts": route('{ code: 0, message: "ok", data: { ok: true } }'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "成功信封没有被拦住");
    assert.match(r.out, /\[ENVELOPE\]/);
    assert.match(r.out, /brand-new/);
  });
});

test("裸载荷端点不得误报（成功返回不带 code:0 信封）", () => {
  withFixture("apishape-clean", {
    "src/app/api/clean/route.ts": route("{ items: [], total: 0 }"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});

test("错误信封 { code: <非0>, message } 是标准形态，不得误报", () => {
  withFixture("apishape-err-ok", {
    "src/app/api/err-ok/route.ts": route('{ code: 40004, message: "不存在" }, { status: 404 }'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});
