/**
 * 未命中买家候选登记（buyer_candidate 的唯一写入入口）
 *
 * @module lib/services/buyer/candidates
 * @description 服务表构建/重建收尾时调用：把所有「服务表里有原始买家名、但没匹配到 buyer 实体」
 *              的来源写法登记进 buyer_candidate，供运营人工判读后补 buyer / buyer_alias。
 *              刻意**不自动创建实体**——机构归一是逐条人工确认的事，脚本批量定名会制造平行真相。
 *
 *              2026-10-31 机构口径收敛时从 notice-public/build.ts 迁出（构建器只经本模块写候选），
 *              同时修两个已知缺陷：
 *              1. `occurrence_count` 语义改为「当前未匹配公告数」——旧实现 ON DUPLICATE 累加，
 *                 每轮重建都再累一次，实测出现 41 万 > 总行数的假计数；
 *              2. 入库前过滤明显非机构名的噪声（页面错误名/URL/纯标点/纯数字），
 *                 避免候选队列被 garbage 主导（实测原 top 全是 "Error 500..."、"."、"Operator SEAP"）。
 *                 占位平台码（`eprocure_gov_in` 这类）同旧口径继续排除。
 */
import type { Pool } from "mysql2/promise";

/**
 * 把未命中的原始来源名登记到 buyer_candidate。
 *
 * 去重键沿用 `SHA2(country|raw_name)`（与 buyer_alias.alias_key 同形制）：
 * 候选是「原始写法」台账，归一/合并发生在人工确认后的 buyer_alias 写入；
 * 归一匹配（NFKC/空白折叠/大写，见 buyer/normalize）不在此处做，避免 SQL 侧重复实现一套口径。
 *
 * @returns 受影响行数（插入 + 更新；非公告条数）
 */
export async function syncBuyerCandidates(pool: Pool): Promise<number> {
  const [res] = await pool.query(
    `INSERT INTO buyer_candidate
       (candidate_key, country_code, raw_name, normalized_name, occurrence_count)
     SELECT SHA2(CONCAT(COALESCE(x.country_code, ''), '|', x.raw_name), 256),
            x.country_code,
            LEFT(x.raw_name, 500),
            LEFT(LOWER(TRIM(x.raw_name)), 500),
            COUNT(*)
       FROM (
         SELECT p.country_code, TRIM(n.agency_full) AS raw_name
           FROM notice_public p JOIN bid_notices n ON n.id = p.notice_pk
          WHERE p.buyer_id IS NULL AND n.agency_full IS NOT NULL AND TRIM(n.agency_full) <> ''
         UNION ALL
         SELECT p.country_code, TRIM(n.organization) AS raw_name
           FROM notice_public p JOIN bid_notices n ON n.id = p.notice_pk
          WHERE p.buyer_id IS NULL AND n.organization IS NOT NULL AND TRIM(n.organization) <> ''
       ) x
      WHERE x.raw_name NOT REGEXP '^[a-z]{2,}_[a-z0-9_]+$'
        AND CHAR_LENGTH(x.raw_name) >= 2
        AND x.raw_name REGEXP '[[:alpha:]]'
        AND x.raw_name NOT REGEXP '^(https?://|www\\.)'
        AND x.raw_name NOT REGEXP '^Error[[:space:]]*[0-9]{3}'
        AND NOT EXISTS (
          SELECT 1 FROM buyer_alias a
           WHERE a.alias_key = SHA2(CONCAT(COALESCE(x.country_code, ''), '|', x.raw_name), 256)
        )
      GROUP BY x.country_code, x.raw_name
     ON DUPLICATE KEY UPDATE occurrence_count = VALUES(occurrence_count),
       raw_name = VALUES(raw_name)`,
  );
  return Number((res as { affectedRows?: number }).affectedRows ?? 0);
}
