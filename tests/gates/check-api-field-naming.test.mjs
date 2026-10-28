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
  // 样本存量项由 API_FIELD_NAMING_ALLOWLIST_EXTRA 注入，不绑真实白名单：
  // 真实存量会随各域迁移逐行删完，绑上去就等于每迁一族都要回来改 fixture。
  withFixture("fieldname-allow", {
    "src/app/api/allow-sample/route.ts": ROUTE('{ legacy_total_usd: "1", page_size: 2 }'),
    "src/app/api/newer/route.ts": ROUTE('{ legacy_total_usd: "c" }'),
  }, (root) => {
    const r = runAgainst(root, GATE, {
      API_FIELD_NAMING_ALLOWLIST_EXTRA: "src/app/api/allow-sample/route.ts#legacy_total_usd",
    });
    assert.equal(r.code, 1, "未登记的 snake 键没被拦");
    // 只应报未登记那一条：已登记键计入违规则违规数会是 2
    // （不断言“不含某个真实存量路径”——fixture 下真实登记项未命中，
    //   「白名单待收敛」提示会把它列出来，那不是违规）
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

// ―― 规则二「整块透出」：静态面看不见键的出口必须过 mapper 或登记 ――

/** 多语句路由：声明与返回分开，才能测出「间接字面量」与「整块透出」 */
const ROUTE_BODY = (decls, expr) => [
  'import { NextResponse } from "next/server";',
  "export const GET = async () => {",
  decls,
  `  return NextResponse.json(${expr});`,
  "};",
].join("\n");

test("[OPAQUE-PAYLOAD]：json(变量) 没过 mapper 必须被拦，登记后放行", () => {
  const decls = '  const rows = await ctx.noticeRepo.listRows({ user_id: 1 });';
  withFixture("fieldname-opaque", {
    "src/app/api/op/route.ts": ROUTE_BODY(decls, "rows"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "整块透出没被拦");
    assert.match(r.out, /\[OPAQUE-PAYLOAD\]/);
    assert.match(r.out, /op\/route\.ts:\d+:/); // 给到文件:行号
    assert.match(r.out, /rows/);
    // 登记后即可收敛到「已知存量」（递减清单语义）：不会因「看不见」而静默过关
    const ok = runAgainst(root, GATE, { API_FIELD_NAMING_OPAQUE_EXTRA: "src/app/api/op/route.ts#rows" });
    assert.equal(ok.code, 0, `登记后仍拦：\n${ok.out}`);
  });
});

test("已过视图 mapper 的 json(xViewOf(row)) 不误伤", () => {
  withFixture("fieldname-mapped", {
    "src/app/api/mp/route.ts": ROUTE_BODY(
      "  const row = await ctx.noticeRepo.findOne(id);",
      "toNoticeView(row)",
    ),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 0, `mapper 出口被误拦：\n${r.out}`);
  });
});

test("间接字面量的键同样要查：const body = { user_id } → 拦在声明行", () => {
  // 旧版只看 json(...) 括号内的字面量，这种形态一个键都看不见
  withFixture("fieldname-indirect", {
    "src/app/api/ind/route.ts": ROUTE_BODY(
      "  const body = { noticeId: 1, user_id: 2 };",
      "body",
    ),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "响应体变量里的 snake 键没被拦");
    assert.match(r.out, /\[SNAKE-KEY\]/);
    assert.match(r.out, /user_id/);
    // 行号必须指向声明行（本模板里是第 3 行），而不是 json 调用行（第 4 行）：否则报的是错位置
    assert.match(r.out, /ind\/route\.ts:3:/, `行号未指向声明处：\n${r.out}`);
  });
});

test("带类型标注的响应体变量也能解析（三元分支里的字面量）", () => {
  // 真实形状：membership/credits 就是 `const body: AnnualCreditView | null = credit ? { … } : null`
  withFixture("fieldname-annotated", {
    "src/app/api/an/route.ts": ROUTE_BODY(
      [ "  const credit = await repo.find(id);",
        "  const body: AnnualCreditView | null = credit",
        "    ? { sourceOrderNo: credit.order_no, amount: Number(credit.amount) }",
        "    : null;" ].join("\n"),
      "body",
    ),
  }, (root) => {
    const r = runAgainst(root, GATE);
    // 键已查（全 camel）且列名只出现在值位 → 不该报 SNAKE-KEY；
    // 但它是能解析到字面量的变量，也不该再当整块透出要求登记
    assert.equal(r.code, 0, `可见字面量被误判：\n${r.out}`);
    assert.doesNotMatch(r.out, /\[OPAQUE-PAYLOAD\]/);
  });
});

test("展开写法：`{ ...row }` 拦、`{ ...xViewOf(row) }` 放行", () => {
  withFixture("fieldname-spread", {
    "src/app/api/sp-bad/route.ts": ROUTE("{ ...info, claimed }"),
    "src/app/api/sp-ok/route.ts": ROUTE("{ ...toSupplierView(row), claimed }"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "盲区展开没被拦");
    assert.match(r.out, /sp-bad\/route\.ts/);
    assert.match(r.out, /info/);
    assert.doesNotMatch(r.out, /sp-ok\/route\.ts/); // 展开源是视图 mapper → 不拦
  });
});

test("约定名要真起作用：`.map(*ViewOf)` 放行、`.map(mapXxx)` 仍拦（leads 族改名的依据）", () => {
  // 这两个出口本来就在过隐私收窄 DTO，只是函数名不合约定 → 始终得占登记位。
  // 本例钉住「名字即证据」：改名前拦、改名后放行，防止将来被改回 map 前缀。
  const declsOk = [
    "  const rows = await ctx.leadsRepo.listAppointments();",
    "  const leads = rows.map(leadMemberViewOf);",
  ].join("\n");
  const declsBad = [
    "  const rows = await ctx.leadsRepo.listAppointments();",
    "  const leads = rows.map(mapLeadForMemberView);",
  ].join("\n");
  withFixture("fieldname-mapper-name", {
    "src/app/api/mn-ok/route.ts": ROUTE_BODY(declsOk, "leads"),
    "src/app/api/mn-bad/route.ts": ROUTE_BODY(declsBad, "leads"),
  }, (root) => {
    const r = runAgainst(root, GATE);
    assert.equal(r.code, 1, "不合约定的 mapper 名没被拦 → 约定名白给");
    assert.match(r.out, /mn-bad\/route\.ts/);
    assert.doesNotMatch(r.out, /mn-ok\/route\.ts/);
  });
});

test("不误伤：变量初始化式里的「请求参数」snake 键不计为响应键", () => {
  // listRows({ user_id: 1 }) 是入参（口径允许 snake）；出口本身靠登记收敛，不靠猜测
  withFixture("fieldname-reqparam", {
    "src/app/api/rp/route.ts": ROUTE_BODY(
      "  const rows = await ctx.noticeRepo.listRows({ user_id: 1, page_size: 20 });",
      "rows",
    ),
  }, (root) => {
    const r = runAgainst(root, GATE, { API_FIELD_NAMING_OPAQUE_EXTRA: "src/app/api/rp/route.ts#rows" });
    assert.equal(r.code, 0, `请求参数被当成响应键：\n${r.out}`);
    assert.doesNotMatch(r.out, /\[SNAKE-KEY\]/);
  });
});
