/**
 * 迁移 018 · 核验回调幂等键落库
 *
 * @module server/db/migrations/018-review-callback-id
 * @description 2026-11 审计发现的真实缺陷：`applyReviewDecision` 的幂等判定原本是
 *
 *                SELECT … WHERE project_id = ? AND version_no = ? AND evidence LIKE '%"fp":"…"%'
 *
 *              `evidence` 是 **JSON 列**，MySQL 落库后规范化为 `{"fp": "…"}`（冒号后带空格、
 *              键序可能重排），而无空格的 LIKE 模式永远命不中 → 去重分支实际上一次都没执行过。
 *              后果不是「重复发布」（version/status 两道检查挡住了），而是**后台每次超时重试
 *              都拿到 409「当前状态不接受该审核结论」**，评审后台只能判为失败并转人工直写库——
 *              正好退回 ADR-0015 批判过的「双写者、无审计、无并发保护」老路。
 *
 *              本迁移把幂等键做成数据库事实：
 *              ① `callback_id` 列 —— 存调用方 `X-Review-Request-Id`（服务层同时把内容指纹
 *                 作为缺头时的兜底值写入，保证永不为哨兵空串）；门户内部写入（自动初审）
 *                 保持 NULL。
 *              ② `(project_id, version_no, callback_id)` 唯一键 —— 并发重复投递由 1062 兜底，
 *                 不再依赖「先查后插」的时序；NULL 行不受唯一键约束（MySQL 语义），
 *                 所以自动初审可以按版本多行。
 *
 *              回放语义由服务层实现：命中既有回调键 → 直接返回首次结论（含 tenderNo），不重复改状态。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, ensureIndex, type Migration } from "./runner";

export const migration: Migration = {
  version: 18,
  name: "review_callback_id",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_reviews",
      "callback_id",
      "callback_id varchar(64) DEFAULT NULL COMMENT '回调幂等键（X-Review-Request-Id 或内容指纹）；NULL=门户内部写入（自动初审）'",
    );
    await ensureIndex(
      dbPool,
      "procurement_reviews",
      "uq_review_callback",
      "ALTER TABLE procurement_reviews ADD UNIQUE KEY uq_review_callback (project_id, version_no, callback_id)",
    );
  },
};
