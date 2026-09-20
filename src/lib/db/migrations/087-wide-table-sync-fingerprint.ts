/**
 * 087: 宽表源指纹列 + 存量纠偏
 * wide-table-sync-fingerprint
 *
 * 三件事（均为幂等、分批、可重跑）：
 * 1. crm_notice_search 增加 sync_src_hash CHAR(32) —— 宽表内容与输入快照的一致性指纹，
 *    由 buildWideRow 同快照写入（宽表因此不需要任何 UPDATE，单一写入者成立）。
 *    【必须 ALGORITHM=INSTANT】实测（MySQL 8.0.46 / 宽表 462,018 行）：本表因历史多次
 *    ALTER 已不能走 INSTANT（row version 耗尽），不加限制时 InnoDB 会静默退化为
 *    copy to tmp table：实测跑了 22 分钟并持 SHARED_NO_WRITE，连带阻塞应用 8 条宽表写入
 *    排队等元数据锁。因此本迁移显式指定 ALGORITHM=INSTANT，不允许时直接报错（绝不静默
 *    降级），并要求改走停服窗口手动执行；同时将会话 lock_wait_timeout 调短，
 *    避免自己长时间占据 MDL 队列而挡住在线流量。
 * 2. 清理历史被写坏的 precise_levelN：对账曾把 candidate_code 原码写进语义为
 *    「UNSPSC 五级 ID 串」的列（D5）。做法是**清空含非数字字符的值**而非猜测映射，
 *    清空后由构建路径（loadPreciseByNoticeIds 经字典解析）按 ID 重新填回。
 *    注：2026-09-20 现网实测命中 0 行（字典 id 恰等于 code），本步为防御性措施。
 * 3. 补齐平台公告编号缺失行（create 的「INSERT 成功、回填 UPDATE 失败」路径可产生，D12），
 *    前缀与 create 现行为一致 OSRFQ-，12 位补零（宽度不足会静默截断并撞唯一键）。
 *
 * 不做：crm_bid_notices 的任何加列/加索引（现网 46 万行级、历史同类 ALTER 耗时 100 分钟，
 *      须停服窗口执行，见 spec I4 步骤 B 的 runbook）。
 *
 * 指纹初值：新列为 ''，与实时指纹必然不等 → 上线后由 detectWideFingerprintDrift 轮转
 *          逐批重建（首次相当于一轮全表重导）。【重要】本项同时修掉历史第二作者在宽表
 *          留下的错值（D4 实测 8,367 行）：因为只能检测输入侧漂移的指纹无法发现
 *          「宽表内容被旁路改坏」，而 '' 初值强制了这一次全量重导，由单一写入者重建全部行。
 *          如需一次刷齐也可走既有快路径（停服 → TRUNCATE crm_notice_search → fullBackfill 重建），
 *          本迁移内不做长事务回填，避免与在线流量争抢元数据锁。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { type Migration } from "./runner";

/** 每批处理行数：无界 UPDATE 会长时间持行锁，分批保证可中断可重跑 */
const BATCH = 5000;

/** 幂等加列（自建探测而非 ensureColumn：需要显式 ALGORITHM=INSTANT 并定制等待超时） */
async function addFingerprintColumn(dbPool: Pool): Promise<void> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notice_search' AND COLUMN_NAME = 'sync_src_hash'`,
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) > 0) {
    console.log("[migration-087] sync_src_hash 已存在，跳过加列");
    return;
  }
  // 最多等 5 秒拿元数据锁；拿不到就失败退出，不让启动过程把在线查询堆在 MDL 队列里
  await dbPool.query("SET SESSION lock_wait_timeout = 5");
  try {
    await dbPool.query(
      `ALTER TABLE crm_notice_search
         ADD COLUMN sync_src_hash CHAR(32) NOT NULL DEFAULT ''
         COMMENT '宽表内容与输入快照的一致性指纹，由 buildWideRow 同快照写入，对账只比对不修改'
         ALGORITHM=INSTANT`,
    );
    console.log("[migration-087] crm_notice_search.sync_src_hash 已添加（INSTANT）");
  } catch (err) {
    throw new Error(
      "[migration-087] 加列无法以 ALGORITHM=INSTANT 完成（本表因历史多次 ALTER 已耗尽 row version）。\n" +
      "  严禁降级为在线 COPY（实测会持锁数十分钟并阻塞应用宽表写入）。\n" +
      "  请改走停服窗口手动执行：pm2 stop → 去掉 ALGORITHM=INSTANT 重跑本条 ALTER → pm2 start。\n" +
      `  原始错误：${(err as Error).message}`,
      // 保留原始错误链（cause），供上层日志输出驱动层原始报错
      { cause: err },
    );
  }
}

/** 分批清空被写坏的 precise_levelN（含非数字/非逗号字符 = 原码污染） */
async function cleanPollutedPreciseCodes(dbPool: Pool): Promise<number> {
  const dirtyWhere = `precise_level1 REGEXP '[^0-9,]' OR precise_level2 REGEXP '[^0-9,]'
     OR precise_level3 REGEXP '[^0-9,]' OR precise_level4 REGEXP '[^0-9,]'
     OR precise_level5 REGEXP '[^0-9,]'`;
  let total = 0;
  while (true) {
    const [res] = await dbPool.query(
      `UPDATE crm_notice_search
       SET precise_level1 = '', precise_level2 = '', precise_level3 = '',
           precise_level4 = '', precise_level5 = '', sync_src_hash = ''
       WHERE ${dirtyWhere}
       LIMIT ${BATCH}`,
    );
    const affected = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    total += affected;
    if (affected < BATCH) break;
  }
  return total;
}

/** 补齐平台公告编号（与 api/rfq/create 的 OSRFQ-{id:12} 生成规则一致） */
async function backfillPlatformReference(dbPool: Pool): Promise<number> {
  let total = 0;
  while (true) {
    const [res] = await dbPool.query(
      `UPDATE crm_bid_notices
       SET reference = CONCAT('OSRFQ-', LPAD(id, 12, '0')),
           notice_id = CONCAT('OSRFQ-', LPAD(id, 12, '0'))
       WHERE entry_source = 'platform'
         AND (notice_id IS NULL OR notice_id = '' OR reference IS NULL OR reference = '')
       LIMIT ${BATCH}`,
    );
    const affected = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    total += affected;
    if (affected < BATCH) break;
  }
  return total;
}

export const migration: Migration = {
  version: 87,
  name: "wide-table-sync-fingerprint",
  async up(dbPool: Pool) {
    await addFingerprintColumn(dbPool);
    const cleaned = await cleanPollutedPreciseCodes(dbPool);
    const refFilled = await backfillPlatformReference(dbPool);
    console.log(
      `[migration-087] 完成：precise_levelN 原码清理 ${cleaned} 条，平台编号补齐 ${refFilled} 条`,
    );
  },
};
