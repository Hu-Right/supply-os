/**
 * 107: 权益额度账本精简 · 影子表阶段一（只建新表，旧表继续跑）
 * benefit-quotas-shadow-phase1
 *
 * @description 按 ADR-0003，对 crm_benefit_quotas 做三处精简，属"改列类型/删列/删索引"
 *              的高风险变更（既有行需重写、约束要重建），因此走影子表两阶段：
 *              本迁移是**阶段一**——只创建 `crm_benefit_quotas__new` 终态结构，
 *              旧表一个字节不碰，生产读写继续走旧表；切换在阶段二脚本
 *              （scripts/benefit-quotas-shadow-phase2-cutover.mjs）经人工闸口执行。
 *
 *              三处精简与判据（均为实测，非推测）：
 *              1) 删 `period`：ENUM('none','monthly','yearly') 恒为 'none'——openQuotaPool
 *                 的 3 个调用点（benefit-grant / grantQuotaPoolsForPlan / unlock-quota）
 *                 无一传 period，且全库无周期重置调度。"每月1次顾问咨询"既无对应计量权益
 *                 也无实现，留着这一列等于留一个永远说"none"的假事实源。
 *              2) `status` 去掉 'expired' 成员：过期由订阅侧表达（crm_plan_subscriptions
 *                 .status/expires_at），池只被置 active/exhausted/frozen——全库不存在把池
 *                 写成 expired 的路径（退款与到期承接都写 frozen）。
 *              3) 删 `idx_consume (user_id, benefit_code, status, period_starts_at)`：
 *                 两条真实查询（findAndLockCurrentPool / listQuotaBalances）的谓词改用
 *                 `subscription_pool_key = ?`（普通用户池传 0），使 uk_pool 的最左前缀
 *                 (pool_key, user_id, benefit_code, period_starts_at) 完整覆盖等值 + 范围，
 *                 且 InnoDB 二级索引隐含 PK 尾部，正好供 `ORDER BY period_starts_at DESC,
 *                 id DESC LIMIT 1` 反向扫描；旧索引里夹在中间的 status 反而挡住了
 *                 period_starts_at 的有序利用。
 *
 *              同时收口两处纪律（借本次重建一并落地，避免"精简后仍留活口"）：
 *              - `period_starts_at` 去掉 DEFAULT CURRENT_TIMESTAMP：该列默认值是逐行求值的
 *                行级时间戳，而 uk_pool 含它——依赖默认值等于让"同池重发只抬额不重置"的
 *                幂等只在同一秒内成立（092/105 注释与本仓 test 缺陷 7 均记过此坑）。
 *                改为无默认，漏传即 1364 报错，而不是静默拿到 NOW()。
 *              - 表注释与列注释里的"周期"措辞改为"发放代次"：period 列退场后，
 *                period_starts_at 的真实职责是幂等锚点（订阅池=该订阅 started_at、
 *                普通用户池=1970-01-01 终身哨兵），继续叫"周期起点"会误导后来人。
 *
 *              ⚠️ 约束名的阶段性妥协：MySQL 的 FK 与 CHECK 约束名在**库内**唯一
 *              （不像索引名只在表内唯一），影子表与旧表并存期间不能重名，故本表用
 *              `fk_quota_sub__new` / `fk_quota_benefit__new` / `chk_usage__new`；
 *              阶段二 RENAME 之后立即原样重建为规范名（约束定义不变，只换名）。
 *
 *              数据：本表当前 0 行（迁移 105 刚 DROP+CREATE 重建，池按需懒物化），
 *              故阶段一无需回填；阶段二脚本仍会做"补增量 + 逐行 NULL-safe 全等校验"，
 *              以便任何时点重跑本流程都成立（不假设"一定是空表"）。
 *
 *              幂等：CREATE TABLE IF NOT EXISTS + 末尾结构自检（列集/索引集/约束名三项
 *              必须逐字等于终态），可安全重跑；不符即抛错，防"半套"影子表被阶段二当合格。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 影子表名（阶段二 RENAME 后退场） */
export const SHADOW_TABLE = "crm_benefit_quotas__new";

/** 终态列集（顺序敏感：阶段二自检与回填 SELECT 都按此列清单拼） */
export const TERMINAL_COLUMNS = [
  "id",
  "subscription_id",
  "subscription_pool_key",
  "user_id",
  "benefit_code",
  "quota_total",
  "quota_used",
  "period_starts_at",
  "status",
  "created_at",
  "updated_at",
] as const;

/** 本次精简掉的结构（列 + 索引）：影子表若仍存在即未落地，自检须报错 */
export const RETIRED_STRUCTURES = ["period", "idx_consume"] as const;

/** 阶段一在位的约束名（带 __new 后缀）；阶段二重建为去后缀的规范名 */
export const PHASE1_CONSTRAINTS = ["fk_quota_sub__new", "fk_quota_benefit__new", "chk_usage__new"] as const;

