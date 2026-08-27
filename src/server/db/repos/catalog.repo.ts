/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 类目与认证数据访问层
 * Catalog Repository
 *
 * @module repos/catalog.repo
 */
import "server-only";
import type { Pool } from "mysql2/promise";
import { getUnspscPath } from "../../services/unspsc";
import { escapeLikeWildcard } from "../../utils/normalize";

export interface CertificationRow {
  id: number;
  name: string;
}

export interface UnspscRow {
  id: number;
  title_zh: string | null;
  title: string | null;
  code: string | null;
  parent_id: number | null;
  level: number;
  title_i18n?: string | null;
}

export interface SmartInferResult {
  level1_id: number | null;
  level2_id: number | null;
  level3_id: number | null;
  level4_id: number | null;
  level5_id: number | null;
  matched_title: string | null;
}

/** 智能推断候选：完整路径 + 置信度（0~1，关键词词元在类目名中的命中率） */
export interface SmartInferCandidate extends SmartInferResult {
  /** 命中的类目节点 id */
  node_id: number;
  /** 命中的类目节点层级 */
  node_level: number;
  /** 置信度 0~1：越高表示关键词与类目名匹配越完整 */
  score: number;
}

/** 智能推断输出：高置信最优解 + 候选列表（供前端让用户确认） */
export interface SmartInferOutput {
  /** 置信度 >= 0.6 的最优匹配；null 表示禁止自动填充，须由用户从候选中选择 */
  best: SmartInferResult | null;
  /** 按置信度降序的候选列表（score >= 0.4，最多 5 条） */
  candidates: SmartInferCandidate[];
}

/** 置信度 >= 该值才允许前端自动填充级联 */
const AUTO_FILL_THRESHOLD = 0.6;
/** 置信度 >= 该值才进入候选列表 */
const CANDIDATE_THRESHOLD = 0.4;

/** 同分时的层级偏好：优先更具体的类目（L4/L5），但不再凌驾于语义得分之上 */
const LEVEL_PREF_ORDER: Record<number, number> = { 4: 0, 5: 1, 3: 2, 2: 3, 1: 4 };

/** 中文串切二元组（bigram，去重保序）："医疗器械" → ["医疗","疗器","器械"] */
function extractBigrams(zh: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < zh.length; i += 1) {
    const bg = zh.slice(i, i + 2);
    if (!out.includes(bg)) out.push(bg);
  }
  return out;
}

/** 提取英文词元（长度 >= 2，小写去重） */
function extractEnWords(kw: string): string[] {
  const words = kw.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  return [...new Set(words)];
}

/** 候选评分：中文整词包含 → 1，否则 bigram 覆盖率；英文按词覆盖率（整串包含 → 1） */
function scoreUnspscCandidate(
  row: UnspscRow,
  zh: string,
  bigrams: string[],
  enWords: string[],
  qLower: string,
): number {
  let score = 0;
  const titleZh = row.title_zh || "";
  const titleLower = (row.title || "").toLowerCase();

  if (zh.length >= 2 && titleZh.includes(zh)) {
    score = 1;
  } else if (zh.length === 1 && titleZh.includes(zh)) {
    // 单字输入过于宽泛：封顶 0.5，只作候选、禁止自动填充
    score = 0.5;
  } else if (bigrams.length > 0) {
    const hit = bigrams.filter((bg) => titleZh.includes(bg)).length;
    // ×0.95 与整词包含拉开差距，保证完整命中恒排第一
    score = Math.max(score, (hit / bigrams.length) * 0.95);
  }

  if (enWords.length > 0) {
    if (titleLower.includes(qLower)) {
      score = Math.max(score, 1);
    } else {
      const hit = enWords.filter((w) => titleLower.includes(w)).length;
      score = Math.max(score, (hit / enWords.length) * 0.95);
    }
  }
  return Math.round(score * 100) / 100;
}

