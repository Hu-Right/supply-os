/**
 * API 端点 E2E 覆盖门禁
 *
 * 规则：src/app/api 下每个 route.ts 导出的每个 HTTP 方法，必须满足其一：
 *   ① tests/e2e/api-coverage.spec.ts 中存在对应用例（method + src 端点模板）；
 *   ② tests/e2e/api-coverage.exemptions.json 中显式声明豁免（必须带 reason）。
 *
 * 目的：新增/改名 API 路由后，若不同步补 E2E 冒烟用例，此门禁直接失败，
 *       避免「E2E 只覆盖少数主旅程」的覆盖债继续扩大。
 *
 * 执行：node scripts/gates/check-api-e2e-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "src/app/api");
const SPEC = path.join(ROOT, "tests/e2e/api-coverage.spec.ts");
const EXEMPTIONS = path.join(ROOT, "tests/e2e/api-coverage.exemptions.json");

const errors = [];
const warnings = [];

/** route.ts 文件 → 端点模板（[id] → :id） */
function endpointOf(file) {
  const rel = path.relative(API_DIR, file).split(path.sep).join("/");
  return "/api/" + rel.replace(/\/route\.ts$/, "").replace(/route\.ts$/, "").replace(/\[([^\]]+)\]/g, ":$1").replace(/\/$/, "");
}

/** 从 route.ts 源码提取导出的 HTTP 方法（含 re-export） */
function methodsOf(source) {
  const found = new Set();
  const patterns = [
    /\bexport const (GET|POST|PUT|PATCH|DELETE)\b/g,
    /\bexport\s+(?:async\s+)?function (GET|POST|PUT|PATCH|DELETE)\b/g,
    /\bexport\s*\{\s*(GET|POST|PUT|PATCH|DELETE)\s*\}\s*(?:from\b)?/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) found.add(m[1]);
  }
  return [...found].sort();
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const routes = walk(API_DIR)
  .map((file) => ({
    file,
    endpoint: endpointOf(file),
    methods: methodsOf(fs.readFileSync(file, "utf8")),
  }))
  .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

if (routes.length === 0) {
  errors.push("未发现任何 src/app/api/**/route.ts");
}

// 解析 E2E 用例清单（spec 内的 ApiCase 表）
if (!fs.existsSync(SPEC)) {
  errors.push(`缺少 E2E 覆盖清单：${path.relative(ROOT, SPEC)}`);
}
const specText = fs.existsSync(SPEC) ? fs.readFileSync(SPEC, "utf8") : "";
const covered = new Set();
const caseRe = /\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*path:\s*"[^"]*",\s*auth:\s*"(?:member|none|free)",\s*status:\s*\d+,\s*bodyType:\s*"[a-z]+",\s*src:\s*"([^"]+)"\s*\}/g;
let caseMatch;
while ((caseMatch = caseRe.exec(specText)) !== null) {
  covered.add(`${caseMatch[1]} ${caseMatch[2]}`);
}

// 解析豁免清单（必须带 reason）
const exempt = new Set();
if (!fs.existsSync(EXEMPTIONS)) {
  errors.push(`缺少豁免清单：${path.relative(ROOT, EXEMPTIONS)}`);
} else {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(EXEMPTIONS, "utf8"));
  } catch (e) {
    errors.push(`豁免清单 JSON 解析失败：${e.message}`);
  }
  for (const item of parsed?.exemptions ?? []) {
    const key = `${item.method} ${item.path}`;
    if (!item.method || !item.path) {
      errors.push(`豁免项缺少 method/path：${JSON.stringify(item)}`);
      continue;
    }
    if (!item.reason || !String(item.reason).trim()) {
      errors.push(`豁免项缺少 reason：${key}`);
      continue;
    }
    if (exempt.has(key)) warnings.push(`豁免项重复：${key}`);
    exempt.add(key);
  }
}

// 校验每个路由的每个方法
const endpointSet = new Set(routes.map((r) => r.endpoint));
const missing = [];
for (const route of routes) {
  for (const method of route.methods) {
    const key = `${method} ${route.endpoint}`;
    if (!covered.has(key) && !exempt.has(key)) missing.push(key);
  }
}

// 反向校验：清单里不能出现不存在的端点（防手误/改名后残留）
for (const key of covered) {
  const [, endpoint] = key.split(" ");
  if (!endpointSet.has(endpoint)) errors.push(`用例引用了不存在的端点：${key}`);
}
for (const key of exempt) {
  const [method, endpoint] = key.split(" ");
  const route = routes.find((r) => r.endpoint === endpoint);
  if (!route) errors.push(`豁免引用了不存在的端点：${key}`);
  else if (!route.methods.includes(method)) errors.push(`豁免引用了不存在的方法：${key}`);
}

const totalMethodEndpoints = routes.reduce((n, r) => n + r.methods.length, 0);

if (missing.length > 0) {
  errors.push(
    `以下 ${missing.length} 个 HTTP 端点未在 E2E 冒烟中覆盖（新增用例到 tests/e2e/api-coverage.spec.ts，或写入豁免清单并说明原因）：\n` +
      missing.map((key) => `  - ${key}`).join("\n"),
  );
}

for (const w of warnings) console.warn(`⚠ ${w}`);

if (errors.length > 0) {
  console.error("✖ API E2E 覆盖门禁未通过：");
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}

console.log(
  `✓ API E2E 覆盖门禁通过：${routes.length} 个 route.ts / ${totalMethodEndpoints} 个 HTTP 端点` +
    `（用例 ${covered.size} + 豁免 ${exempt.size}）`,
);