const DDL = `
  CREATE TABLE IF NOT EXISTS \`${SHADOW_TABLE}\` (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subscription_id       BIGINT UNSIGNED NULL COMMENT 'FK crm_plan_subscriptions：额度随订阅生灭；NULL=普通用户池（免费档计量权益）',
    subscription_pool_key BIGINT GENERATED ALWAYS AS (IFNULL(subscription_id, 0)) STORED COMMENT '生成列：把普通用户池的 NULL 归一为 0，使其可参与唯一约束',
    user_id               BIGINT UNSIGNED NOT NULL COMMENT '额度持有用户：订阅池记主账号，普通用户池记本人',
    benefit_code          VARCHAR(64)  NOT NULL COMMENT 'FK crm_benefit_catalog：本池计量哪种权益（计量型判据唯一为 value_kind=quota）',
    quota_total           INT          NOT NULL COMMENT '总额度；-1=不限（不限行不记消耗）',
    quota_used            INT          NOT NULL DEFAULT 0 COMMENT '已用量；quota_total=-1 时恒为 0',
    period_starts_at      DATETIME     NOT NULL COMMENT '池的发放代次起点=幂等锚点：订阅池取该订阅 started_at、普通用户池取 1970-01-01 终身哨兵；故意不给默认值——本列参与 uk_pool，写行级时间戳会让同池重发另开一行满额池',
    status                ENUM('active','exhausted','frozen') NOT NULL DEFAULT 'active' COMMENT '仅 active 可扣减；扣满置 exhausted、退款/升级承接置 frozen；订阅过期由 crm_plan_subscriptions 表达，本表不设 expired',
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pool (subscription_pool_key, user_id, benefit_code, period_starts_at),
    KEY idx_subscription (subscription_id, status),
    KEY fk_quota_benefit (benefit_code),
    CONSTRAINT fk_quota_sub__new     FOREIGN KEY (subscription_id) REFERENCES crm_plan_subscriptions (id),
    CONSTRAINT fk_quota_benefit__new FOREIGN KEY (benefit_code)    REFERENCES crm_benefit_catalog (benefit_code),
    CONSTRAINT chk_usage__new CHECK (quota_used BETWEEN 0 AND GREATEST(quota_total, 0))
  ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
     COMMENT='权益额度账本表：按（订阅 × 用户 × 权益 × 发放代次）记录可消耗额度的总量与已用量，是全库唯一的额度扣减落点'`;

/** 终态索引集（不含已删的 idx_consume） */
const TERMINAL_INDEXES = ["PRIMARY", "uk_pool", "idx_subscription", "fk_quota_benefit"];

export const migration: Migration = {
  version: 107,
  name: "benefit-quotas-shadow-phase1",
  async up(dbPool: Pool) {
    await dbPool.query(DDL);

    // ── 自检 1：列集逐字等于终态（多一列=未精简，少一列=半套） ──
    const [colRows] = await dbPool.query(
      `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [SHADOW_TABLE],
    );
    const gotCols = (colRows as Array<{ c: string }>).map((r) => r.c);
    if (JSON.stringify(gotCols) !== JSON.stringify(TERMINAL_COLUMNS)) {
      throw new Error(
        `[migration-107] 影子表列集与终态不符：期望 [${TERMINAL_COLUMNS.join(",")}] 实得 [${gotCols.join(",")}]`,
      );
    }

    // ── 自检 2：被精简的结构确实不在位 ──
    const [idxRows] = await dbPool.query(
      `SELECT DISTINCT INDEX_NAME AS i FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [SHADOW_TABLE],
    );
    const gotIdx = (idxRows as Array<{ i: string }>).map((r) => r.i).sort();
    if (gotCols.includes("period") || gotIdx.includes("idx_consume")) {
      throw new Error(`[migration-107] 影子表仍残留退役结构（period/idx_consume）：索引 [${gotIdx.join(",")}]`);
    }
    if (JSON.stringify(gotIdx) !== JSON.stringify([...TERMINAL_INDEXES].sort())) {
      throw new Error(
        `[migration-107] 影子表索引集与终态不符：期望 [${[...TERMINAL_INDEXES].sort().join(",")}] 实得 [${gotIdx.join(",")}]`,
      );
    }

    // ── 自检 3：约束名为阶段一约定（阶段二据此重建规范名） ──
    const [csRows] = await dbPool.query(
      `SELECT CONSTRAINT_NAME AS n FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE IN ('FOREIGN KEY','CHECK')`,
      [SHADOW_TABLE],
    );
    const gotCs = (csRows as Array<{ n: string }>).map((r) => r.n).sort();
    const wantCs = [...PHASE1_CONSTRAINTS].sort();
    if (JSON.stringify(gotCs) !== JSON.stringify(wantCs)) {
      throw new Error(`[migration-107] 影子表约束名与阶段一约定不符：期望 [${wantCs.join(",")}] 实得 [${gotCs.join(",")}]`);
    }

    // ── 自检 4：status 取值域已收窄（ENUM 成员数=3，无 expired） ──
    const [enumRows] = await dbPool.query(
      `SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'status'`,
      [SHADOW_TABLE],
    );
    const enumType = String((enumRows as Array<{ t: string }>)[0]?.t ?? "");
    if (!enumType.includes("'active'") || !enumType.includes("'exhausted'") || !enumType.includes("'frozen'") || enumType.includes("'expired'")) {
      throw new Error(`[migration-107] status 取值域未收窄为三值：${enumType}`);
    }

    console.log(
      `[migration-107] 影子表 ${SHADOW_TABLE} 已就绪（11 列终态：去 period、去 idx_consume、status 三值、period_starts_at 无默认）。` +
        `旧表未触碰，生产读写仍走旧表；切换请跑 scripts/benefit-quotas-shadow-phase2-cutover.mjs（人工闸口）。`,
    );
  },
};
