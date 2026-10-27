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

test("[401]：会话已死语义（刷新令牌无效）仍挂 401 必须被拦", () => {
  withFixture("sem401-dead", {
    "src/app/api/auth/refresh/route.ts": ROUTE('routeError(401, EC_REFRESH_TOKEN_INVALID, "刷新令牌无效");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "401 承载会话已死语义却没被拦");
    assert.match(r.out, /\[401\]/);
    assert.match(r.out, /EC_REFRESH_TOKEN_INVALID/);
    assert.match(r.out, /refresh\/route\.ts:\d+/);
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

test("[401]：service 层 throw {status:401, code:非允许码} 必须被拦", () => {
  withFixture("sem401-throw", {
    "src/lib/services/foo.ts": [
      "export function guard(allowed) {",
      "  if (!allowed)",
      "    throw { status: 401, code: EC_ACCOUNT_ISSUE, message: \"账号或密码错误\" };",
      "}",
    ].join("\n"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "throw 形式的 401 非允许码没被拦");
    assert.match(r.out, /EC_ACCOUNT_ISSUE/);
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

test("治本出路 403 + 专属码 → 通过（证明「改 403」是合规解，不是换个地方报错）", () => {
  withFixture("sem401-fixed", {
    "src/app/api/auth/login/route.ts": ROUTE('routeError(403, EC_ACCOUNT_ISSUE, "账号或密码错误");'),
    "src/app/api/auth/refresh/route.ts": ROUTE('routeError(403, EC_REFRESH_TOKEN_REVOKED, "刷新令牌已失效");'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});
