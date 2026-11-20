/**
 * 行业智能推断（UGT 行业树内匹配）与行业标签装配
 *
 * @module lib/services/industry/infer
 *
 * @description 关键词 → 行业节点候选，供设置页「所属行业」选择器使用（只产候选，不自动回填）。
 *              行业树约 2k 节点且无 FULLTEXT，直接对 name_zh/name_en 做 LIKE（用户输入先转义
 *              % _），再在应用层打分排序；门类（section）太粗，不进候选（选了等于没选）。
 *              候选附「自门类到自身」的路径名，用于前端面包屑——只撞到一个孤立节点名，
 *              用户无法判断它挂在哪。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  INDUSTRY_CODE_PREFIX,
  industryAncestorCodes,
  industryLevelOf,
  isIndustryCode,
} from "@/shared/constants/industry-code";
import { escapeLikeWildcard } from "@/lib/utils/normalize";

const CANDIDATE_LIMIT = 8;
const SCAN_LIMIT = 24;

export interface IndustryInferCandidate {
  code: string;
  nameZh: string;
  nameEn: string;
  /** section|division|group|subclass|extension */
  level: string;
  /** 0~1 粗分，仅用于排序与徽章档位 */
  score: number;
  /** 自门类到自身的名称链（zh 优先、缺失回落 en） */
  path: string[];
}

export interface IndustryTag {
  code: string;
  nameZh: string;
  nameEn: string;
  level: string;
  path: string[];
}

/** 名称匹配打分：完全相等 > 前缀 > 包含；英文一律小写比较 */
export function scoreIndustryName(nameZh: string, nameEn: string, keyword: string): number {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return 0;
  const zh = nameZh.trim();
  const en = nameEn.trim().toLowerCase();
  if (zh && zh.toLowerCase() === kw) return 1;
  if (en && en === kw) return 1;
  if (zh && zh.toLowerCase().startsWith(kw)) return 0.9;
  if (en && en.startsWith(kw)) return 0.9;
  if (zh && zh.toLowerCase().includes(kw)) return 0.75;
  if (en && en.includes(kw)) return 0.7;
  return 0;
}

/** 层级深浅：越深越具体，分数相同时优先 */
function levelRank(level: string): number {
  switch (level) {
    case "subclass":
      return 4;
    case "extension":
      return 4;
    case "group":
      return 3;
    case "division":
      return 2;
    default:
      return 1;
  }
}

/** 别名出口：调用方只关心「把候选路径补齐」，避免再引一次常量模块 */
export function industryChain(code: string): string[] {
  return industryAncestorCodes(code);
}

async function attachPaths(pool: Pool, candidates: IndustryInferCandidate[]): Promise<void> {
  if (candidates.length === 0) return;
  const codes = new Set<string>();
  for (const c of candidates) for (const a of industryChain(c.code)) codes.add(a);
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en FROM industry_nodes
      WHERE status = 1 AND code IN (${[...codes].map(() => "?").join(",")})`,
    [...codes],
  );
  const nameByCode = new Map<string, string>();
  for (const row of rows as RowDataPacket[]) {
    const name = String(row.name_zh ?? "").trim() || String(row.name_en ?? "").trim();
    if (name) nameByCode.set(String(row.code ?? ""), name);
  }
  for (const c of candidates) {
    c.path = industryChain(c.code)
      .map((code) => nameByCode.get(code) ?? "")
      .filter(Boolean);
  }
}

/**
 * 关键词 → 行业候选（score 降序，截 8 条）。
 * 门类不出候选：`UGT-I-03 制造业` 这种粒度做归类没有区分度。
 */
export async function inferIndustryNodes(pool: Pool, q: string): Promise<IndustryInferCandidate[]> {
  const keyword = String(q ?? "").trim().slice(0, 60);
  if (keyword.length < 1) return [];
  const like = `%${escapeLikeWildcard(keyword)}%`;
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en, level
       FROM industry_nodes
      WHERE status = 1 AND level <> 'section' AND (name_zh LIKE ? OR name_en LIKE ?)
      ORDER BY CHAR_LENGTH(name_zh) ASC, code ASC
      LIMIT ${SCAN_LIMIT}`,
    [like, like],
  );

  const scored: IndustryInferCandidate[] = [];
  for (const row of rows as RowDataPacket[]) {
    const code = String(row.code ?? "");
    if (!isIndustryCode(code)) continue;
    const nameZh = String(row.name_zh ?? "").trim();
    const nameEn = String(row.name_en ?? "").trim();
    const score = scoreIndustryName(nameZh, nameEn, keyword);
    if (score <= 0) continue;
    scored.push({
      code,
      nameZh: nameZh || nameEn,
      nameEn: nameEn || nameZh,
      level: String(row.level ?? industryLevelOf(code) ?? ""),
      score,
      path: [],
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      levelRank(b.level) - levelRank(a.level) ||
      a.nameZh.length - b.nameZh.length ||
      a.code.localeCompare(b.code),
  );

  const top = scored.slice(0, CANDIDATE_LIMIT);
  await attachPaths(pool, top);
  return top;
}

/** 行业码 → 标签（名称 + 路径）；码不存在或已停用时返回 null */
export async function loadIndustryTag(pool: Pool, code: string | null | undefined): Promise<IndustryTag | null> {
  const normalized = String(code ?? "").trim();
  if (!isIndustryCode(normalized)) return null;
  const chain = industryChain(normalized);
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en, level FROM industry_nodes
      WHERE status = 1 AND code IN (${chain.map(() => "?").join(",")})`,
    chain,
  );
  const byCode = new Map<string, { zh: string; en: string; level: string }>();
  for (const row of rows as RowDataPacket[]) {
    byCode.set(String(row.code ?? ""), {
      zh: String(row.name_zh ?? "").trim(),
      en: String(row.name_en ?? "").trim(),
      level: String(row.level ?? ""),
    });
  }
  const self = byCode.get(normalized);
  if (!self) return null;
  return {
    code: normalized,
    nameZh: self.zh || self.en,
    nameEn: self.en || self.zh,
    level: self.level || industryLevelOf(normalized) || "",
    path: chain.map((c) => byCode.get(c)?.zh || byCode.get(c)?.en || "").filter(Boolean),
  };
}

/** 便于测试/展示：行业码是否属于行业树（码形） */
export function isIndustryNodeCode(code: unknown): code is string {
  return typeof code === "string" && code.startsWith(INDUSTRY_CODE_PREFIX) && isIndustryCode(code);
}