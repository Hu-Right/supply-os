/**
 * 品目归类队列生产者（应用内，桥表退役后的登记口）
 * Taxonomy intake producer (in-app)
 *
 * @module lib/services/commodity/taxonomy-intake
 * @description 旧品类桥表退役（2026-10-14）后，"新公告需要归类"这件事失去了
 *              旧的登记通道（daily-sync.cjs 的桥表入库校验：合法码直通桥表、
 *              野码进 intake——该通道连同码本身一起废弃）。本模块在应用内
 *              crawler-sync 每轮同步后，把**无 UGT 归属的活跃公告**登记进
 *              crm_taxonomy_intake（status='pending'），交由 AI 归属管道
 *              （scripts/tools/notice-attribution-content-ai.ts，人工放量）
 *              按正文语义归类。不带任何旧品类码——归属质量由 AI 把关，
 *              不再回头信任爬虫码。
 *
 * 契约（与消费端严格对齐）：
 *   - uk_src(source_table, source_pk)：一条公告终身只登记一次，INSERT IGNORE 幂等；
 *     已 resolved 的行同样挡住重登（归类是一次性判定，不反复翻案）。
 *   - notice_id 存外部编号：AI 管道的候选谓词与 resolved 翻转都按它匹配。
 *   - code=''：本队列不再承载码，只承载「这条公告需要归类」这个事实。
 *   - 归属判定 = 落点表存在 **L2+ 有效落点**（与 AI 管道候选谓词同一条口径，
 *     走 attribution-contract 的 withoutValidLandingWhere，不在本文件重拼一份）；
 *     只登记活跃公告（已过期的分类是浪费 AI 钱）。
 *
 * 本模块只写 crm_taxonomy_intake，不碰落点表与宽表（写入者另有其人）。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { ACTIVE_NOTICE_WHERE } from "../../utils/notice-expired";
import { ATTR_LANDING_TABLE, withoutValidLandingWhere } from "./attribution-contract";

/** 单轮登记上限：爬虫首轮全量变更可能上万，按轮分批消化，避免队列瞬间堆爆 */
const ENQUEUE_CAP_DEFAULT = 2000;

export interface IntakeEnqueueResult {
  /** 实际新登记的行数（INSERT IGNORE 受 uk_src 幂等） */
  enqueued: number;
  /** 入参里有归属/非活跃而被跳过的公告数 */
  skipped: number;
  /** 单轮上限截断后剩余待登记的公告数（下一轮爬虫同步继续消化） */
  deferred: number;
}

/**
 * 把无 UGT 归属的活跃公告登记进品目归类队列。
 *
 * @param noticeIds - 本轮爬虫同步变更的公告内部 id（crm_bid_notices.id）
 * @param cap - 单轮登记上限
 */
export async function enqueueUnattributedNotices(
  pool: Pool,
  noticeIds: number[],
  cap = Number(process.env.TAXONOMY_INTAKE_ENQUEUE_CAP) || ENQUEUE_CAP_DEFAULT,
): Promise<IntakeEnqueueResult> {
  const empty: IntakeEnqueueResult = { enqueued: 0, skipped: 0, deferred: 0 };
  const ids = [...new Set(noticeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return empty;

  // 候选：活跃 + 无有效落点（与 AI 管道候选谓词同一条口径：零落点与只挂 L1 大类的
  // 「粗落点」都算待办 —— 后者接不住撮合，当作已覆盖就是把 14 万条公告永久关在门外）。
  // 已有 intake 行的公告靠 uk_src + INSERT IGNORE 幂等挡住（含已 resolved，不翻案）。
  const [rows] = await pool.query(
    `SELECT n.id, n.notice_id FROM crm_bid_notices n
     WHERE n.id IN (${ids.map(() => "?").join(",")})
       AND ${ACTIVE_NOTICE_WHERE}
       AND ${withoutValidLandingWhere(ATTR_LANDING_TABLE)}
       AND NOT EXISTS (SELECT 1 FROM crm_taxonomy_intake i WHERE i.source_table = 'crm_bid_notices' AND i.source_pk = n.id)`,
    ids,
  );
  const candidates = (rows as Array<{ id: number; notice_id: string | null }>)
    .filter((r) => Number.isInteger(Number(r.id)) && String(r.notice_id ?? "") !== "");

  const skipped = ids.length - candidates.length;
  const batch = candidates.slice(0, Math.max(1, cap));
  const deferred = candidates.length - batch.length;
  if (batch.length === 0) return { enqueued: 0, skipped, deferred };

  // uk_src(source_table, source_pk) 幂等：一条公告终身一行；INSERT IGNORE 撞键静默跳过
  const placeholders = batch.map(() => "('crm_bid_notices', ?, ?, '', ?, 'pending')").join(",");
  const params = batch.flatMap((r) => [String(r.id), String(r.notice_id), "公告无 UGT 归属（桥表退役后由 AI 管道归类）"]);
  const [ret] = await pool.query(
    `INSERT IGNORE INTO crm_taxonomy_intake (source_table, source_pk, notice_id, code, reason, status) VALUES ${placeholders}`,
    params,
  );
  return { enqueued: (ret as ResultSetHeader).affectedRows ?? 0, skipped, deferred };
}
