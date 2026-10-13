/**
 * 门禁自测：证明 AS1~AS4 真会拦，而不是永远绿。
 * 夹具模式（ATTR_SSOT_FIXTURE）完全不连库 —— CI 上没有生产库，这条自测必须在 CI 里成立。
 * 用法：node --test tests/gates/check-attribution-ssot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-attribution-ssot.ts");
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function run(env = {}) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [TSX, GATE], {
        encoding: "utf8",
        env: { ...process.env, ...env },
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function fixture(data) {
  const file = join(mkdtempSync(join(tmpdir(), "attr-ssot-")), "f.json");
  writeFileSync(file, JSON.stringify(data), "utf8");
  return file;
}

const CHAIN = "UGT-02,UGT-0204,UGT-020402,UGT-02040201,UGT-0204020102";
const chain = (pk) => CHAIN.split(",").map((code) => ({ pk, code, source: "legacy_tag" }));

test(
  "真实库全量对拍（需显式开启；补灌前它本该红）",
  { skip: process.env.ATTR_SSOT_REAL_DB === "1" ? false : "CI 无生产库；本地有隧道时用 ATTR_SSOT_REAL_DB=1 跑" },
  () => {
    // 必须清掉父 shell 可能残留的夹具/表名：否则这条“真实库对拍”会静默变成跑夹具，结论作废
    const r = run({ ATTR_SSOT_FIXTURE: "", ATTR_SSOT_TABLE: "" });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /落点表契约通过/);
  },
);

test("AS2：少一个叶子必须报错，并点名该补的码", () => {
  const f = fixture({ landings: chain(725).slice(0, -1), columns: [{ pk: 725, col: CHAIN }] });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 1, "快照落后没被拦住");
  assert.match(r.out, /AS2/);
  assert.match(r.out, /UGT-0204020102/);
});

test("AS1：混源必须报错", () => {
  const f = fixture({
    landings: [...chain(1), { pk: 1, code: "UGT-0204020103", source: "ai_content" }],
    columns: [{ pk: 1, col: CHAIN }],
  });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 1, "混源没被拦住");
  assert.match(r.out, /AS1/);
});

test("AS4：有列值零落点必须报错", () => {
  const f = fixture({ landings: [], columns: [{ pk: 77, col: CHAIN }] });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 1, "断供没被拦住");
  assert.match(r.out, /AS4/);
});

test("AS5：公告只剩 ai_content 行而列值声明的叶子无承载，必须报错（撞键换源）", () => {
  const f = fixture({
    landings: [{ pk: 725, code: "UGT-0204020103", source: "ai_content" }],
    columns: [{ pk: 725, col: CHAIN }],
  });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 1, "换源没被拦住");
  assert.match(r.out, /AS5/);
});

test("AI 侧公告不误报（列值还没重派生是正常中间态）", () => {
  const f = fixture({ landings: [{ pk: 3, code: "UGT-0204020102", source: "ai_content" }], columns: [] });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ai_content 公告 1/);
});

test("干净夹具必须绿（防止门禁只会红、不会绿）", () => {
  const f = fixture({ landings: chain(725), columns: [{ pk: 725, col: CHAIN }] });
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /落点表契约通过/);
});

test("坏夹具宁可红，不能当“干净”打印通过", () => {
  const f = fixture({});
  const r = run({ ATTR_SSOT_FIXTURE: f });
  assert.equal(r.code, 1, "缺键夹具被当成干净放行了");
  assert.match(r.out, /夹具/);
});
