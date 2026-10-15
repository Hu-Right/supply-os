/**
 * 用户兴趣节点持久化（UGT 版）
 * User interest node persistence
 *
 * @module lib/services/commodity/interest
 * @description 旧品类码小表剥离（2026-10-14）：`crm_user_interest_codes.code` 不再存
 *              旧品类码 8 位前缀，改存公告的 UGT 归属节点码（含祖先链，与倒排镜像
 *              `crm_notice_backbone_nodes` 同一口径）。行为语义不变：解锁/订阅/收藏/
 *              反馈等动作仍按来源白名单给权重，单码 LEAST 封顶，quick_exit 走衰减。
 *
 *              与旧版（旧字典目录下的 interest.ts，已删）的三处实质差别：
 *              1. 码源从「公告 JSON 快照列的前缀展开」换成「倒排表行化节点」
 *                 ——倒排就是 backbone_path 的行化（自身+全部祖先），天然等价于旧的
 *                 前缀展开产物，且不依赖公告主表的 旧品类快照列；
 *              2. code 存 UGT 节点码（"UGT-" + 2/4/6/8/10 位数字），列已加宽到
 *                 varchar(24)（scripts/ops/user-interest-code-widen-ddl.ts）；
 *              3. 推荐读侧（recall.ts processInterestCodes）经骨架索引 pathOf 直认
 *                 UGT 节点键，无需任何字典换算；存量数字码行仍走原换算路径衰减消化，
 *                 上线日由 scripts/ops/user-interest-ugt-migrate.ts 批量转写。
 */
import type { Pool } from "mysql2/promise";
import { NOTICE_NODES_TABLE } from "../search-sync/notice-nodes";
import { backboneNodeLevel } from "./backbone-path";

// 与旧版一致的来源白名单（T-E3）：白名单外来源拒写防脏数据
const INTEREST_SOURCE_WHITELIST = new Set([
  "unlock_order",      // 解锁订单（+2.5）
  "subscribe_notice",  // 订阅公告（+2.0）
  "express_interest",  // 表达兴趣（+1.0）
  "feedback_click",    // T-B6 反馈：点击（+0.3）
  "feedback_favorite", // T-B6 反馈：收藏（+0.8）
  // T-C7 隐式信号——正向三档；quick_exit 走 decay 不占来源
  "feedback_dwell",      // 详情停留 >30s（+0.2）
  "feedback_scroll_end", // 详情滚动到底（+0.1）
  "feedback_revisit",    // 会话内回看（+0.5）
]);

// T-E3 单码 weight 软上限——写入端 LEAST 封顶，现有超上限存量不回改（只封新增）
const INTEREST_WEIGHT_CAP = 500;

/** 批量取公告的 UGT 归属节点码（倒排镜像行 = backbone_path 行化：自身 + 全部祖先） */
export async function loadNoticeNodeCodes(
  pool: Pool,
  noticeIds: number[],
): Promise<Map<number, string[]>> {
  const ids = [...new Set(noticeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map<number, string[]>();
  if (ids.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT notice_id, node FROM ${NOTICE_NODES_TABLE} WHERE notice_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const row of rows as Array<{ notice_id: number | string; node: string }>) {
    const nid = Number(row.notice_id);
    const node = String(row.node ?? "").trim();
    if (!Number.isFinite(nid) || nid <= 0 || !node) continue;
    const list = map.get(nid);
    if (list) list.push(node);
    else map.set(nid, [node]);
  }
  return map;
}

/**
 * 持久化用户兴趣节点：写入 crm_user_interest_codes（code 存 UGT 节点码）
 *
 * @param nodeCodes - 公告 UGT 节点码集合（倒排行，去重后逐条落列）
 * @param source - 来源（必须在白名单内）
 * @param weight - 权重增量
 */
export async function persistInterestNodeCodes(
  dbPool: Pool,
  userId: number,
  nodeCodes: Iterable<string>,
  source: string,
  weight: number,
) {
  if (!INTEREST_SOURCE_WHITELIST.has(source)) return; // T-E3：白名单外来源拒写
  const seen = new Set<string>();
  const params: unknown[] = [];
  const rows: string[] = [];
  for (const raw of nodeCodes) {
    const code = String(raw ?? "").trim();
    const level = backboneNodeLevel(code);
    if (level === 0 || seen.has(code)) continue; // 形制不符不猜层级，重复码只落一次
    seen.add(code);
    // 单条多行 ODKU：一条往返落全部祖先链（原逐码串行 execute 在请求路径上最多 5~6 次 RTT）
    rows.push("(?, ?, ?, ?, ?, NOW())");
    params.push(userId, code, level, source, weight);
  }
  if (rows.length === 0) return;
  // 多行 VALUES 的动态占位符不走 prepare（execute 的 unknown[] 重载不接受），query 足够
  await dbPool.query(
    `INSERT INTO crm_user_interest_codes (user_id, code, level, source, weight, updated_at)
     VALUES ${rows.join(", ")}
     ON DUPLICATE KEY UPDATE weight = LEAST(${INTEREST_WEIGHT_CAP}, weight + VALUES(weight)), updated_at = NOW()`,
    params,
  );
}

/**
 * 衰减用户兴趣节点权重（quick_exit 等负反馈）：
 * GREATEST(0.01) 下限保护，weight 永不降为 ≤0（画像可转向但不清零）
 */
export async function decayInterestNodeCodes(
  dbPool: Pool,
  userId: number,
  nodeCodes: Iterable<string>,
  factor = 0.5,
): Promise<void> {
  const seen = new Set<string>();
  for (const raw of nodeCodes) {
    const code = String(raw ?? "").trim();
    if (code && backboneNodeLevel(code) > 0) seen.add(code);
  }
  if (seen.size === 0) return;
  const list = [...seen];
  await dbPool.execute(
    `UPDATE crm_user_interest_codes
     SET weight = GREATEST(0.01, weight * ?), updated_at = NOW()
     WHERE user_id = ? AND code IN (${list.map(() => "?").join(",")})`,
    [factor, userId, ...list],
  );
}

/** 商机解锁链取节点码：商机无归属列，经其关联公告（source_notice_id → 主表内部 id）取倒排行 */
export async function loadOpportunityNoticeNodeCodes(
  pool: Pool,
  opportunityId: number,
): Promise<string[]> {
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) return [];
  const [rows] = await pool.query(
    `SELECT cand.node
       FROM crm_bid_opportunities o
       JOIN crm_bid_notices n ON n.notice_id = o.source_notice_id
       JOIN ${NOTICE_NODES_TABLE} cand ON cand.notice_id = n.id
      WHERE o.id = ?`,
    [opportunityId],
  );
  return (rows as Array<{ node: string }>).map((r) => String(r.node ?? "")).filter(Boolean);
}
