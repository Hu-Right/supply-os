/**
 * 008 · 统一订单表（orders）
 *
 * @module server/db/migrations/008-orders-unified
 * @description 四张分散的订单表（payment_orders / learning_orders / service_orders /
 *              training_orders）收敛为一张 `orders`。**本迁移只建表，不迁数据、不改写入方**——
 *              写入仍走原四表，等回填脚本与双写验证通过后再切读。
 *
 *   为什么合成一张：四张表记的核心是同一件事（谁、买了什么、多少钱、付没付成功），
 *   差异字段全是快照（quantity / unit_price / industry_code / notice_id），从不参与筛选排序。
 *   唯一的真实查询是「我的订单」跨类型分页，而它现在是四表各拉全量再内存归并
 *   （见 payment/orchestrator.listAllOrders），分表在唯一的高频查询上就是负债。
 *
 *   **为什么不建 order_items**（此处修正 2026-11-12 早先的设计）：
 *   全库当前 100% 是一单一件。"打包套餐含多件"是多件商品塞进**一个 SKU**，
 *   结算单位仍是 1 —— 财务只认「卖了一个套餐 12.9」，不是「卖了两份资料各 6.45」；
 *   把它拆成 N 条子商品行，就必须编一个金额分摊规则，那是造数据。
 *   包含关系属于「这笔交易的构成快照」，放 `items_snapshot` JSON 即可
 *   （原 `bundle_items` 也只是塞进 raw_request，从未落成结构化明细）。
 *   **拆表触发条件**（任一满足再建 order_items，届时从 JSON 回迁，量极小）：
 *   ① 出现购物车语义（一次结算多个不同 SKU）；② 需要按子商品维度做退款/对账；
 *   ③ 需要「哪些订单包含商品 X」的反查。
 *
 *   DDL 幂等（CREATE TABLE IF NOT EXISTS），可安全重复执行。
 */
import type { Pool } from "mysql2/promise";

export const migration = {
  version: 8,
  name: "orders-unified",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`order_no\` varchar(80) NOT NULL COMMENT '业务单号；SO/SV/LE/TR 前缀保留（支付回调与对账按前缀路由）',
        \`user_id\` bigint unsigned DEFAULT NULL COMMENT '下单用户；培训单允许匿名下单，故可空',
        \`product_kind\` varchar(16) NOT NULL COMMENT 'plan/service/material/bundle/course，取值见 shared/constants/product-kind',
        \`product_code\` varchar(64) NOT NULL COMMENT '目录主键（service 含 svc_ 前缀；material/bundle 为剥前缀后的主键；course 为课程 id）',
        \`product_name\` varchar(255) NOT NULL DEFAULT '' COMMENT '下单时的商品名快照：目录改名不影响历史单',
        \`unit_price\` decimal(10,2) NOT NULL COMMENT '单价；培训/服务为 ×数量 前的单价，会员/学习为同 amount',
        \`quantity\` int unsigned NOT NULL DEFAULT '1' COMMENT '数量：培训=人数，其余恒 1',
        \`amount\` decimal(10,2) NOT NULL COMMENT '应付总额（已含升级差价、年包抵扣后的实付）',
        \`currency\` varchar(10) NOT NULL DEFAULT 'CNY',
        \`status\` varchar(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/paid/closed/failed/refunded/expired，取值见 shared/constants/order-status。用 varchar 而非 enum：状态集合跨四业务且会继续增（部分退款/发票态），enum 每加一次要 DDL 锁表',
        \`provider\` varchar(20) NOT NULL COMMENT 'alipay/wechat/mock；增值服务原表无渠道列，回填时写 service',
        \`provider_trade_no\` varchar(120) DEFAULT NULL,
        \`pay_url\` text COMMENT '渠道下单返回的支付跳转地址（支付宝为 redirect 前的网关值）',
        \`qr_code_url\` text COMMENT '渠道二维码原文，响应时按需转 data URL',
        \`order_type\` varchar(20) NOT NULL DEFAULT 'new' COMMENT 'new/upgrade/renew',
        \`original_order_no\` varchar(80) DEFAULT NULL COMMENT '升级/抵扣的来源单号（核销锚点）',
        \`industry_code\` varchar(32) DEFAULT NULL COMMENT '行业墙 L1 快照（购买时选定）',
        \`notice_id\` bigint unsigned DEFAULT NULL COMMENT '来源商机（可空）',
        \`granted_subscription_id\` bigint unsigned DEFAULT NULL COMMENT '履约外键：本单发放的订阅（会员单 / 赠订阅的服务单）',
        \`granted_registration_id\` bigint unsigned DEFAULT NULL COMMENT '履约外键：培训报名行',
        \`items_snapshot\` json DEFAULT NULL COMMENT '这笔交易的构成快照：打包套餐的 includedIds、培训的 schedule_id、服务的 sale_mode 等',
        \`raw_request\` json DEFAULT NULL COMMENT '渠道下单原文（排障/纠纷取证）',
        \`raw_notify\` json DEFAULT NULL COMMENT '支付回调原文',
        \`paid_at\` datetime DEFAULT NULL,
        \`expires_at\` datetime DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_orders_order_no\` (\`order_no\`),
        KEY \`idx_orders_user_created\` (\`user_id\`,\`created_at\`),
        KEY \`idx_orders_status_created\` (\`status\`,\`created_at\`),
        KEY \`idx_orders_kind_code\` (\`product_kind\`,\`product_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT='统一订单头：钱与状态。四张旧订单表的收敛目标，明细构成见 items_snapshot'`,
    );
  },
};
