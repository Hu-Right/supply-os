import path from "node:path";
import {
  scanRoot,
  relOf,
  readText,
  collectRouteFiles,
  reportAndExit,
  staleAllowlistEntries,
} from "./lib/api-contract.mjs";

/**
 * 架构红线守卫：成功响应必须返回裸载荷，禁止 2xx 返回 {code:0, message, data} 信封。
 * @see ARCHITECTURE.md「API 契约规范（三条红线）」——成功默认裸载荷(2xx)，错误 envelope {code,message}(4xx/5xx)
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
 * 扫描/报告口径走共享骨架 `lib/api-contract.mjs`（四条 API 契约门禁同一口径）。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_CONTRACT_SCAN_ROOT=<path>  把扫描根换到 <path>/src/app/api（自测 fixture 用；默认仓库根）
 */

// 递减白名单（posix、相对仓库根的 route.ts）。2026-10 信封迁移已归零——保持空集，新代码不得再引入成功信封。
const ALLOWLIST = new Set([]);

// 成功信封哨兵：code: 0（后不接更多数字，避免 code: 0.5 / 00 误判）
const ENVELOPE_RE = /\bcode:\s*0\b(?![\d.])/;

const repoRoot = scanRoot();
const apiDir = path.join(repoRoot, "src", "app", "api");

const violations = [];
const offenderFiles = new Set();
let scanned = 0;

for (const file of collectRouteFiles(apiDir)) {
  scanned++;
  const rel = relOf(repoRoot, file);
  const lines = readText(file).split(/\r?\n/);
  let hit = false;
  lines.forEach((line, i) => {
    if (!ENVELOPE_RE.test(line)) return;
    hit = true;
    if (ALLOWLIST.has(rel)) return;
    violations.push(`[ENVELOPE] ${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
  if (hit) offenderFiles.add(rel);
}

reportAndExit({
  tag: "API-SUCCESS-SHAPE",
  title: "成功信封",
  problems: violations,
  shown: 30,
  stale: staleAllowlistEntries(ALLOWLIST, offenderFiles, repoRoot),
  guidance: "成功请返回裸载荷（apiOk / NextResponse.json(data)），失败用 {code,message}(4xx/5xx)。新代码不得再引入成功信封。",
  okLine: `✓ API 成功信封红线通过（扫描 ${scanned} 个 route.ts，递减白名单 ${ALLOWLIST.size} 项，无新增成功信封）`,
});
