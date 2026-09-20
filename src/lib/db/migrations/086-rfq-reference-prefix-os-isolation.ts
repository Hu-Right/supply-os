/**
 * 086: 平台 RFQ 编号前缀 RFQ- → OSRFQ-（命名空间数学级隔离）
 * rfq-reference-prefix-os-isolation
 *
 * 背景：迁移 085 用 RFQ-{id} 回填后实测发现爬虫存量已有 5 条外部编号以
 *       RFQ- 开头（如 RFQ-CPD-26-012、RFQ-26DBC14）。notice_id 列带复合
 *       唯一键（uk_notice_tenant/uq_notice_source），且 daily-sync 权威同步
 *       使用 INSERT ... ON DUPLICATE KEY UPDATE：一旦外部源未来出现同格式
 *       编号，会撞唯一键或被 ODKU 静默合并覆盖平台行。
 *       OSRFQ- 前缀经全库实测在外部编号体系中为 0 条、结构上不可能出现，
 *       实现平台编号与外部编号的数学级隔离。增量 create 路由已同步改用该前缀。
 *
 * 安全性：LIKE 'RFQ-%' 不会命中已是 OSRFQ- 的行（不以 RFQ- 开头），天然幂等；
 *         仅影响 entry_source='platform' 行，不触碰爬虫外部编号。
 *         宽表/Meili 的 reference 由既有内容漂移对账与定向同步刷新，本迁移不改宽表。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 86,
  name: "rfq-reference-prefix-os-isolation",
  async up(dbPool: Pool) {
    const [res] = await dbPool.query(
      `UPDATE crm_bid_notices
       SET reference = IF(reference LIKE 'RFQ-%', CONCAT('OS', reference), reference),
           notice_id = IF(notice_id LIKE 'RFQ-%', CONCAT('OS', notice_id), notice_id)
       WHERE entry_source = 'platform'
         AND (notice_id LIKE 'RFQ-%' OR reference LIKE 'RFQ-%')`,
    );
    const changed = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    console.log(`[migration-086] 平台 RFQ 编号前缀改为 OSRFQ-：更新 ${changed} 条`);
  },
};
