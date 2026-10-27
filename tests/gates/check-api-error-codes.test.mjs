/**
 * 门禁脚本自测：证明「错误码红线」三重拦截真的会拦，而不是永远绿。
 * 口径同 check-api-success-shape（用环境变量把扫描根换成 fixture）。
 * 用法：node --test tests/gates/check-api-error-codes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gates", "check-api-error-codes.mjs");

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

/** 在临时目录里造仓库骨架：<root>/src/...（按相对路径批量写文件） */
function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "errcode-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

const CONSTS_OK = 'export const EC_ALPHA = 41001;\nexport const EC_BETA = 41002;\n';
const MAP_OK = 'const CODE_MAP = {\n  [EC_ALPHA]: { kind: "business", key: "errAlpha" },\n};\n';
const ROUTE_CLEAN = [
  'import { routeError } from "@/lib/middleware/route-handler";',
  "export const GET = () => {",
  '  routeError(400, EC_ALPHA, "alpha err");',
  "};",
].join("\n");

test("真实 src/app/api 应通过（全域治本后无裸数字、码全部登记）", () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /API 错误码红线通过/);
});

test("[BARE]：非白名单 route.ts 用裸数字 routeError 必须被拦", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": CONSTS_OK,
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/foo/route.ts": [
      "import { routeError } from \"@/lib/middleware/route-handler\";",
      "export const GET = () => {",
      '  routeError(400, 40030, "裸数字");',
      "};",
    ].join("\n"),
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 1, "裸数字没有被拦住");
    assert.match(r.out, /\[BARE\]/);
    assert.match(r.out, /foo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[UNIQUE]：constants 同值多常量必须被拦", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": 'export const EC_X = 41001;\nexport const EC_Y = 41001;\n',
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/foo/route.ts": ROUTE_CLEAN,
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 1, "重复码没有被拦住");
    assert.match(r.out, /\[UNIQUE\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[UNREGISTERED]：非 auth 路由引用未登记进 error-map 的 EC 码必须被拦（Rule C 全域）", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": CONSTS_OK,
    // error-map 只登记 EC_ALPHA，EC_BETA 未登记
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/notices/y/route.ts": [
      "import { routeError } from \"@/lib/middleware/route-handler\";",
      "export const GET = () => {",
      '  routeError(400, EC_BETA, "未登记码");',
      "};",
    ].join("\n"),
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 1, "未登记非 auth 码没有被拦住");
    assert.match(r.out, /\[UNREGISTERED\]/);
    assert.match(r.out, /EC_BETA/);
    assert.match(r.out, /notices\/y/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("[BARE]：parseJson codeByPath 使用等于已知 EC 值的裸数字必须被拦（Rule B-2）", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": CONSTS_OK,
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/auth/z/route.ts": [
      "import { parseJson } from \"@/lib/middleware/route-handler\";",
      "export const POST = async (req) => {",
      "  await parseJson(req, schema, { field: 41002 });",
      "};",
    ].join("\n"),
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 1, "codeByPath 裸码没有被拦住");
    assert.match(r.out, /\[BARE\]/);
    assert.match(r.out, /codeByPath/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("干净 fixture：codeByPath 用已登记 EC 常量、无裸数字 → 通过（Rule B-2 不误伤）", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": CONSTS_OK,
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/auth/w/route.ts": [
      "import { parseJson } from \"@/lib/middleware/route-handler\";",
      "export const POST = async (req) => {",
      "  await parseJson(req, schema, { field: EC_ALPHA });",
      "};",
    ].join("\n"),
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("干净 fixture：auth 用已登记 EC 常量、无裸数字 → 通过", () => {
  const root = fixtureRoot({
    "src/shared/constants/api.ts": CONSTS_OK,
    "src/core/http/error-map.ts": MAP_OK,
    "src/app/api/auth/ok/route.ts": ROUTE_CLEAN,
  });
  try {
    const r = run({ API_ERRCODE_SCAN_ROOT: root });
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
