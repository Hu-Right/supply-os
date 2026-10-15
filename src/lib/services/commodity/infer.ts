/**
 * 品目智能推断（树内匹配）— 主营业务关键词 → UGT 节点候选
 * Commodity smart inference — keyword → backbone node candidates
 *
 * @module lib/services/commodity/infer
 * @description 取代旧 CatalogRepo 的旧字典推断（旧实现读旧品类字典，随字典退役下线）。
 *              召回两档，全部只读骨架树自己的数据：
 *              1. FULLTEXT（ft_backbone_names，ngram）：自然语言模式对 name_zh/name_en 打分，
 *                 中文短词靠 ngram 分词命中；
 *              2. LIKE 兜底：FULLTEXT 零命中（超短词/纯数字型号）时对两列前后通配再捞一轮。
 *              输出按 score 降序截断；所属大类由前端按码前缀切片点亮级联第一级
 *              （2026-10-15 G 码退役，候选不再回表补大类码）。
 *              只产候选、不做自动回填：推断错误会污染行业偏好，置信展示交用户确认。
 *              每条候选附带自 L1 到自身的父级分类链名（attachPaths 一条 IN 点查补齐），
 *              供前端展示面包屑——只撞到一个孤立节点名不足以让用户判断它挂在哪。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { commodityNodeChain, commodityNodeLevel } from "./tree";

/** 一条推断候选：code 就是骨架节点码（可直接当偏好/筛选键） */
export interface CommodityInferCandidate {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 节点层级 1~5（码长即层级） */
  level: number;
  /** 0~1 的粗分，仅用于排序与展示徽章档位 */
  score: number;
  /**
   * 父级分类链名（自 L1 到自身，浅→深，zh 优先、缺失回落 en）。
   * 由 attachPaths 一条 IN 点查补齐；祖先名解析不到时逐项留空并被过滤，不给半成品面包屑。
   */
  path: string[];
}

const CANDIDATE_LIMIT = 8;
/** 低于此分不入候选（与旧口径一致：<0.6 不自动填充，<0.4 不作候选） */
const SCORE_FLOOR = 0.4;

/** FULLTEXT 打分归一：MATCH 分没有固定上限，按「最高分行 = 1」相对归一 */
async function fulltextCandidates(pool: Pool, kw: string): Promise<CommodityInferCandidate[]> {
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en,
            MATCH(name_zh, name_en) AGAINST (? IN NATURAL LANGUAGE MODE) AS raw_score
       FROM crm_commodity_backbone
      WHERE MATCH(name_zh, name_en) AGAINST (? IN NATURAL LANGUAGE MODE)
        AND level >= 2 AND status = 1
      ORDER BY raw_score DESC, level DESC, CHAR_LENGTH(name_zh) ASC
      LIMIT ${CANDIDATE_LIMIT * 2}`,
    [kw, kw],
  );
  const list = rows as RowDataPacket[];
  const max = Number(list[0]?.raw_score ?? 0);
  if (!(max > 0)) return [];
  return list.map((r) => ({
    code: String(r.code ?? ""),
    nameZh: String(r.name_zh ?? ""),
    nameEn: String(r.name_en ?? ""),
    level: commodityNodeLevel(String(r.code ?? "")),
    score: Math.min(1, Number(r.raw_score) / max),
    path: [] as string[],
  }));
}

/** LIKE 兜底：前后通配等值捞名，命中即给 0.5 档（排序价值低，主要保「有得选」） */
async function likeCandidates(pool: Pool, kw: string): Promise<CommodityInferCandidate[]> {
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en
       FROM crm_commodity_backbone
      WHERE level >= 2 AND status = 1 AND (name_zh LIKE ? OR name_en LIKE ?)
      ORDER BY level DESC, CHAR_LENGTH(name_zh) ASC
      LIMIT ${CANDIDATE_LIMIT}`,
    [`%${kw}%`, `%${kw}%`],
  );
  return (rows as RowDataPacket[]).map((r) => ({
    code: String(r.code ?? ""),
    nameZh: String(r.name_zh ?? ""),
    nameEn: String(r.name_en ?? ""),
    level: commodityNodeLevel(String(r.code ?? "")),
    score: 0.5,
    path: [] as string[],
  }));
}

/**
 * 补齐候选的父级分类链名：把 ≤8 条候选的全部祖先码收一张集合，一条 IN 点查回名，
 * 再按 chainOfNode 的浅→深顺序拼回。走 code（uk_code）等值，不载整树。
 * name_zh 优先、空则回落 name_en（L1~L3 的 en 实测全空，zh 恒有）；两皆空的项丢弃。
 */
async function attachPaths(pool: Pool, cands: CommodityInferCandidate[]): Promise<void> {
  if (cands.length === 0) return;
  const codeSet = new Set<string>();
  for (const c of cands) for (const a of commodityNodeChain(c.code)) if (a) codeSet.add(a);
  const codes = [...codeSet];
  if (codes.length === 0) return;
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en FROM crm_commodity_backbone
      WHERE code IN (${codes.map(() => "?").join(",")}) AND status = 1`,
    codes,
  );
  const nameByCode = new Map<string, string>();
  for (const r of rows as RowDataPacket[]) {
    const name = String(r.name_zh ?? "").trim() || String(r.name_en ?? "").trim();
    if (name) nameByCode.set(String(r.code ?? ""), name);
  }
  for (const c of cands) {
    c.path = commodityNodeChain(c.code).map((k) => nameByCode.get(k) ?? "").filter(Boolean);
  }
}

/** 关键词 → 候选列表（score 降序，截 CANDIDATE_LIMIT） */
export async function smartInferCommodityNodes(
  pool: Pool,
  q: string,
): Promise<CommodityInferCandidate[]> {
  const kw = q.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!kw) return [];

  let candidates = await fulltextCandidates(pool, kw);
  if (candidates.length === 0) {
    try {
      candidates = await likeCandidates(pool, kw);
    } catch {
      candidates = [];
    }
  }

  const seen = new Set<string>();
  const out: CommodityInferCandidate[] = [];
  for (const c of candidates) {
    if (c.score < SCORE_FLOOR || !c.code || seen.has(c.code)) continue;
    seen.add(c.code);
    out.push(c);
    if (out.length >= CANDIDATE_LIMIT) break;
  }
  await attachPaths(pool, out);
  return out.sort((a, b) => b.score - a.score || b.level - a.level);
}
