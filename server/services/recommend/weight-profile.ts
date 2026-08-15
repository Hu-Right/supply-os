/**
 * 推荐权重档案重算服务
 * Recommendation Weight Profile Recomputation Service
 *
 * @module server/services/recommend/weight-profile
 * @description T-B7 权重微调懒计算（本地差异 #15：B.3.2.3）
 *              按用户近 200 条显式反馈做指数滑动平均（EMA α=0.05，最新反馈影响最大）：
 *              正反馈占优（favorite/unlock/click）→ 上调 w_unspsc（兴趣码方向准）；
 *              负反馈占优（dismiss/quick_exit）→ 下调 w_unspsc，差额按 6:4 让给 urgency/amount 通用信号。
 *              五权重总和恒 1；无显式反馈用户不建档案行（推荐端点缺行走全局默认，行为恒等——验收口径）。
 *              触发：推荐请求发现档案缺失/超 24h 时 fire-and-forget 异步重算，无定时器（约束 6）
 */
import type { RowDataPacket } from "mysql2/promise";

const recoWeightRefreshing = new Set<string>();
const RECO_REFRESH_TIMEOUT = 30_000; // 安全超时：30s 后自动解锁，防止 DB 挂起导致永久阻塞

/**
 * 重算用户推荐权重档案
 *
 * @param dbPool - 数据库连接池
 * @param userKey - 用户标识
 */
export async function recomputeRecoWeightProfile(dbPool: any, userKey: string): Promise<void> {
  if (recoWeightRefreshing.has(userKey)) return; // 并发请求下同一用户只跑一次
  recoWeightRefreshing.add(userKey);
  const safetyTimer = setTimeout(() => recoWeightRefreshing.delete(userKey), RECO_REFRESH_TIMEOUT);
  try {
    const [rows] = await dbPool.query(
      `SELECT action FROM crm_user_reco_feedback
       WHERE user_key = ? AND action IN ('click','favorite','unlock','dismiss','quick_exit')
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [userKey],
    );
    const actions = (rows as RowDataPacket[]).reverse(); // 时间正序遍历，EMA 天然给最新反馈更高权重
    if (actions.length === 0) return; // 无显式反馈：不建档案，保持全局默认恒等
    let ema = 0.5; // 中性起点：正负信号各半时权重不动
    for (const row of actions) {
      const action = String(row.action);
      const signal = action === "favorite" || action === "unlock" ? 1 : action === "click" ? 0.75 : 0;
      ema += 0.05 * (signal - ema);
    }
    // delta ∈ [-0.1, +0.1]：w_unspsc ∈ [0.4, 0.6]、w_urgency ∈ [0.09, 0.21]、w_amount ∈ [0.06, 0.14]
    // （全档位为正，w_agency/w_geo 不动，总和恒 1.000）
    const delta = Math.max(-0.1, Math.min(0.1, (ema - 0.5) * 0.2));
    await dbPool.execute(
      `INSERT INTO crm_reco_weight_profile (user_key, w_unspsc, w_agency, w_amount, w_geo, w_urgency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         w_unspsc = VALUES(w_unspsc), w_agency = VALUES(w_agency), w_amount = VALUES(w_amount),
         w_geo = VALUES(w_geo), w_urgency = VALUES(w_urgency), updated_at = NOW()`,
      [
        userKey,
        (0.5 + delta).toFixed(3),
        (0.15).toFixed(3),
        (0.1 - delta * 0.4).toFixed(3),
        (0.1).toFixed(3),
        (0.15 - delta * 0.6).toFixed(3),
      ],
    );
  } finally {
    clearTimeout(safetyTimer);
    recoWeightRefreshing.delete(userKey);
  }
}
