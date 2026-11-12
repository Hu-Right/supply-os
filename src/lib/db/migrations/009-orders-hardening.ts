/**
 * 009 · orders 硬化（定位收口：在线支付订单头）
 *
 * @module lib/db/migrations/009-orders-hardening
 * @description 2026-11-12 定稿，008 的第二阶段。orders 定位收口为「在线支付订单头」：
 *              provider 只可能是真实网关渠道（alipay/wechat，mock 仅测试）；线下成交
 *              （增值服务 lead/contract 形态）**不进本表**，由 service_orders 台账承载
 *              （lead→转报价→核销，contract_ref / granted_subscription_id 一套字段现成）。
 *              哨兵 provider='service' 随之退役——self 模式明明走网关收款，旧写法却
 *              硬编码 'service'，线上付款的单查不出渠道（同日代码修正）。
 *
 *   - refund_amount / refunded_at：退款金额与时间承载。此前 status='refunded'
 *     无金额列，部分退款无法表达；全额退 = refund_amount = amount
 *   - admin_note：后台人工备注（核销说明/赠送/改价缘由），此前无留痕处
 *   - user_id 收紧 NOT NULL：四种业务下单入口均已强制登录（training route 亦然），
 *     匿名单在「我的订单」永远不可见、履约无人认领，语义上不应存在
 *   - notice_id 删除：死列（「带商机买会员」旧玩法已退役，存量仅 1 行 2026-07 老单有值）；
 *     随列退役的还有 returnUrl 拼 notice_id 参数的残迹（另见 PaymentService）
 *   - provider CHECK：枚举锁 alipay/wechat/mock（mock 仅测试）
 *   - granted_* 互斥 CHECK：一单至多命中一种履约
 *   - idx_orders_status_expires：过期清扫统一走 expires_at 列。各 kind 下单时统一落
 *     expires_at：plan/material/bundle/service = 2h 兜底窗（刻意宽于网关
 *     timeout_express 30 分钟，防 DB 先关吞掉迟到回调）、course = 期次截止。
 *     sweeper 由「created_at+2h 常量 × 3 组 + course 一组」收敛为按 expires_at 的
 *     两条 SQL，行为逐字等价（存量 7 行均已 closed/paid，无需回填）
 *
 *   product_code 语义澄清（无结构变更，修正 008 注释的含混表述）：一律存
 *   「目录主键原值」——service_catalog.service_code 自带 svc_（是 SKU 码本体，
 *   剥了查不到目录行），learning_materials.material_id / bundle id 为裸值
 *   （material_/bundle_ 是订单侧命名空间，落库前已剥），plan 为 plan_code 原码，
 *   course 为课程 id。类型判断只认 product_kind；旧码形仅存于读路径展示还原
 *   （orchestrator.legacyProductCode）。
 *
 *   DDL 幂等（information_schema 探针），可安全重复执行。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ensureColumn, ensureColumnType, ensureIndex } from "../migrations/runner";

async function countColumn(dbPool: Pool, table: string, column: string): Promise<number> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number((rows as RowDataPacket[])[0]?.total || 0);
}

async function dropColumnIfExists(dbPool: Pool, table: string, column: string): Promise<void> {
  if ((await countColumn(dbPool, table, column)) > 0) {
    await dbPool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
  }
}

async function ensureCheck(
  dbPool: Pool,
  table: string,
  constraintName: string,
  checkExpr: string,
): Promise<void> {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
    [table, constraintName],
  );
  if (Number((rows as RowDataPacket[])[0]?.total || 0) === 0) {
    await dbPool.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` CHECK (${checkExpr})`);
  }
}

export const migration = {
  version: 9,
  name: "orders-hardening",
  async up(dbPool: Pool): Promise<void> {
    // 注意：runner 的 assertSafeDdlFragment 禁止片段中出现反引号/分号，列定义一律裸写
    await ensureColumn(dbPool, "orders", "refund_amount",
      "refund_amount decimal(10,2) DEFAULT NULL COMMENT '累计退款额；NULL=未退过，全额退=amount'");
    await ensureColumn(dbPool, "orders", "refunded_at",
      "refunded_at datetime DEFAULT NULL COMMENT '最近一次退款时间'");
    await ensureColumn(dbPool, "orders", "admin_note",
      "admin_note varchar(255) DEFAULT NULL COMMENT '后台人工备注（核销说明/赠送/改价缘由）'");

    await ensureColumnType(dbPool, "orders", "user_id",
      "user_id bigint unsigned NOT NULL COMMENT '下单用户（四种业务下单入口均已强制登录）'");

    await dropColumnIfExists(dbPool, "orders", "notice_id");

    await ensureCheck(dbPool, "orders", "chk_orders_provider",
      "provider IN ('alipay','wechat','mock')");
    await ensureCheck(dbPool, "orders", "chk_orders_grant_mutual",
      "granted_subscription_id IS NULL OR granted_registration_id IS NULL");

    await ensureIndex(dbPool, "orders", "idx_orders_status_expires",
      "ALTER TABLE orders ADD KEY idx_orders_status_expires (status, expires_at)");
  },
};
