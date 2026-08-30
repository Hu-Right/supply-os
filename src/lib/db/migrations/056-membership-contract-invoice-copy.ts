/**
 * 056: 企业会员套餐描述调整——合同/对公转账/发票移出编号权益
 * membership-contract-invoice-copy
 *
 * 「支付后加顾问，完成线上合同签约、对公转账确认」属于成交方式而非
 * 核心权益：从编号中移除，改为描述末尾不占编号的购买保障说明，
 * 并补上正规发票（企业报销刚需，原文案缺失）。
 *
 * 条件更新：仅当描述仍含旧文案（线上合同签约）时覆盖，
 * 运维已手工调整过的库不覆盖；重跑安全（新文案不含旧关键词）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const FLAGSHIP_DESC =
  '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n' +
  '①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\n' +
  '②入驻平台供应商库，协助撮合组建联合体投标。\n' +
  '③赠送一次UNGM注册服务。\n' +
  '本套餐支持企业合同签约、对公转账并开具正规发票。';

const PREMIUM_DESC =
  '全年最高解锁 365 条完整采购订单额度，可查看原始招标链接、下载标书文件，含中文解析报告。适合团队稳定使用。\n' +
  '①提供一对一会员专属服务群：投标顾问、专业拆标师、专属客服。\n' +
  '②入驻平台供应商库，协助撮合组建联合体投标。\n' +
  '③赠送一次UNGM注册服务。\n' +
  '④提供一次投标陪跑服务；（价值26800元）\n' +
  '本套餐支持企业合同签约、对公转账并开具正规发票。';

export const migration: Migration = {
  version: 56,
  name: "membership-contract-invoice-copy",
  async up(dbPool: Pool) {
    await dbPool.execute(
      "UPDATE crm_membership_plans SET description = ? WHERE plan_code = 'annual_16800' AND description LIKE '%线上合同签约%'",
      [FLAGSHIP_DESC],
    );
    await dbPool.execute(
      "UPDATE crm_membership_plans SET description = ? WHERE plan_code = 'annual_26800' AND description LIKE '%线上合同签约%'",
      [PREMIUM_DESC],
    );
    console.log("[migration-056] 企业会员套餐描述已更新（合同/对公/发票移出编号权益，补正规发票）");
  },
};
