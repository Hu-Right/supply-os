#!/usr/bin/env node
/**
 * 错误码门禁（ADR-0021 §3）
 * @module scripts/gates/check-error-codes
 * @description 五条规则：
 *   R1 裸数字错误码拦截：routeError/new RouteError 第二参禁止数字字面量（必须 EC_ 常量）；
 *   R2 catalog 完备性：api.ts 每个 EC_ 导出必须在 catalog 登记；
 *   R3 catalog↔error-map 同步：error-map CODE_MAP 键集 ⊆ catalog 码集；
 *   R4 蛇形旧拼写拦截：core_locked（camelCase coreLocked 为唯一合法形）；
 *   R5 手写错误 envelope 白名单：Response.json({ code: ... }) 仅允许 chat/stream、payment/notify
 *      （SSE 前置与网关协议响应已迁移 errorEnvelope，新出现即拦截）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FAILS = [];

function walk(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(p, acc);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
      acc.push(p);
    }
  }
  return acc;
}

const srcFiles = walk(join(ROOT, "src"), []);

// ── R1 裸数字错误码 ──────────────────────────────────────────────────────────
for (const f of srcFiles) {
  const s = readFileSync(f, "utf8");
  const lines = s.split("\n");
  lines.forEach((line, i) => {
    if (/routeError\(\s*(?:40\d|41\d|42\d|50\d)\s*,\s*\d{4,5}\b/.test(line) || /new RouteError\(\s*(?:40\d|41\d|42\d|50\d)\s*,\s*\d{4,5}\b/.test(line)) {
      FAILS.push(`R1 裸数字错误码 ${f.replace(ROOT, "")}:${i + 1} — ${line.trim().slice(0, 90)}`);
    }
  });
}

// ── R2 catalog 完备性 ────────────────────────────────────────────────────────
const apiSrc = readFileSync(join(ROOT, "src/shared/constants/api.ts"), "utf8");
const catalogSrc = readFileSync(join(ROOT, "src/shared/errors/catalog.ts"), "utf8");
const exportedCodes = [...apiSrc.matchAll(/export const (EC_[A-Z0-9_]+) = (\d+)/g)];
for (const [, name, code] of exportedCodes) {
  if (!catalogSrc.includes(`[EC_${name.slice(3)}]`)) {
    FAILS.push(`R2 catalog 缺登记 ${name}(${code})`);
  }
}
const catalogKeys = [...catalogSrc.matchAll(/\[EC_([A-Z0-9_]+)\]:/g)].map((m) => `EC_${m[1]}`);
const exportedNames = exportedCodes.map(([, name]) => name);
for (const key of catalogKeys) {
  if (!exportedNames.includes(key)) {
    FAILS.push(`R2 catalog 中的 ${key} 不是 api.ts 导出`);
  }
}

// ── R3 error-map CODE_MAP 键集 ⊆ catalog ────────────────────────────────────
const mapSrc = readFileSync(join(ROOT, "src/core/http/error-map.ts"), "utf8");
const codeMapKeys = [...mapSrc.matchAll(/\[EC_([A-Z0-9_]+)\]: \{ kind:/g)].map((m) => `EC_${m[1]}`);
const catalogImported = catalogSrc.match(/import \{([^}]*)\} from "\.\.\/constants\/api";/)?.[1] ?? "";
for (const key of codeMapKeys) {
  if (!exportedNames.includes(key)) {
    FAILS.push(`R3 error-map CODE_MAP 的 ${key} 不是 api.ts 导出`);
    continue;
  }
  const code = exportedCodes.find(([, n]) => n === key)?.[2];
  if (code && !catalogKeys.includes(key)) {
    FAILS.push(`R3 error-map CODE_MAP 的 ${key}(${code}) 未登记 catalog`);
  }
}

// ── R4 蛇形旧拼写（仅限错误抛错上下文；列表数据载荷的 core_locked 字段不属错误契约）──
for (const f of srcFiles) {
  const s = readFileSync(f, "utf8");
  const lines = s.split("\n");
  lines.forEach((line, i) => {
    if (/(?:routeError|new RouteError|errorEnvelope)\([^)]*core_locked/.test(line) || /detail\.core_locked/.test(line)) {
      FAILS.push(`R4 蛇形 core_locked ${f.replace(ROOT, "")}:${i + 1} — 统一 camelCase coreLocked`);
    }
  });
}

// ── R5 手写错误 envelope 白名单 ──────────────────────────────────────────────
const HANDWRITTEN_ALLOW = ["crm/chat/stream/route.ts", "payment/notify/route.ts"];
for (const f of walk(join(ROOT, "src/app/api"), [])) {
  const norm = f.replace(/\\\\/g, "/");
  const s = readFileSync(f, "utf8");
  if (/NextResponse\.json\(\s*\{\s*code:\s*(?:\d{4,5}|EC_[A-Z0-9_]+)/.test(s)) {
    if (!HANDWRITTEN_ALLOW.some((w) => norm.includes(w))) {
      FAILS.push(`R5 手写错误 envelope（应走 withRoute/routeError 或 errorEnvelope）${f.replace(ROOT, "")}`);
    }
  }
}

if (FAILS.length > 0) {
  console.error(`[check-error-codes] ✗ ${FAILS.length} 项违规：`);
  for (const f of FAILS) console.error("  " + f);
  process.exit(1);
}
console.log(`[check-error-codes] ✓ 5 规则全过（EC_ 导出 ${exportedNames.length}，catalog ${catalogKeys.length}）`);
