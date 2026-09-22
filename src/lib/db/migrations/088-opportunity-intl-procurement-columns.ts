/**
 * 088: crm_bid_opportunities 增加「国际公共采购」结构化列
 * intl-procurement-columns
 *
 * 背景：机会表此前只承载「摘要 + 三段长文本（资格/条件/技术门槛）」，无法表达国际标独有的
 *      程序属性与担保条款。以摩洛哥 ONEE 抽蓄 EPC 招标（AOI SP4130189）为基准做字段覆盖度
 *      核对后，下列 17 项在全库无任何落点：采购程序与是否预审、标段结构、合同形式、联合体规则、
 *      投标有效期天数、递交方式与封装与送达地址、融资机构与额度、评标方法与成本模型、语言与
 *      译文要求、合同工期、本地成分、ESHS、合格国、关键节点。
 *
 * 为何加在机会表而不是宽表 / 公告主表（2026-09-21 本地镜像库实测，MySQL 8.0.46）：
 * - crm_bid_opportunities 12,777 行：ADD COLUMN ... ALGORITHM=INSTANT 实测 385ms 通过；
 * - crm_notice_search 462,152 行：INSTANT 被直接拒绝（同定义空白副本可通过 → 属运行态阻塞，
 *   MySQL 未给出原因），退到 ALGORITHM=INPLACE,LOCK=NONE 仍需 32.4s（本机无并发），现网不可接受，
 *   且现网另有库外遗留 FULLTEXT 索引（见 087 取证）；
 * - crm_bid_notices 462,164 行 + 3 个 FULLTEXT 索引：INSTANT 明确报
 *   "InnoDB presently supports one FULLTEXT index creation at a time"，一律禁止（同 087 约束）。
 *
 * 本迁移不写宽表：新列属详情级信息，详情页经 services/notices/featured.ts 的机会字段清单 +
 * normalizeNoticeDetailPayload 合并读出；搜索侧由 opp.description 经
 * DESC_SOURCE_EXPR = COALESCE(opp.description, n.description) 天然进宽表与六语列与索引。
 *
 *  INSTANT 版本纪律：每条 ADD COLUMN 语句消耗一个 InnoDB 行版本（表当前 TOTAL_ROW_VERSIONS=5，
 * 上限 64），故 17 列**合并为一条 ALTER** 只占 1 个版本，同时减少 MDL 往返。
 */
import type { Pool } from "mysql2/promise";
import { type Migration } from "./runner";

/** 列定义（名称 → 完整 ADD COLUMN 片段），顺序即建表顺序 */
const COLUMNS: Array<[string, string]> = [
  ["procurement_procedure", "procurement_procedure VARCHAR(60) NULL COMMENT '采购程序：AOI一步法/两阶段/有预审等'"],
  ["prequalification_required", "prequalification_required TINYINT(1) NULL COMMENT '是否需事先资格预审：1是0否，NULL未说明'"],
  ["lot_structure", "lot_structure VARCHAR(255) NULL COMMENT '标段结构：单一不可分割/N标段，是否接受部分投标'"],
  ["contract_form", "contract_form VARCHAR(60) NULL COMMENT '合同形式：EPC交钥匙/单价/总价/框架协议'"],
  ["consortium_rule", "consortium_rule VARCHAR(500) NULL COMMENT '联合体规则：是否允许、强制成员、责任形式'"],
  ["bid_validity_days", "bid_validity_days SMALLINT UNSIGNED NULL COMMENT '投标有效期（天）'"],
  ["submission_mode", "submission_mode VARCHAR(30) NULL COMMENT '递交方式：paper纸质/electronic电子/both'"],
  ["submission_requirement", "submission_requirement VARCHAR(500) NULL COMMENT '封装与份数要求：正本/副本/USB、信封规则'"],
  ["submission_address", "submission_address VARCHAR(500) NULL COMMENT '递交送达地址与递交通道'"],
  ["funding_agency", "funding_agency VARCHAR(300) NULL COMMENT '资金融出方与融资额度（非合同估算价）'"],
  ["evaluation_method", "evaluation_method VARCHAR(500) NULL COMMENT '评标方法与成本模型口径'"],
  ["language_requirement", "language_requirement VARCHAR(300) NULL COMMENT '投标文件语言与译文认证要求'"],
  ["execution_period", "execution_period VARCHAR(100) NULL COMMENT '合同工期原文（如 48 个月）'"],
  ["local_content", "local_content VARCHAR(300) NULL COMMENT '本地成分与本地执行要求'"],
  ["eshs_requirements", "eshs_requirements TEXT NULL COMMENT '环境与社会及健康安全（ESHS）要求'"],
  ["eligible_countries", "eligible_countries VARCHAR(300) NULL COMMENT '合格投标人国别范围'"],
  ["key_dates", "key_dates TEXT NULL COMMENT '关键节点 JSON：发布/准备会/踏勘/澄清截止/递交截止/开标'"],
];

/**
 * 幂等批量加列：先探测缺失列，再合并为一条 ALTER TABLE 执行。
 *
 * 故意不复用 runner.ensureColumn —— 它按列逐条 ALTER（17 个版本 + 17 次 MDL），
 * 也不允许钉死 ALGORITHM。此处与 087 同源纪律：钉 INSTANT、短 lock_wait_timeout、
 * 不允许静默降级（降级即 COPY 全表重建并持 SHARED_NO_WRITE，会阻塞在线写入）。
 */
async function addColumnsInstant(pool: Pool, table: string, defs: Array<[string, string]>): Promise<string[]> {
  const names = defs.map(([n]) => n);
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (${names.map(() => "?").join(",")})`,
    [table, ...names],
  );
  const existing = new Set((rows as Array<{ COLUMN_NAME: string }>).map((r) => r.COLUMN_NAME));
  const missing = defs.filter(([n]) => !existing.has(n));
  if (missing.length === 0) return [];

  // 最多等 5 秒拿元数据锁；拿不到即失败退出，不把在线查询堆进 MDL 队列
  await pool.query("SET SESSION lock_wait_timeout = 5");
  const clauses = missing.map(([, ddl]) => `ADD COLUMN ${ddl}`).join(",\n       ");
  await pool.query(`ALTER TABLE ${table}\n       ${clauses},\n       ALGORITHM=INSTANT`);
  return missing.map(([n]) => n);
}

export const migration: Migration = {
  version: 88,
  name: "intl-procurement-columns",
  async up(dbPool: Pool) {
    let added: string[];
    try {
      added = await addColumnsInstant(dbPool, "crm_bid_opportunities", COLUMNS);
    } catch (err) {
      throw new Error(
        "[migration-088] 机会表加列未能以 ALGORITHM=INSTANT 完成。\n" +
        "  本迁移故意不允许降级：走 COPY 会重建表并在收尾升级排他锁。\n" +
        "  下一步：确认原始错误后，在停服窗口（pm2 stop）去掉 ALGORITHM=INSTANT 重跑，再启服。\n" +
        `  原始错误：${(err as Error).message}`,
        { cause: err },
      );
    }
    console.log(
      added.length > 0
        ? `[migration-088] crm_bid_opportunities 已新增 ${added.length} 列：${added.join(", ")}`
        : "[migration-088] 国际采购结构化列已全部存在，跳过加列",
    );
  },
};
