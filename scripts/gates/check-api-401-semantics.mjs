import path from "node:path";
import {
  scanRoot,
  relOf,
  readText,
  collectTsFiles,
  callSites,
  lineOf,
  reportAndExit,
} from "./lib/api-contract.mjs";

/**
 * 架构红线守卫：HTTP 401 语义单一化（③ 401 收敛，2026-10-27）。
 * @see ARCHITECTURE.md「API 契约规范（三条红线）」；api-client 以 401 触发 Token 刷新
 *
 * 背景：api-client 把 `res.status === 401` 当作「access token 过期 → 刷新重试 / 失败即登出」的信号。
 *   历史上 401 被复用于「登录凭证被拒」「刷新令牌失效」「SSE 票券过期」等**会话已死/凭据被拒**语义，
 *   既会误触发刷新/登出链路，又让 401 含义漂移。治本口径：
 *     - 401 仅表示「未登录 / 需要认证（凭据缺失或过期，可刷新）」——码 ∈ 允许集；
 *     - 登录凭证被拒、刷新令牌无效/过期/撤销 = 会话已死，改 403 + 专属业务码（errAccountIssue/errSessionExpired）。
 *   会话已死改 403 后客户端行为不变：api-client 的 tryRefreshToken 对 `!res.ok` 一律返回 null，
 *   仍然清凭据 + 广播 `supply-os:unauthorized`，只是不再占用「可刷新」的 401 语义。
 *   对外 API Key 边界（X-API-Key）401 表「缺少/无效凭据」，属标准 REST 语义、不经本刷新链路，一并放行。
 *
 * 判定：扫描 .ts 里所有「以 401 发错误」的点（routeError/apiFail/new RouteError 首参 401、
 *   X.json({code..},{status:401})、throw {status:401, code:..}），其业务码必须是**允许集内的 EC_ 常量名**；
 *   裸数字码同判违规（与①「禁裸数字」同口径，码值只在 shared/constants/api 一处定义）。
 *   排除：api-client（客户端构造 ApiError，非服务端发 401）、response.ts（apiFail 泛化包装定义）。
 *
 * 扫描/报告口径走共享骨架 `lib/api-contract.mjs`（四条 API 契约门禁同一口径）。
 * 违规 exit 1，供 npm run lint 与 CI 拦截。
 *   API_CONTRACT_SCAN_ROOT=<path>  把扫描根换到 <path>（自测 fixture 用；默认仓库根）
 */

// 401 允许承载的业务码（EC_ 常量名，语义 = 未登录/需要认证/外部 API Key 边界）。
const ALLOW_401 = new Set([
  "EC_AUTH_REQUIRED", // 未登录、SSE 票券无效（可刷新）
  "EC_USER_REQUIRED", // service 层「需要登录才能取该资源」
  "EC_API_KEY_INVALID", // 开放 API：缺少/无效 X-API-Key
  "EC_API_KEY_EXPIRED", // 开放 API：X-API-Key 已过期
]);

// 不发 401 语义、只定义包装或消费响应的文件（相对仓库根）。
const EXCLUDE = new Set([
  "src/core/http/api-client.ts",
  "src/lib/api/response.ts",
]);

const EC_NAME_RE = /^EC_[A-Z0-9_]+$/;
const NUMERIC_RE = /^\d+$/;

const repoRoot = scanRoot();
const srcDir = path.join(repoRoot, "src");

/** 允许集外的 401 码 → 违规描述（裸数字单列一类，指回错误码 SSOT） */
function classifyCode(codeTok, rel, ln, where) {
  if (EC_NAME_RE.test(codeTok)) {
    if (ALLOW_401.has(codeTok)) return null;
    return `[401] ${rel}:${ln}: ${where} 用 401 + ${codeTok}（会话已死/凭据被拒应改 403；401 只允许 ${[...ALLOW_401].join(" / ")}）`;
  }
  if (NUMERIC_RE.test(codeTok)) {
    return `[401-BARE] ${rel}:${ln}: ${where} 的 401 码写成裸数字 ${codeTok}（须引用 EC_ 常量，见错误码 SSOT 红线）`;
  }
  return `[401] ${rel}:${ln}: ${where} 的 401 业务码 "${codeTok || "(缺失)"}" 不是允许集内的 EC_ 常量`;
}

const problems = [];
let scanned = 0;

const ERR_CALL = /(?:\brouteError|\bapiFail|new\s+RouteError)\s*\(/;
const JSON_CALL = /(?:NextResponse|Response)\.json\s*\(/;
const THROW_OBJ = /throw\s*\{[^}]*\}/gs; // matchAll 要求 g 标志；s 让对象字面量跨行也能匹到

for (const file of collectTsFiles(srcDir)) {
  const rel = relOf(repoRoot, file);
  if (EXCLUDE.has(rel)) continue;
  scanned++;
  const src = readText(file);

  // (1) routeError / apiFail / new RouteError 首参为 401 → 第二参业务码须在允许集
  for (const { open, args } of callSites(src, ERR_CALL)) {
    const parts = args.split(",");
    if ((parts[0] || "").trim() !== "401") continue;
    const bad = classifyCode((parts[1] || "").trim(), rel, lineOf(src, open), "routeError/RouteError");
    if (bad) problems.push(bad);
  }

  // (2) NextResponse/Response.json({ code: C }, { status: 401 }) → C 须在允许集
  for (const { open, args } of callSites(src, JSON_CALL)) {
    if (!/\bstatus:\s*401\b/.test(args)) continue;
    const cm = args.match(/\bcode:\s*([A-Za-z_][\w]*)/);
    const bad = classifyCode(cm ? cm[1] : "", rel, lineOf(src, open), "响应 status:401");
    if (bad) problems.push(bad);
  }

  // (3) throw { status: 401, code: C } （service 抛 plain 对象）→ C 须在允许集
  for (const t of src.matchAll(THROW_OBJ)) {
    const obj = t[0];
    if (!/\bstatus:\s*401\b/.test(obj)) continue;
    const cm = obj.match(/\bcode:\s*([A-Za-z_][\w]*)/);
    const bad = classifyCode(cm ? cm[1] : "", rel, lineOf(src, t.index), "throw status:401");
    if (bad) problems.push(bad);
  }
}

reportAndExit({
  tag: "API-401-SEMANTICS",
  title: "401 语义",
  problems,
  guidance: "准则：401 仅表示『未登录/需要认证(可刷新)』，码须是允许集内的 EC_ 常量；会话已死/凭据被拒用 403 + 专属码。",
  okLine: `✓ API 401 语义红线通过（扫描 ${scanned} 个 .ts，401 仅承载认证语义）`,
});
