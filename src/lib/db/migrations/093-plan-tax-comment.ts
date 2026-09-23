/**
 * 093: 修订套餐目录含税口径的列注释与决策记录冲突
 * plan-tax-comment
 *
 * @description 冲突缘由：`crm_plan_catalog.price_incl_tax` 建表时的列注释写
 *   「NULL=未定；未定前禁止开单」，而设计决策记录（总览 §5.2）把「付款页定稿前恒 NULL」
 *   定为**计划状态**。实库 7 档该列全为 NULL——照注释执行则切换后没有任何一档可自助成交，
 *   注释与决策互斥，必须仲裁而不是绕过。
 *
 *   仲裁结果：以决策记录为准。NULL 的表达含义收敛为"仅作报价参考、不得开票"，
 *   不再表达"禁止开单"；开票限制属于财务流程与发票系统，不该由商品目录列的注释充当闸门。
 *
 *   变更性质：**仅改列注释**，类型、可空性、取值域、数据一律不动。
 *
 *   算法选型以实测为准（2026-09-23 本库跑过）：先钉 `ALGORITHM=INPLACE` 直接被打回
 *   `ER_ALTER_OPERATION_NOT_SUPPORTED: ALGORITHM=INPLACE is not supported for this operation`——
 *   MySQL 8.0 对**改列注释**不提供 INSTANT/INPLACE 路径，只能 COPY 重建。
 *   故本迁移显式钉 `ALGORITHM=COPY, LOCK=SHARED`：允许读、短暂阻写。
 *   选它而不是放任默认值，是为了让锁级别写在代码里可审：本表是 7 行静态商品目录
 *   （无应用写入方），COPY 重建为毫秒级；若将来有人往这张表灌大量数据，
 *   这条语句会因持锁变长而显眼，而不是静默把在线流量堵在元数据锁队列里。
 *
 *   幂等：重复执行只是把同一段注释再写一遍；末尾回读逐字比对，防"半套"变更
 *   （注释改了一半 / 变更被复制表吞掉）留在这里没人发现。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "crm_plan_catalog";
const COLUMN = "price_incl_tax";

/** 与总览 §5.2 决策记录同口径；改这里必须同时改文档 */
const COLUMN_COMMENT =
  "含税口径 1=含税/0=未税/NULL=未定（付款页定稿前恒 NULL）；NULL 期间本表价格仅作报价参考、不得开票，不阻止自助成交（决策记录：docs/数据库设计/权益体系-数据库设计总览.md §5.2）";

export const migration: Migration = {
  version: 93,
  name: "093-plan-tax-comment",
  up: async (dbPool: Pool) => {
    const [before] = await dbPool.query(
      `SELECT COLUMN_COMMENT AS c, IS_NULLABLE AS n, COLUMN_TYPE AS t
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [TABLE, COLUMN],
    );
    const old = (before as Array<{ c: string; n: string; t: string }>)[0];
    if (!old) throw new Error(`[migration-093] 列不存在：${TABLE}.${COLUMN}（先确认 092 已执行）`);
    if (old.c === COLUMN_COMMENT) {
      console.log("[migration-093] 列注释已是目标值，跳过变更（幂等重跑）");
      return;
    }

    // MODIFY 必须带完整列定义：只写列名+COMMENT 会丢类型，只写 COMMENT 不带 COMMENT 会把注释清空
    await dbPool.query(
      `ALTER TABLE ${TABLE}
         MODIFY COLUMN ${COLUMN} TINYINT(1) NULL COMMENT '${COLUMN_COMMENT}',
       ALGORITHM=COPY, LOCK=SHARED`,
    );

    // 回读逐字校验：注释必须等于目标值，且类型/可空性一字未动
    const [after] = await dbPool.query(
      `SELECT COLUMN_COMMENT AS c, IS_NULLABLE AS n, COLUMN_TYPE AS t
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [TABLE, COLUMN],
    );
    const now = (after as Array<{ c: string; n: string; t: string }>)[0];
    if (!now || now.c !== COLUMN_COMMENT) {
      throw new Error(`[migration-093] 注释回读不一致：${JSON.stringify(now?.c)}`);
    }
    if (now.t !== old.t || now.n !== old.n) {
      throw new Error(
        `[migration-093] 本次只应改注释，但列定义被改动：${old.t}/${old.n} → ${now.t}/${now.n}`,
      );
    }
    console.log(`[migration-093] ${TABLE}.${COLUMN} 注释已修订（类型 ${now.t} 未变，COPY 重建后数据与列定义一致）`);
  },
};
