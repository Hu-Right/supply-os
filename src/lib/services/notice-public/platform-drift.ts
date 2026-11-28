/**
 * 平台公告状态漂移检测（宽表退役后的服务表口径）
 *
 * @module lib/services/notice-public/platform-drift
 * @description 平台公告的审核状态由站外后台直接改库，其 id 早已在增量水位之下，
 *              不会被「新行扫描」拾取。这里只做检测（不修复），由调度器：
 *              - `toSync`：已发布但服务表缺行 → 重建该行 + 同步索引；
 *              - `toPurge`：已不可见但服务表仍有行 → 清服务表行 + 下架索引。
 *
 *              可见性口径与 `utils/notice-expired` 的 PLATFORM_PUBLISHED_ONLY 一致：
 *              `entry_source='platform'` 且 `rfq_status='published'`。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { RFQ_STATUS } from "../../../shared/constants/procurement";

export interface PlatformDrift {
  toSync: number[];
  toPurge: number[];
}

export async function detectPlatformStatusDrift(pool: Pool): Promise<PlatformDrift> {
  const published = JSON.stringify(RFQ_STATUS.PUBLISHED);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT n.id, (p.notice_pk IS NOT NULL) AS has_public
       FROM bid_notices n
       LEFT JOIN notice_public p ON p.notice_pk = n.id
      WHERE n.entry_source = 'platform'
        AND (
          (IFNULL(n.rfq_status, '') = ${published} AND p.notice_pk IS NULL)
          OR (IFNULL(n.rfq_status, '') <> ${published} AND p.notice_pk IS NOT NULL)
        )
      LIMIT 500`,
  );
  const toSync: number[] = [];
  const toPurge: number[] = [];
  for (const r of rows) {
    if (Number(r.has_public) === 0) toSync.push(Number(r.id));
    else toPurge.push(Number(r.id));
  }
  return { toSync, toPurge };
}
