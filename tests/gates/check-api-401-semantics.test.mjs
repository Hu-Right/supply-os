/**
 * 门禁自测：证明「401 语义单一化红线」真的会拦，而不是永远绿。
 * 关键面：① 会话已死/凭据被拒若还挂 401 必须被拦；② 改成 403 后不得误伤（否则「改状态码」这条出路会被自己的门禁堵死）；
 *        ③ 401 的码必须是允许集内的 EC_ 常量（裸数字同判，与错误码 SSOT 红线同口径）。
 * 用法：node --test tests/gates/check-api-401-semantics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate, withFixture, runAgainst } from "./lib/gate-runner.mjs";

const GATE = "check-api-401-semantics.mjs";
const ROUTE = (stmt) => [
  'import { routeError } from "@/lib/middleware/route-handler";',
  "export const POST = () => {",
  `  ${stmt}`,
  "};",
];

test("真实 src 应通过（401 已全部归位为认证语义、码全为 EC_ 常量）", () => {
  const r = runGate(GATE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /401 语义红线通过/);
});

test("[401]：凭据类 401（刷新令牌无效）按 ADR-0021 属合法语义，不得误伤", () => {
  withFixture("sem401-cred-ok", {
    "src/app/api/auth/refresh/route.ts": ROUTE('routeError(401, EC_REFRESH_TOKEN_INVALID, "刷新令牌无效");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, "ADR-0021 判据下凭据错误 401 应放行（2026-11-20 修正）");
    assert.match(r.out, /401 语义红线通过/);
  });
});

test("[401]：允许集外的授权类码（VIP 门控）挂 401 必须被拦", () => {
  withFixture("sem401-noncred", {
    "src/app/api/foo/route.ts": ROUTE('routeError(401, EC_VIP_ONLY, "该资源仅 VIP 可用");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "授权语义（已认证但无权）挂 401 没被拦");
    assert.match(r.out, /\[401\]/);
    assert.match(r.out, /EC_VIP_ONLY/);
    assert.match(r.out, /foo\/route\.ts:\d+/);
  });
});

test("[401-BARE]：401 配裸数字码必须被拦（指回错误码 SSOT）", () => {
  withFixture("sem401-bare", {
    "src/app/api/foo/route.ts": ROUTE('routeError(401, 40042, "请先登录");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "裸数字 401 码没被拦");
    assert.match(r.out, /\[401-BARE\]/);
  });
});

test("[401]：Response.json({code:非允许码},{status:401}) 必须被拦", () => {
  withFixture("sem401-json", {
    "src/app/api/foo/route.ts": [
      'import { NextResponse } from "next/server";',
      "export const POST = () =>",
      '  NextResponse.json({ code: EC_PASSWORD_RESET_REQUIRED, message: "请重置密码" }, { status: 401 });',
    ].join("\n"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "status:401 配非允许码没被拦");
    assert.match(r.out, /EC_PASSWORD_RESET_REQUIRED/);
  });
});

test("[401]：service 层 throw {status:401, code:允许集外码} 必须被拦", () => {
  withFixture("sem401-throw", {
    "src/lib/services/foo.ts": [
      "export function guard(allowed) {",
      "  if (!allowed)",
      "    throw { status: 401, code: EC_PASSWORD_RESET_REQUIRED, message: \"请重置密码\" };",
      "}",
    ].join("\n"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "throw 形式的 401 非允许码没被拦");
    assert.match(r.out, /EC_PASSWORD_RESET_REQUIRED/);
  });
});

test("允许集内的认证语义 401 → 通过（三种写法都不误伤）", () => {
  withFixture("sem401-ok", {
    "src/app/api/foo/route.ts": [
      'import { NextResponse } from "next/server";',
      'import { routeError } from "@/lib/middleware/route-handler";',
      "export const GET = () => {",
      '  routeError(401, EC_AUTH_REQUIRED, "请先登录");',
      '  return NextResponse.json({ code: EC_API_KEY_INVALID, message: "bad key" }, { status: 401 });',
      "};",
    ].join("\n"),
    "src/lib/services/bar.ts": 'export function g(u) { if (!u) throw { status: 401, code: EC_USER_REQUIRED, message: "请先登录" }; }',
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});

test("403 语义本门禁不管 → 通过（不误伤授权语义；ADR-0021 后凭据类应发 401 而非 403）", () => {
  withFixture("sem401-fixed", {
    "src/app/api/auth/login/route.ts": ROUTE('routeError(403, EC_ACCOUNT_ISSUE, "账号或密码错误");'),
    "src/app/api/auth/refresh/route.ts": ROUTE('routeError(403, EC_REFRESH_TOKEN_REVOKED, "刷新令牌已失效");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});

test("[401]：Response.json(errorEnvelope(401, 允许码), {status:401}) 不误伤（envelope 出口）", () => {
  withFixture("sem401-envelope-ok", {
    "src/app/api/foo/stream/route.ts": [
      'import { Response } from "next/server";',
      'import { errorEnvelope } from "@/lib/middleware/route-handler";',
      "export const GET = () =>",
      '  Response.json(errorEnvelope(401, EC_AUTH_REQUIRED, "凭据无效"), { status: 401 });',
    ].join("\n"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});
