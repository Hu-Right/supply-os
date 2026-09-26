/**
 * 099: crm_consent_log 出生结构（终结"表在本仓库没有建表迁移"的断链）
 * consent-log-birth-structure
 *
 * 背景（2026-09-26 结构核查）：
 *   - 本表此前**没有任何建表迁移**：迁移 066/067 只对它 ADD COLUMN/ADD INDEX，
 *     而 runner 的 ensureColumn 只查列不查表——全新环境重放到 066/067 会对不存在的表
 *     执行 ALTER，直接 ER_NO_SUCH_TABLE 中断启动。实库能存在是因为它在账本之外被人工/站外建好。
 *   - 代码侧 auth.repo.recordConsentLog 原硬写三个已退役的列：
 *       `user_key`（迁移 068 已把 crm_users.user_key DROP，实库 155 行恒 NULL，还挂着死索引 idx_user_key）
 *       `consent_timestamp`（前端 ISO 串只剥 T/Z 不做时区换算，落库值恒比 created_at 早 8 小时，是错值）
 *       `source_page`（全仓对本表只有一句 INSERT、零处 SELECT；155 行恒为 register，与
 *         consent_type 完全同义——注册写 terms/privacy、AI 设置页写 llm_outbound_data，光看类型就能定位场景）
 *     同意时间的事实源收敛为服务端生成的 `created_at`。
 *
 * 本迁移职责边界（重要）：
 *   **只决定全新环境的「出生结构」= 终态结构**，对已部署库是 no-op（CREATE TABLE IF NOT EXISTS
 *   命中既有表直接跳过）。已部署库上的物理删除由影子表脚本在人工窗口完成，两者收敛到同一结构：
 *     阶段一 node scripts/consent-log-shadow-phase1.mjs   （建 crm_consent_log__new + 分批回填 + 逐列校验，旧表不动）
 *     阶段二 node scripts/consent-log-shadow-phase2-cutover.mjs --confirm=phase2-cutover （补增量 + 原子 RENAME）
 *   依据 docs/adr/0003-shadow-table-blue-green-migration.md 与「列退役三段式」决策：
 *   不加自动 DROP COLUMN 迁移——否则下次部署会自动对生产活表动手，绕开人工闸口。
 *
 * ⚠ 代码同批：切换与发版必须同一窗口。旧表 consent_timestamp 是 NOT NULL 无默认值，
 *   新代码不写它会报 1364；切换后再写它会报 Unknown column。两向窗口期只丢同意日志
 *   （调用方 catch 不阻断注册），但绝不能把窗口拖长。
 *
 * 字符集/排序规则 utf8mb4 / utf8mb4_0900_ai_ci（对齐全库标准，见迁移 065 与
 * docs/数据库设计/数据库字符集与排序规则统一规范.md）；表级 + 列级 COMMENT 齐备。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 99,
  name: "consent-log-birth-structure",
  async up(dbPool: Pool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crm_consent_log (
        id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '流水主键（无业务语义，仅定位单条留痕）',
        user_id          BIGINT UNSIGNED NULL COMMENT '同意人 ID（crm_users.id）；已删用户/匿名化留痕行保持 NULL，属预期非孤儿',
        consent_type     VARCHAR(32)     NOT NULL COMMENT '同意事项：terms=用户条款 / privacy=隐私政策 / marketing=营销 / cookie=Cookie / llm_outbound_data=AI 数据出站授权',
        document_version VARCHAR(20)     NOT NULL COMMENT '被同意的协议版本号（合规举证核心：证明他同意的是当时那一版）',
        action           VARCHAR(16)     NOT NULL COMMENT '本次动作：agree=同意 / withdraw=撤回 / re-agree=重新同意；append-only，当前生效态取该 (user_id, consent_type) 最新一行',
        ip_address       VARCHAR(45)     NULL COMMENT '同意时客户端 IP（取自 x-forwarded-for 首段，属可伪造的弱证据，保留期为合规策略项）',
        user_agent       VARCHAR(512)    NULL COMMENT '同意时浏览器/设备标识（同为弱证据，辅助还原同意场景）',
        created_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '落库时间 = 服务端记录到的同意时间（本表唯一时间事实源）',
        PRIMARY KEY (id),
        INDEX idx_consent_type (consent_type),
        INDEX idx_consent_log_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        COMMENT='协议同意审计日志：注册勾选条款/隐私、AI 数据出站授权等 P0 合规留痕（append-only，撤回也新增一行）'
    `);

    // 已部署库上本表结构由影子表切换负责改；此处只做一件事：把「表不存在」这个坑堵掉。
    // 若本库该表已存在（生产/本地常态），上面一句是 no-op，本迁移不做任何 ALTER。
    const [tbl] = await dbPool.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_consent_log'`,
    );
    const [cols] = await dbPool.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_consent_log'
         AND COLUMN_NAME IN ('user_key', 'consent_timestamp', 'source_page')`,
    );
    const retiredStillPresent = Number((cols as { total: number }[])[0]?.total || 0);
    console.log(
      `[migration-099] crm_consent_log 出生结构就绪（表存在=${Number(
        (tbl as { total: number }[])[0]?.total || 0,
      ) > 0}）；退役列残留=${retiredStillPresent}` +
        (retiredStillPresent > 0
          ? "（属已部署库常态，物理删除走 scripts/consent-log-shadow-phase1/2，本迁移不 ALTER 活表）"
          : "（本环境为终态出生结构）"),
    );
  },
};
