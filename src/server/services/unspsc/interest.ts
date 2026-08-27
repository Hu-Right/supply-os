/**
 * UNSPSC 用户兴趣码持久化
 * UNSPSC user interest codes persistence
 *
 * @module server/services/unspsc/interest
 * @description 用户兴趣码写入数据库（含白名单校验与权重上限）。
 *              依赖 parser 模块的前缀展开函数。
 */
import "server-only";
import type { UnspscCodeRow } from "./parser";
import { expandUnspscInterestPrefixes, padUnspscPrefix } from "./parser";

// 本地差异 #11：T-E3 source 枚举白名单（固化写入端合法来源，未知来源拒写防脏数据）
const INTEREST_SOURCE_WHITELIST = new Set([
  "unlock_order",      // 解锁订单（+2.5）
  "subscribe_notice",  // 订阅公告（+2.0）
  "express_interest",  // 表达兴趣（+1.0）
  "feedback_click",    // T-B6 反馈：点击（+0.3）
  "feedback_favorite", // T-B6 反馈：收藏（+0.8）
  // T-C7 隐式信号（本地差异 #16：C.3.6）——正向三档；quick_exit 走 decay 不占来源
  "feedback_dwell",      // 详情停留 >30s（+0.2）
  "feedback_scroll_end", // 详情滚动到底（+0.1）
  "feedback_revisit",    // 会话内回看（+0.5）
]);

// 本地差异 #11：T-E3 单码 weight 软上限——写入端 LEAST 封顶，现有超上限存量不回改（只封新增）
const INTEREST_WEIGHT_CAP = 500;

/**
 * 持久化用户兴趣码：从公告 UNSPSC 快照提取前缀，写入 crm_user_interest_codes
 *
 * @param dbPool - 数据库连接池
 * @param userKey - 用户标识
 * @param snapshot - 公告 UNSPSC 码快照（normalizeUnspscCodes 输出）
 * @param source - 来源（必须在白名单内）
 * @param weight - 权重增量
 */
export async function persistUserInterestCodes(
  dbPool: any,
  userKey: string,
  snapshot: any[],
  source: string,
  weight: number,
) {
  if (!INTEREST_SOURCE_WHITELIST.has(source)) return; // T-E3：白名单外来源拒写
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }

  for (const prefix of prefixes) {
    const [codeRows] = await dbPool.query(
      "SELECT id, level FROM crm_unspsc_codes WHERE code IN (?, ?) ORDER BY CHAR_LENGTH(code) DESC LIMIT 1",
      [prefix, padUnspscPrefix(prefix)]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    await dbPool.execute(
      `INSERT INTO crm_user_interest_codes (user_id, user_key, code_id, code, level, source, weight)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weight = LEAST(${INTEREST_WEIGHT_CAP}, weight + VALUES(weight)), updated_at = NOW()`,
      [userKey, userKey, codeRow?.id || null, prefix, Math.max(1, prefix.length / 2), source, weight]
    );
  }
}
