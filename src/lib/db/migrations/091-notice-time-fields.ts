/**
 * 迁移 091 · 服务表时间字段补齐
 *
 * @module lib/db/migrations/091-notice-time-fields
 * @description 一条招标的时间链有 5 个节点，服务表原来只有 2 个（发布、投标截止）：
 *
 *                ① 发布        published_ts           已有
 *                ② 提问/澄清截止  timeline.questionsDeadline 本迁移补（JSON）
 *                ③ 投标截止      deadline_ts / deadline_sec 已有 + 本迁移补归一生成列
 *                ④ 合同工期      contract_duration_days 本迁移补
 *                ⑤ 交付期        delivery_days_required 本迁移补
 *
 *              设计取舍（与「时间字段不要爆炸」的结论一致）：
 *              - 只有投标截止配一套可信度元数据（state/type/timezone/source 在 notice_deadline），
 *                其它时间点一律塞进 `timeline` JSON，不各配元数据；
 *              - 时长用「天」不用秒：交付期/工期与时区无关，用秒还要除 86400，
 *                且夏令时会出现 23/25 小时的天；
 *              - `deadline_sec` 是普通 BIGINT 列（不是 STORED 生成列）：`deadline_ts` 实测秒/毫秒
 *                混存，需要归一；但 64.9 万行、经隧道访问的库上，STORED 生成列会触发整表 copy
 *                （实测 >6 分钟并阻塞应用查询），因此改为「INSTANT 加列 + 分批回填 + 构建器写入」。
 *
 *              幂等：逐列检查 information_schema；已存在的列直接跳过。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "notice_public";

/** 当前表的列集合 */
async function columnSet(dbPool: Pool): Promise<Set<string>> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [TABLE],
  );
  return new Set(rows.map((r) => String(r.c)));
}

export const migration: Migration = {
  version: 91,
  name: "notice_time_fields",
  async up(dbPool: Pool): Promise<void> {
    const have = await columnSet(dbPool);

    // ① 交付期（天）：时间可行性判定的核心——认证周期 + 生产 + 物流 是否 ≤ 交付期
    if (!have.has("delivery_days_required")) {
      await dbPool.query(
        `ALTER TABLE ${TABLE} ADD COLUMN delivery_days_required INT NULL
          COMMENT '交付期（天）：合同生效→交付；由附件/正文抽得，用于时间可行性判定'`,
      );
    }

    // ② 合同工期/服务期（天）：框架协议、运维类标的硬约束
    if (!have.has("contract_duration_days")) {
      await dbPool.query(
        `ALTER TABLE ${TABLE} ADD COLUMN contract_duration_days INT NULL
          COMMENT '合同工期/服务期（天）：框架协议、运维类标的核心约束'`,
      );
    }

    // ③ 次要时间点集合：不给每个时间点各配 state/type/timezone，统一收进 JSON
    if (!have.has("timeline")) {
      await dbPool.query(
        `ALTER TABLE ${TABLE} ADD COLUMN timeline JSON NULL
          COMMENT '次要时间点（UTC 秒）：{"questionsDeadline","siteVisit","award","deliveryRaw"}；缺键即无该节点'`,
      );
    }

    // ④ 投标截止归一为秒（秒/毫秒混存 → 统一秒，供排序/筛选；与 bid_notices.deadline_sec 同口径）
    //
    //    不用 STORED 生成列：本库 64.9 万行、经隧道访问，STORED 生成列会触发整表 copy
    //    （实测 copy 阶段 >6 分钟且阻塞应用查询，被迫 kill）。改为普通列：
    //    - 加列走 INSTANT 算法（秒级）
    //    - 历史数据由 scripts/tools/backfill-notice-deadline-sec.ts 分批回填
    //    - 新数据由服务表构建器写入时计算（单一写入者口径）
    if (!have.has("deadline_sec")) {
      await dbPool.query(
        `ALTER TABLE ${TABLE} ADD COLUMN deadline_sec BIGINT NULL
          COMMENT '投标截止归一为 UTC 秒（构建器写入 + 历史回填；不手写）'`,
      );
    }
  },
};
