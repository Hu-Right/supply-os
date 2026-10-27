/**
 * 门禁脚本自测：证明「错误码红线」三重拦截真的会拦，而不是永远绿。
 * 口径与其余 API 契约门禁一致：共享跑具 + API_CONTRACT_SCAN_ROOT 指向 fixture。
 * 用法：node --test tests/gates/check-api-error-codes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate, withFixture, runAgainst } from "./lib/gate-runner.mjs";

const GATE = "check-api-error-codes.mjs";

const CONSTS_OK = 'export const EC_ALPHA = 41001;\nexport const EC_BETA = 41002;\n';
const MAP_OK = 'const CODE_MAP = {\n  [EC_ALPHA]: { kind: "business", key: "errAlpha" },\n};\n';
const ROUTE_CLEAN = [
  'import { routeError } from "@/lib/middleware/route-handler";',
  "export const GET = () => {",
  '  routeError(400, EC_ALPHA, "alpha err");',
  "};",
].join("\n");
/** 错误码门禁的 fixture 必带 SSOT 两份底账（Rule A/C 依赖），故统一铺好 */
const fixture = (routeRel, routeSrc, extra = {}) => ({
  "src/shared/constants/api.ts": CONSTS_OK,
  "src/core/http/error-map.ts": MAP_OK,
  [routeRel]: routeSrc,
  ...extra,
});

test("真实 src/app/api 应通过（全域治本后无裸数字、码全部登记）", () => {
  const r = runGate(GATE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /API 错误码红线通过/);
});

test("[BARE]：非白名单 route.ts 用裸数字 routeError 必须被拦", () => {
  withFixture("errcode-bare", fixture("src/app/api/foo/route.ts", [
    'import { routeError } from "@/lib/middleware/route-handler";',
    "export const GET = () => {",
    '  routeError(400, 40030, "裸数字");',
    "};",
  ].join("\n")), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "裸数字没有被拦住");
    assert.match(r.out, /\[BARE\]/);
    assert.match(r.out, /foo/);
  });
});

test("[UNIQUE]：constants 同值多常量必须被拦", () => {
  withFixture("errcode-unique", {
    "src/shared/constants/api.ts": "export const EC_X = 41001;\nexport const EC_Y = 41001;\n",
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/foo/route.ts": ROUTE_CLEAN,
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "重复码没有被拦住");
    assert.match(r.out, /\[UNIQUE\]/);
  });
});

test("[UNREGISTERED]：非 auth 路由引用未登记进 error-map 的 EC 码必须被拦（Rule C 全域）", () => {
  withFixture("errcode-unreg", fixture("src/app/api/notices/y/route.ts", [
    'import { routeError } from "@/lib/middleware/route-handler";',
    "export const GET = () => {",
    '  routeError(400, EC_BETA, "未登记码");',
    "};",
  ].join("\n")), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "未登记非 auth 码没有被拦住");
    assert.match(r.out, /\[UNREGISTERED\]/);
    assert.match(r.out, /EC_BETA/);
    assert.match(r.out, /notices\/y/);
  });
});

test("[BARE]：parseJson codeByPath 使用等于已知 EC 值的裸数字必须被拦（Rule B-2）", () => {
  withFixture("errcode-codeby", fixture("src/app/api/auth/z/route.ts", [
    'import { parseJson } from "@/lib/middleware/route-handler";',
    "export const POST = async (req) => {",
    "  await parseJson(req, schema, { field: 41002 });",
    "};",
  ].join("\n")), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "codeByPath 裸码没有被拦住");
    assert.match(r.out, /\[BARE\]/);
    assert.match(r.out, /codeByPath/);
  });
});

test("[BARE]：响应体 code 裸数字必须被拦（Rule B-3，绕过 routeError 的盲区）", () => {
  withFixture("errcode-resp", fixture("src/app/api/payment/notify/route.ts", [
    'import { NextResponse } from "next/server";',
    "export const POST = () =>",
    '  NextResponse.json({ code: 40404, message: "通知路由不存在" }, { status: 404 });',
  ].join("\n")), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "响应体裸码没有被拦住");
    assert.match(r.out, /\[BARE\]/);
    assert.match(r.out, /响应体 code 裸数字/);
  });
});

test("干净 fixture：codeByPath 用已登记 EC 常量、无裸数字 → 通过（Rule B-2 不误伤）", () => {
  withFixture("errcode-ok-cb", fixture("src/app/api/auth/w/route.ts", [
    'import { parseJson } from "@/lib/middleware/route-handler";',
    "export const POST = async (req) => {",
    "  await parseJson(req, schema, { field: EC_ALPHA });",
    "};",
  ].join("\n")), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});

test("干净 fixture：auth 用已登记 EC 常量、无裸数字 → 通过", () => {
  withFixture("errcode-ok-auth", fixture("src/app/api/auth/ok/route.ts", ROUTE_CLEAN), (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});
