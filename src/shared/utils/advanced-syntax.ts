/**
 * 高级搜索语法 — 前后端共享纯函数（单一事实源）
 *
 * 语法（v1，spec §2）：`-词` 排除；`"词组"` 精确短语；其余为普通包含词
 * （空格分隔，Meili matchingStrategy:"all" / 现网兜底均按 AND 口径消费）。
 * OR 与字段限定明确不做。
 *
 * 解析规则：
 * - 引号必须成对，未闭合引号剥引号后按普通词（宽容解析）
 * - 孤立 `-` 忽略；排除词去前导 `-`
 * - toBooleanModeQuery 输出作为 MySQL 绑定参数传入 AGAINST，无注入面；
 *   词内 `"` 剥除防 BOOLEAN MODE 语法破坏
 *
 * Meili spike 结论（Task 1）：Meili 1.52.0 实测支持 -排除词与"短语"（临时索引验证：排除正确过滤、短语乱序归零），排除模式全平台启用，UI 无需置灰（2026-09-27 实测）。
 */
export type TermMode = "include" | "exclude" | "phrase";

export interface TermRow { id: number; term: string; mode: TermMode; }
export interface ParsedQuery { includes: string[]; excludes: string[]; phrases: string[]; }

/** 前端关键词行上限（含空行，提交时空行过滤） */
export const MAX_KEYWORD_ROWS = 8;

/** 前端合成 q 的总长上限，与服务端 params.ts slice(0,200) 对齐 */
const MAX_Q_LENGTH = 200;

const TOKEN_RE = /"([^"]*)"|(\S+)/g;

const stripQuotes = (s: string) => s.replace(/^"+|"+$/g, "");

export function parseAdvancedQuery(q: string): ParsedQuery {
  const includes: string[] = [];
  const excludes: string[] = [];
  const phrases: string[] = [];
  const src = String(q ?? "");
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(src))) {
    if (m[1] !== undefined) {
      const phrase = m[1].trim();
      if (phrase) phrases.push(phrase);
      continue;
    }
    const token = m[2];
    if (token.length > 1 && token.startsWith("-")) {
      const word = stripQuotes(token.slice(1)).trim();
      if (word) excludes.push(word);
      continue;
    }
    // 剥前导 +：用户直觉写的 `+词` 等价于默认包含（空格已是 AND），不剥会漏进词面，
    // 降级时拼成 `++词` 破坏 MySQL 布尔查询、且译文 LIKE 会去找字面 + 号恒不命中
    const word = stripQuotes(token).replace(/^\++/, "").trim();
    if (word && word !== "-") includes.push(word);
  }
  return { includes, excludes, phrases };
}

export function hasAdvancedSyntax(q: string): boolean {
  const p = parseAdvancedQuery(q);
  return p.excludes.length > 0 || p.phrases.length > 0;
}

export function stripAdvancedSyntax(q: string): string {
  const p = parseAdvancedQuery(q);
  // 降级保留短语词面（仅剥引号），排除词整个丢弃 — 与单测口径一致
  return [...p.includes, ...p.phrases].join(" ");
}

export function toBooleanModeQuery(parsed: ParsedQuery): string {
  const clean = (w: string) => w.replace(/"/g, "");
  return [
    ...parsed.includes.map((w) => `+${clean(w)}`),
    ...parsed.excludes.map((w) => `-${clean(w)}`),
    ...parsed.phrases.map((p) => `"${p.replace(/"/g, "")}"`),
  ].join(" ");
}

export interface AdvancedQueryDecision { q: string; degraded: boolean; }

/** unified-search 路由的权威判定：无语法原样；有语法看权益；无权益剥离降级 */
export function resolveAdvancedQuery(rawQ: string, entitled: boolean): AdvancedQueryDecision {
  const q = String(rawQ ?? "");
  if (!q.trim() || !hasAdvancedSyntax(q)) return { q, degraded: false };
  if (entitled) return { q, degraded: false };
  return { q: stripAdvancedSyntax(q), degraded: true };
}

export function composeQ(qInput: string, rows: TermRow[]): string {
  const parts = [String(qInput ?? "").trim()];
  for (const r of rows ?? []) {
    const term = String(r.term ?? "").trim();
    if (!term) continue;
    if (r.mode === "exclude") parts.push(`-${term}`);
    else if (r.mode === "phrase") parts.push(`"${term.replace(/"/g, "")}"`);
    else {
      // include：一行/一词组项是一个字面单位，规范化到 q 语言（与手动 include 行同口径）
      const cleaned = term.replace(/"/g, "");
      if (!cleaned) continue;
      if (/\s/.test(cleaned)) parts.push(`"${cleaned}"`); // 多词 → 整词短语
      else {
        const word = cleaned.replace(/^[-+]+/, "");      // 单词 → 去前导 - 与 +，防泄漏成排除或疩形 ++ 布尔串
        if (word) parts.push(word);
      }
    }
  }
  return parts.filter(Boolean).join(" ").slice(0, MAX_Q_LENGTH);
}

export function parseQ(q: string): { plain: string; rows: TermRow[] } {
  const parsed = parseAdvancedQuery(q);
  let nextId = 1;
  const rows: TermRow[] = [
    ...parsed.excludes.map((term) => ({ id: nextId++, term, mode: "exclude" as const })),
    ...parsed.phrases.map((term) => ({ id: nextId++, term, mode: "phrase" as const })),
  ];
  return { plain: parsed.includes.join(" "), rows };
}
