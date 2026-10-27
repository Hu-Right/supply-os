/**
 * 门禁自测：证明「API 响应字段命名红线」真的会拦，而不是永远绿。
 * 口径与其余 API 契约门禁一致：共享跑具 + API_CONTRACT_SCAN_ROOT 指向 fixture。
 * 用法：node --test tests/gates/check-api-field-naming.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runGate, withFixture, runAgainst } from "./lib/gate-runner.mjs";

const GATE = "check-api-field-naming.mjs";
const ROUTE = (body) => [
  'import { NextResponse } from "next/server";',
  `export const GET = () => NextResponse.json(${body});`,
];

test("真实 src/app/api 应通过（存量已冻结递减白名单）", () => {
  const r = runGate(GATE);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /字段命名红线通过/);
});

test("[SNAKE-KEY]：响应字面量出现未登记的 snake 键必须被拦", () => {
  withFixture("fieldname-bad", { "src/app/api/foo/route.ts": ROUTE('{ notice_id: 1, title_zh: "x" }') }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "snake 键没被拦");
    assert.match(r.out, /\[SNAKE-KEY\]/);
    assert.match(r.out, /notice_id/);
    assert.match(r.out, /foo\/route\.ts:\d+/); // 必须给到「文件:行号」，否则无法定位
  });
});

test("嵌套对象里的 snake 键同样被拦（不只顶层）", () => {
  withFixture("fieldname-nested", { "src/app/api/foo/route.ts": ROUTE('{ data: { buyer_name: "x" } }') }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "嵌套 snake 键没被拦");
    assert.match(r.out, /buyer_name/);
  });
});

test("camelCase 键 + 分页元数据 snake 键 → 通过（不误伤）", () => {
  withFixture("fieldname-ok", { "src/app/api/ok/route.ts": ROUTE('{ noticeId: 1, titleZh: "x", page_size: 20, total: 5 }') }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, r.out);
  });
});

test("已登记递减白名单的存量键不报错（冻结现状），新键仍被拦", () => {
  // 白名单里的真实存量项 + 一个未登记项：只应报未登记的那条
  // （auth 全域、supplier-diagnosis、learning/training、report-preview、claims/interest/unlock、
  //   crm/chat/messages、notices 全域（detail/preview/content/unified-search）均已迁 camelCase
  //   并从白名单删除，样本改用仍存量登记的 payment/orders 两键）
  withFixture("fieldname-allow", {
    "src/app/api/payment/orders/route.ts": ROUTE('{ pay_url: "https://x", payment_mode: "mock" }'),
    "src/app/api/newer/route.ts": ROUTE('{ pay_url: "c" }'),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "未登记的 snake 键没被拦");
    // 只应报未登记那一条：已登记键计入违规则违规数会是 2
    // （不断言“不含 forgot-password 字样”——fixture 下「白名单待收敛」提示会列出未命中的登记项）
    assert.match(r.out, /违规 1 处：/, `违规条数不是 1：\n${r.out}`);
    assert.match(r.out, /newer\/route\.ts/);
  });
});

test("简写键 { total_report_chars, } 同样是响应键 → 必须被拦（已闭的盲点）", () => {
  withFixture("fieldname-shorthand", {
    "src/app/api/short/route.ts": ROUTE("{ total_report_chars, noticeId: 1 }"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "简写 snake 键没被拦——盲点未闭合");
    assert.match(r.out, /\[SNAKE-KEY\]/);
    assert.match(r.out, /total_report_chars/);
  });
});

test("不误伤：camelCase 简写键、以及 snake 「值」（不是键）一律不计", () => {
  withFixture("fieldname-value", {
    // notice_id 在值位（payload: 之后）、raw_rows 在数组元素位、notice 是 camelCase 简写键——
    // 三者都不是 snake 响应键，一个都不该计入
    "src/app/api/val/route.ts": ROUTE("{ notice, items: [raw_rows], payload: notice_id, meta: { pageCount: 2 } }"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, `值位 snake 标识被误判为键：\n${r.out}`);
  });
});
