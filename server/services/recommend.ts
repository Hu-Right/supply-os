/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { expandUnspscInterestPrefixes } from "./unspsc";

// 本地差异 #11：T-E3 负反馈强化（E.3）——dismiss 用相对强衰减 ×0.5（乘法在权重通胀下仍有效，
// 绝对扣减会失效）；GREATEST(0.01) 下限保护，weight 永不降为 ≤0（画像可转向但不清零）。
// 对该用户展开前缀命中的所有 source 行统一衰减（跨来源同码一并降权）
export async function decayUserInterestCodes(dbPool: any, userKey: string, snapshot: any[], factor = 0.5) {
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }
  if (prefixes.size === 0) return;
  const list = Array.from(prefixes);
  await dbPool.execute(
    `UPDATE crm_user_interest_codes
     SET weight = GREATEST(0.01, weight * ?), updated_at = NOW()
     WHERE user_key = ? AND code IN (${list.map(() => "?").join(",")})`,
    [factor, userKey, ...list]
  );
}

// ── T-B7 权重微调懒计算（本地差异 #15：B.3.2.3）──
// 按用户近 200 条显式反馈做指数滑动平均（EMA α=0.05，最新反馈影响最大）：
// 正反馈占优（favorite/unlock/click）→ 上调 w_unspsc（兴趣码方向准）；
// 负反馈占优（dismiss/quick_exit）→ 下调 w_unspsc，差额按 6:4 让给 urgency/amount 通用信号。
// 五权重总和恒 1；无显式反馈用户不建档案行（推荐端点缺行走全局默认，行为恒等——验收口径）。
// 触发：推荐请求发现档案缺失/超 24h 时 fire-and-forget 异步重算，无定时器（约束 6）
const recoWeightRefreshing = new Set<string>();
export async function recomputeRecoWeightProfile(dbPool: any, userKey: string) {
  if (recoWeightRefreshing.has(userKey)) return; // 并发请求下同一用户只跑一次
  recoWeightRefreshing.add(userKey);
  try {
    const [rows] = await dbPool.query(
      `SELECT action FROM crm_user_reco_feedback
       WHERE user_key = ? AND action IN ('click','favorite','unlock','dismiss','quick_exit')
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [userKey]
    );
    const actions = (rows as any[]).reverse(); // 时间正序遍历，EMA 天然给最新反馈更高权重
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
      ]
    );
  } finally {
    recoWeightRefreshing.delete(userKey);
  }
}

// ── T-B10 A/B 分桶（本地差异 #15：B.5）──
// FNV-1a 32 位稳定哈希 % 100：同一 user_key 桶恒定（纯函数，跨请求/重启/进程一致）。
// RECO_AB_TREATMENT_PCT 环境变量控放量（0~100 整数，默认 0 = 全 control = 实验默认关闭；
// 改回 0 即一键回退）。treatment 桶当前实验特性 = T-B7 per-user 权重档案生效。
// A/B 放量属线上动作，调整环境变量须经用户明确确认。
export const AB_TREATMENT_PCT = Math.min(100, Math.max(0, Math.floor(Number(process.env.RECO_AB_TREATMENT_PCT || 0)) || 0));
const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};
export const recoVariant = (userKey: string): "control" | "treatment" =>
  AB_TREATMENT_PCT > 0 && fnv1a32(userKey) % 100 < AB_TREATMENT_PCT ? "treatment" : "control";

// ── T-C6 JS 层 s_text 文本相似度（本地差异 #16：C.2 校正二方案 1）──
// 用户历史解锁公告标题分词 → 关键词集合（进程内 10 分钟缓存，复用 F.4 模式）；
// 候选集内（当页 pageSize 条）纯内存 Jaccard 计算，禁止 FULLTEXT（外部表只读，约束 1）。
// 零解锁历史用户 keywords=null → 加分恒 0，排序与上线前恒等（验收口径）
const TEXT_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were", "will",
  "supply", "provision", "procurement", "services", "service", "tender", "bid", "rfq", "rfp", "itb",
]);
export const tokenizeNoticeText = (text: string): Set<string> => {
  const tokens = new Set<string>();
  const lower = String(text || "").toLowerCase();
  // 拉丁/数字词长度 ≥3 进集合；CJK 连续段拆双字 bigram（多语言标题兼容）
  for (const match of lower.matchAll(/[a-z0-9]+/g)) {
    const word = match[0];
    if (word.length >= 3 && !TEXT_STOPWORDS.has(word)) tokens.add(word);
  }
  for (const match of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const seg = match[0];
    if (seg.length === 1) tokens.add(seg);
    for (let i = 0; i + 1 < seg.length; i++) tokens.add(seg.slice(i, i + 2));
  }
  return tokens;
};
// Jaccard = |A∩B| / |A∪B|：交并运算天然对称 jaccard(a,b)===jaccard(b,a)
// （对称性断言留档 scripts/verify-text-similarity.mjs，与本实现同构复制）
export const jaccardTokenSim = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  return inter / (a.size + b.size - inter);
};
// s_text 独立加分维度系数（当页内微调排序，不破 SQL 分页语义；满分加成 0.05 与 T-B7 权重档不冲突）
export const S_TEXT_BONUS = 0.05;
const userUnlockKeywordsCache = new Map<string, { keywords: Set<string> | null; expires: number }>();
const USER_KEYWORDS_TTL_MS = 10 * 60 * 1000;
export async function getUserUnlockKeywords(dbPool: any, userKey: string): Promise<Set<string> | null> {
  const cached = userUnlockKeywordsCache.get(userKey);
  if (cached && cached.expires > Date.now()) return cached.keywords;
  if (userUnlockKeywordsCache.size > 2000) userUnlockKeywordsCache.clear(); // 简易防膨胀
  let keywords: Set<string> | null = null;
  try {
    const [rows] = await dbPool.query(
      `SELECT n.title
       FROM crm_opportunity_unlocks u
       INNER JOIN crm_bid_notices n ON n.id = u.notice_id
       WHERE u.user_key = ? AND u.notice_id IS NOT NULL
       ORDER BY u.unlocked_at DESC
       LIMIT 50`,
      [userKey]
    );
    const merged = new Set<string>();
    for (const row of rows as any[]) {
      for (const token of tokenizeNoticeText(row.title)) merged.add(token);
    }
    keywords = merged.size > 0 ? merged : null;
  } catch {
    keywords = null; // 查询异常降级为无文本信号，不阻断推荐主链
  }
  userUnlockKeywordsCache.set(userKey, { keywords, expires: Date.now() + USER_KEYWORDS_TTL_MS });
  return keywords;
}