export class CatalogRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的供应商资质证书 */
  async listActiveCertifications(): Promise<CertificationRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, name FROM crm_supplier_certifications WHERE is_active = 1 ORDER BY sort_order",
    );
    return rows as CertificationRow[];
  }

  /** 查询 UNSPSC 层级（含译文缓存） */
  async listUnspscWithTranslation(sql: string, params: unknown[]): Promise<UnspscRow[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as UnspscRow[];
  }

  /** 按 id 查单个 UNSPSC 类目节点（N6 收敛：原 industry-profile/resolve.ts 内裸 SQL 下沉至此） */
  async findUnspscNodeById(id: number): Promise<UnspscRow | null> {
    const [rows] = await this.pool.query(
      "SELECT id, code, title_zh, title, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as UnspscRow[])[0] ?? null;
  }

  /** 批量写入 UNSPSC 译文缓存
   *  P3-10 性能修复：多行 VALUES 单语句批量 upsert，替代逐条 INSERT（N 次往返 → 1 次） */
  async upsertUnspscTranslations(
    entries: { codeId: number; lang: string; titleTr: string; model: string }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const BATCH = 200;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const valuesSql = batch.map(() => "(?, ?, ?, ?)").join(", ");
      const params: unknown[] = [];
      for (const entry of batch) {
        params.push(entry.codeId, entry.lang, entry.titleTr, entry.model);
      }
      await this.pool.query(
        `INSERT INTO crm_unspsc_translations (code_id, lang, title_tr, model)
         VALUES ${valuesSql}
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), model = VALUES(model)`,
        params,
      );
    }
  }

  /** UNSPSC 关键词搜索 */
  async searchUnspsc(q: string): Promise<UnspscRow[]> {
    // P3-7 安全修复：LIKE 通配符转义，防止用户输入的 %/_ 被当作通配符
    const eq = escapeLikeWildcard(q);
    const [rows] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE code LIKE ? OR title_zh LIKE ? OR title LIKE ?
       ORDER BY level, code
       LIMIT 30`,
      [`${eq}%`, `%${eq}%`, `%${eq}%`],
    );
    return rows as UnspscRow[];
  }

  /** 智能推断 UNSPSC 类目：输入关键词，返回最优匹配路径与候选列表。
   *
   *  评分式召回（替代旧版单字符 LIKE 逐级回退）：
   *    1. 召回：中文整词/bigram + 英文整串/词元，多组 LIKE OR 一次查出候选节点
   *    2. 评分：中文整词包含 → 1.0，否则按 bigram 覆盖率；英文按词覆盖率
   *       （旧版"任一单字命中即返回"的 OR 噪声被覆盖率阈值过滤）
   *    3. 门槛：score < 0.4 不作候选；< 0.6 不自动填充（best=null），
   *       由前端展示候选让用户确认，避免推断错误污染行业偏好
   *  同分时优先更深层级（L4/L5）与更短类目名，仅作为次序 tiebreak。
   */
  async smartInferUnspsc(q: string): Promise<SmartInferOutput> {
    const kw = q.trim().replace(/\s+/g, " ");
    if (!kw) return { best: null, candidates: [] };

    const zh = kw.replace(/[^\u4e00-\u9fff]/g, "");
    const bigrams = extractBigrams(zh);
    const enWords = extractEnWords(kw);
    const qLower = kw.toLowerCase();

    const rows = await this.collectCandidates(kw, zh, bigrams, enWords);
    if (rows.length === 0) return { best: null, candidates: [] };

    const scored = rows
      .map((row) => ({ row, score: scoreUnspscCandidate(row, zh, bigrams, enWords, qLower) }))
      .filter((item) => item.score >= CANDIDATE_THRESHOLD);

    scored.sort((a, b) =>
      b.score - a.score
      || (LEVEL_PREF_ORDER[a.row.level] ?? 9) - (LEVEL_PREF_ORDER[b.row.level] ?? 9)
      || String(a.row.title_zh || a.row.title || "").length - String(b.row.title_zh || b.row.title || "").length,
    );

    const top = scored.slice(0, 5);
    const paths = await Promise.all(top.map((item) => getUnspscPath(this.pool, item.row.id)));
    const candidates: SmartInferCandidate[] = top.map((item, idx) => {
      const path = paths[idx];
      return {
        level1_id: path.level1_id ?? null,
        level2_id: path.level2_id ?? null,
        level3_id: path.level3_id ?? null,
        level4_id: path.level4_id ?? null,
        level5_id: path.level5_id ?? null,
        matched_title: item.row.title_zh || item.row.title || null,
        node_id: item.row.id,
        node_level: item.row.level,
        score: item.score,
      };
    });

    // 低置信 / 单字输入：不给自动填充解，强制用户从候选中确认
    const best = candidates.length > 0 && candidates[0].score >= AUTO_FILL_THRESHOLD
      ? candidates[0]
      : null;
    return { best, candidates };
  }

  /** 召回候选类目节点：中文整词 + bigram（中文）与整串 + 词元（英文）OR 组合，应用层再评分 */
  private async collectCandidates(
    kw: string,
    zh: string,
    bigrams: string[],
    enWords: string[],
  ): Promise<UnspscRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    // P3-7 安全修复：全部 LIKE 参数先转义通配符（%/_），用户输入仅作为字面量匹配

    if (zh.length >= 1) {
      // 单字也召回（评分端封顶 0.5），避免输入单字时零反馈
      clauses.push("title_zh LIKE ?");
      params.push(`%${escapeLikeWildcard(zh)}%`);
    }
    for (const bg of bigrams.slice(0, 8)) {
      clauses.push("title_zh LIKE ?");
      params.push(`%${escapeLikeWildcard(bg)}%`);
    }
    clauses.push("LOWER(title) LIKE ?");
    params.push(`%${escapeLikeWildcard(kw.toLowerCase())}%`);
    for (const w of enWords.slice(0, 4)) {
      clauses.push("LOWER(title) LIKE ?");
      params.push(`%${escapeLikeWildcard(w)}%`);
    }
    if (clauses.length === 0) return [];

    const [rows] = await this.pool.query(
      `SELECT id, title_zh, title, code, parent_id, level
       FROM crm_unspsc_codes
       WHERE ${clauses.join(" OR ")}
       LIMIT 60`,
      params,
    );
    return rows as UnspscRow[];
  }
}
