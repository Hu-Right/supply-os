/**
 * 文本相似度服务
 * Text Similarity Service
 *
 * @module server/services/recommend/text-similarity
 * @description T-C6 JS 层 s_text 文本相似度（本地差异 #16：C.2 校正二方案 1）
 *              用户历史解锁公告标题分词 → 关键词集合（进程内 10 分钟缓存，复用 F.4 模式）；
 *              候选集内（当页 pageSize 条）纯内存 Jaccard 计算，禁止 FULLTEXT（外部表只读，约束 1）。
 *              零解锁历史用户 keywords=null → 加分恒 0，排序与上线前恒等（验收口径）
 */
import type { RowDataPacket } from "mysql2/promise";

const TEXT_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were", "will",
  "supply", "provision", "procurement", "services", "service", "tender", "bid", "rfq", "rfp", "itb",
]);

/**
 * 分词：将文本转换为词元集合
 *
 * @param text - 输入文本
 * @returns 词元集合
 */
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

/**
 * Jaccard 相似度：|A∩B| / |A∪B|
 * 交并运算天然对称 jaccard(a,b)===jaccard(b,a)
 * （对称性断言留档 scripts/verify-text-similarity.mjs，与本实现同构复制）
 *
 * @param a - 词元集合 A
 * @param b - 词元集合 B
 * @returns Jaccard 相似度（0-1）
 */
export const jaccardTokenSim = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  return inter / (a.size + b.size - inter);
};

/** s_text 独立加分维度系数（当页内微调排序，不破 SQL 分页语义；满分加成 0.05 与 T-B7 权重档不冲突） */
export const S_TEXT_BONUS = 0.05;

const userUnlockKeywordsCache = new Map<number, { keywords: Set<string> | null; expires: number }>();
const USER_KEYWORDS_TTL_MS = 10 * 60 * 1000;

/**
 * 获取用户解锁关键词集合（带缓存）
 *
 * @param dbPool - 数据库连接池
 * @param userId - 内部用户 ID
 * @returns 关键词集合，无历史记录返回 null
 */
export async function getUserUnlockKeywords(dbPool: any, userId: number): Promise<Set<string> | null> {
  const cached = userUnlockKeywordsCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.keywords;
  if (userUnlockKeywordsCache.size > 2000) userUnlockKeywordsCache.clear(); // 简易防膨胀
  let keywords: Set<string> | null;
  try {
    const [rows] = await dbPool.query(
      `SELECT n.title
       FROM crm_opportunity_unlocks u
       INNER JOIN crm_bid_notices n ON n.id = u.notice_id
       WHERE u.user_id = ? AND u.notice_id IS NOT NULL
       ORDER BY u.unlocked_at DESC
       LIMIT 50`,
      [userId],
    );
    const merged = new Set<string>();
    for (const row of rows as RowDataPacket[]) {
      for (const token of tokenizeNoticeText(row.title)) merged.add(token);
    }
    keywords = merged.size > 0 ? merged : null;
  } catch {
    keywords = null; // 查询异常降级为无文本信号，不阻断推荐主链
  }
  userUnlockKeywordsCache.set(userId, { keywords, expires: Date.now() + USER_KEYWORDS_TTL_MS });
  return keywords;
}
