/**
 * 统一搜索编排器 — 模式解析器
 * Unified search orchestrator — mode resolver
 *
 * @module server/services/search-orchestrator/mode-resolver
 * @description mode → filter 计划的映射：
 *              - default:      URL 筛选参数（+ code_id 解析为 UNSPSC 层级过滤）
 *              - prefs:        用户行业画像 → 渐进放宽层级序列（替代旧 T0-T3 分层架构）
 *              - recommended:  委托既有推荐服务（行为评分语义无法 filter 化，文档 §1 已论证）
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnifiedSearchParams } from "./types";
import { resolveUserIndustryProfile } from "../industry-profile/resolve";

export interface UnspscFilter {
  level: number;
  id: string;
  /** true=prefs 模式用 precise_level{N}_id（approved 候选码）；false=default 模式用 level{N}_id（TED 标签） */
  precise: boolean;
}

export interface ModeResolution {
  /** search=走统一检索管道 / delegate-recommended=委托推荐服务 / no-prefs=无行业偏好 */
  kind: "search" | "delegate-recommended" | "no-prefs";
  /** default 模式：code_id 解析出的 UNSPSC 过滤（无则 null） */
  codeUnspsc: UnspscFilter | null;
  /** prefs 模式：渐进放宽层级序列（最深层在前）；匹配分随层级递减 */
  profileLevels: Array<{ level: number; id: string; score: number }> | null;
}

/**
 * 解析模式的 filter 计划。
 */
export async function resolveMode(
  pool: Pool,
  p: UnifiedSearchParams,
): Promise<ModeResolution> {
  // ── recommended：委托既有推荐服务 ──
  if (p.mode === "recommended") {
    return { kind: "delegate-recommended", codeUnspsc: null, profileLevels: null };
  }

  // ── prefs：用户行业画像 → 渐进放宽序列 ──
  if (p.mode === "prefs") {
    if (!p.userId) return { kind: "no-prefs", codeUnspsc: null, profileLevels: null };
    const profile = await resolveUserIndustryProfile(pool, p.userId);
    if (!profile) return { kind: "no-prefs", codeUnspsc: null, profileLevels: null };

    // 从最深层向上构建放宽序列，底线 L2（L1 大类过于宽泛，放宽到 L1 会引入跨行业误报）。
    // 分数按绝对层级取值，与 format.matchScoreToTierLabel 阈值对齐：
    // L4/L5 命中 → 5（precise 绿徽章）；L2/L3 命中 → 2（relevant 蓝徽章）。
    // 注意不能用"相对最深级的偏移"计分：用户只选到 L2 时其最深级也应有 relevant 档，
    // 否则浅偏好会被误标为 precise。
    const levels: Array<{ level: number; id: string; score: number }> = [];
    for (let lvl = Math.min(profile.deepestLevel, 5); lvl >= 2; lvl -= 1) {
      const id = profile.levelIds[lvl - 1];
      if (!id) continue;
      const score = lvl >= 4 ? 5 : 2;
      levels.push({ level: lvl, id: String(id), score });
    }
    if (levels.length === 0) return { kind: "no-prefs", codeUnspsc: null, profileLevels: null };
    return { kind: "search", codeUnspsc: null, profileLevels: levels };
  }

  // ── default：code_id → UNSPSC 层级解析 ──
  if (p.codeId > 0) {
    try {
      const [rows] = await pool.query(
        "SELECT id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
        [p.codeId],
      );
      const row = (rows as RowDataPacket[])[0];
      if (row) {
        const level = Number(row.level) || 0;
        if (level >= 1 && level <= 5) {
          return {
            kind: "search",
            codeUnspsc: { level, id: String(row.id), precise: false },
            profileLevels: null,
          };
        }
      }
    } catch { /* code_id 解析失败：忽略行业过滤 */ }
  }
  return { kind: "search", codeUnspsc: null, profileLevels: null };
}
