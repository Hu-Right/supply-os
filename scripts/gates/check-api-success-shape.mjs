import fs from "node:fs";
import path from "node:path";

/**
 * 架构红线守卫：成功响应必须返回裸载荷，禁止 2xx 返回 {code:0, message, data} 信封。
 * @see ARCHITECTURE.md 约定「新 API 路由：成功默认裸载荷(2xx)，错误 envelope {code,message}(4xx/5xx)」
 *
 * 背景：response.ts / route-handler 已确立「成功裸载荷 / 失败 {code,message}」契约，
 *   api() 对 2xx 不解包，信封要求每个消费方手写 res.data，漏写即静默拿到整个信封。
 *   历史上曾把存量信封登记为**递减白名单**冻结（曾包 AI / RFQ / 通知 / 企业 等 26 个），
 *   2026-10 信封迁移已全部完成——白名单现归零，本门禁对任何 2xx 成功信封零容忍：
 *   任何 route.ts 出现 `code: 0`（成功哨兵）即失败。若未来确有合理例外才从空集重新登记（应尽量避免）。
 *
 * 判定：`code: 0` 是成功信封唯一哨兵——错误信封用 {code: err.code}（非 0 业务码），
 *   故仅 `code: 0` 命中即为违规。错误 envelope（{code:40004,...}）与裸载荷均不误报。
 *
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_SHAPE_SCAN_ROOT=<path>  把扫描根换到 <path>/src/app/api（自测 fixture 用；默认仓库根）
 */

// 递减白名单（posix、相对仓库根的 route.ts）。2026-10 信封迁移已归零——保持空集，新代码不得再引入成功信封。
const ALLOWLIST = new Set([]);

// 成功信封哨兵：code: 0（后不接更多数字，避免 code: 0.5 / 00 误判）
const ENVELOPE_RE = /\bcode:\s*0\b(?![\d.])/;

const repoRoot = process.env.API_SHAPE_SCAN_ROOT || process.cwd();
const apiDir = path.join(repoRoot, "src", "app", "api");

function collectRouteFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) out.push(...collectRouteFiles(full));
    else if (item === "route.ts") out.push(full);
  }
  return out;
}

const violations = [];
let scanned = 0;
for (const file of collectRouteFiles(apiDir)) {
  scanned++;
  const rel = path.relative(repoRoot, file).split(path.sep).join("/");
  if (ALLOWLIST.has(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ENVELOPE_RE.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
}

// 白名单卫生：登记但已不含信封的文件（迁移后忘删）——提示但不失败。
const stale = [];
for (const rel of ALLOWLIST) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    stale.push(`${rel}（文件已不存在）`);
    continue;
  }
  if (!ENVELOPE_RE.test(fs.readFileSync(abs, "utf8"))) stale.push(`${rel}（已裸载荷，可从白名单删除）`);
}

if (violations.length) {
  console.error(`✖ [ENVELOPE] API 成功信封红线：${violations.length} 处 2xx 返回 {code:0,message,data}（详见 ARCHITECTURE.md）：`);
  for (const v of violations.slice(0, 30)) console.error(`  · ${v}`);
  if (violations.length > 30) console.error(`  · …另有 ${violations.length - 30} 处`);
  console.error("  成功请返回裸载荷（apiOk / NextResponse.json(data)），失败用 {code,message}(4xx/5xx)。新代码不得再引入成功信封。");
  process.exit(1);
}

if (stale.length) {
  console.warn(`⚠ [ENVELOPE] 白名单待收敛 ${stale.length} 项（不影响通过，请随迁移删除对应行）：`);
  for (const s of stale) console.warn(`  · ${s}`);
}
console.log(`✓ API 成功信封红线通过（扫描 ${scanned} 个 route.ts，递减白名单 ${ALLOWLIST.size} 项，无新增成功信封）`);
