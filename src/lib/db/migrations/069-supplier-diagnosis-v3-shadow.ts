/**
 * 迁移 069 · supplier_diagnosis 影子表换表升级到 V3（2026-11-23 用户拍板，结构变更走影子表）
 *
 * @module server/db/migrations/069-supplier-diagnosis-v3-shadow
 * @description 供应商诊断 V3（资质完善维度）。用户拍板三条口径：
 *              1. 在 V2 基础上升级（同表演进），强制登录态不变（user_id 保持 NOT NULL，无免登录）；
 *              2. 表单只新增「目标市场」一个字段，缺口明细在后台 PDF 报告呈现，不在表单展开；
 *              3. 「投标意愿」题下线（提交即意愿），bid_willingness 列保留 NOT NULL 并加 DEFAULT '是'
 *                 （AI 画像契约 supplier-profile.ts 仍读该列，零契约改动）。
 *              影子换表步骤（沿 013 归档先例）：建影子 → 整表复制（id/schema_version 原值保留，
 *              老 23 条保持 version=2 快照，不互比不重算）→ 双表 RENAME 原子换入，
 *              旧表归档 z_retired_supplier_diagnosis_v2（可回滚：改回名字即恢复）。
 *              幂等：逐步探测存在性；换表完成后重入直接跳过。
 *
 *              列集口径：V3 影子表 = V2 全量列 + 4 个 V3 新列，**不删任何既有列**。
 *              其中 `report_ai` 本仓已无任何引用（只有结构基线里还留着），但「顺带删列」不是
 *              换表该做的事：删死字段要独立迁移 + 证据（见 036~040 的先例），
 *              否则这次换表会静默丢数据，而且回滚时两边列集不一致。故原样保留并整列复制。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const SHADOW = "supplier_diagnosis_v3_shadow";
const RETIRED = "z_retired_supplier_diagnosis_v2";
const CURRENT = "supplier_diagnosis";

async function tableExists(dbPool: Pool, table: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table],
  );
  return Number((rows as RowDataPacket[])[0]?.n ?? 0) > 0;
}

async function columnExists(dbPool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  return Number((rows as RowDataPacket[])[0]?.n ?? 0) > 0;
}

export const migration: Migration = {
  version: 69,
  name: "supplier_diagnosis_v3_shadow_swap",
  async up(dbPool: Pool): Promise<void> {
    // 已换表（重入）：当前表已带 target_markets → 什么都不做；清理可能残留的影子表
    if (
      (await tableExists(dbPool, CURRENT)) &&
      (await columnExists(dbPool, CURRENT, "target_markets"))
    ) {
      if (await tableExists(dbPool, SHADOW)) {
        await dbPool.query(`DROP TABLE \`${SHADOW}\``);
      }
      return;
    }

    // 1) 建影子表（V3 全量 schema；加列 target_markets/qual_*；schema_version 默认 3；bid_willingness 加默认值）
    await dbPool.query(`DROP TABLE IF EXISTS \`${SHADOW}\``);
    await dbPool.query(
      `CREATE TABLE \`${SHADOW}\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NOT NULL COMMENT '提交人（登录态写入，不允许为空；V3 维持强制登录）',
        \`supplier_id\` BIGINT UNSIGNED NOT NULL COMMENT '诊断主体（supplier.id，uk_supplier 一司一份）',
        \`company_name\` VARCHAR(255) NOT NULL COMMENT '主体名称快照（仅用于历史可读，不参与评分与编辑）',
        \`english_evidence_level\` VARCHAR(40) NOT NULL COMMENT 'D2 可即时提供的英文投标资料程度',
        \`english_meeting_capability\` VARCHAR(40) NOT NULL COMMENT 'D2 英文供应商答疑会与视频澄清会能力',
        \`tender_experience\` VARCHAR(40) NOT NULL COMMENT 'D3 近24个月国际公共采购投标实际情况',
        \`tender_amount_band\` VARCHAR(40) NOT NULL COMMENT 'D3 最近一次投标金额量级',
        \`procurement_frameworks\` VARCHAR(255) NOT NULL COMMENT 'D3 熟悉的采购文件体系（逗号分隔多选）',
        \`mandatory_docs\` VARCHAR(500) NOT NULL COMMENT 'D4 可即时提供的强制文件清单（逗号分隔多选）',
        \`ungm_status\` VARCHAR(40) NOT NULL COMMENT 'D5 UNGM 注册状态',
        \`compliance_governance\` VARCHAR(40) NOT NULL COMMENT 'D5 合规专岗与整改机制',
        \`technical_response\` VARCHAR(40) NOT NULL COMMENT 'D6 按标书逐条技术响应与证明能力',
        \`cost_pricing\` VARCHAR(40) NOT NULL COMMENT 'D7 报价成本核算方式',
        \`incoterms_capability\` VARCHAR(40) NOT NULL COMMENT 'D7 多贸易条款报价能力',
        \`payment_terms\` VARCHAR(40) NOT NULL COMMENT 'D7 是否接受30天以上国际账期',
        \`export_scale\` VARCHAR(40) NOT NULL COMMENT 'D7 近2年出口与国际业务规模',
        \`submission_control\` VARCHAR(40) NOT NULL COMMENT 'D8 标书提交前复核流程',
        \`deliver_to_site\` VARCHAR(40) NOT NULL COMMENT 'D9 能否交付至项目现场国',
        \`service_countries\` TEXT NOT NULL COMMENT 'D9 有售后点、服务站或维修点的国家清单',
        \`overseas_companies\` TEXT NOT NULL COMMENT 'D9 有海外分公司投资公司的国家清单',
        \`team_discipline\` VARCHAR(40) NOT NULL COMMENT 'D10 投标团队人数与台账纪律',
        \`target_markets\` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'V3 目标市场（scope 码逗号分隔：EU/US/SA/…，与 supplier_certifications.scope 同码；空=未填，资质分级输出待补充）',
        \`bid_willingness\` VARCHAR(10) NOT NULL DEFAULT '是' COMMENT '投标意愿（V3 起表单不再询问，提交即视为愿意；历史快照保留原值；仅线索标记不参与计分）',
        \`qual_grade\` VARCHAR(2) DEFAULT NULL COMMENT 'V3 资质分级快照（A 可立即入驻 / B 补1-2项 / C 需系统建设；NULL=未分级）',
        \`qual_breakdown\` JSON DEFAULT NULL COMMENT 'V3 资质比对明细（应备清单+来源/已持/缺失/目标市场）',
        \`qual_scored_at\` DATETIME DEFAULT NULL COMMENT 'V3 资质分级快照时间',
        \`schema_version\` TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '口径代次（2=V2 投标能力诊断，3=V3 资质完善诊断；历史代次不互比不重算）',
        \`score_total\` DECIMAL(4,1) DEFAULT NULL COMMENT '评分快照总分（满分100，投标能力线）',
        \`score_grade\` VARCHAR(2) DEFAULT NULL COMMENT '评分快照等级 A/B/C（投标能力线）',
        \`score_breakdown\` JSON DEFAULT NULL COMMENT '10 维度得分明细快照（含依据与人工补充标记）',
        \`scored_at\` DATETIME DEFAULT NULL COMMENT '快照生成时间',
        \`ip\` VARCHAR(64) DEFAULT NULL COMMENT '提交IP（审计留痕）',
        \`submitted_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次提交时间',
        \`updated_at\` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        \`report_ai\` JSON DEFAULT NULL COMMENT '历史遗留列（本仓已无引用）；换表原样保留，退役另立迁移',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_supplier\` (\`supplier_id\`),
        KEY \`idx_score\` (\`score_total\`),
        KEY \`idx_submitted\` (\`submitted_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='供应商投标能力+资质完善诊断表（V3 影子换表）'`,
    );

    // 2) 整表复制（仅当现表存在；schema_version 原值随行保留，老行保持 2）
    //    `report_ai` 属历史遗留列：结构基线上有、本仓已无引用，但**老库不一定有**
    //    （早期环境可能从未加过该列）。先探测再决定复制不复制——
    //    硬写列名会让这类库在换表时直接 1054 失败，而失败发生在删旧表之前，代价是整次迁移卡住。
    if (await tableExists(dbPool, CURRENT)) {
      const baseColumns = [
        "id", "user_id", "supplier_id", "company_name",
        "english_evidence_level", "english_meeting_capability",
        "tender_experience", "tender_amount_band", "procurement_frameworks", "mandatory_docs",
        "ungm_status", "compliance_governance", "technical_response",
        "cost_pricing", "incoterms_capability", "payment_terms", "export_scale",
        "submission_control", "deliver_to_site", "service_countries", "overseas_companies",
        "team_discipline", "bid_willingness", "schema_version",
        "score_total", "score_grade", "score_breakdown", "scored_at", "ip", "submitted_at", "updated_at",
      ];
      const copyColumns = (await columnExists(dbPool, CURRENT, "report_ai"))
        ? [...baseColumns, "report_ai"]
        : baseColumns;
      const columnList = copyColumns.join(", ");
      await dbPool.query(
        `INSERT INTO \`${SHADOW}\` (${columnList}) SELECT ${columnList} FROM \`${CURRENT}\``,
      );
    }

    // 3) 原子换入（双表单条 RENAME）；旧表归档 z_retired_（可回滚）
    if (await tableExists(dbPool, CURRENT)) {
      await dbPool.query(
        `RENAME TABLE \`${CURRENT}\` TO \`${RETIRED}\`, \`${SHADOW}\` TO \`${CURRENT}\``,
      );
    } else {
      // 空库首次初始化：直接落位
      await dbPool.query(`RENAME TABLE \`${SHADOW}\` TO \`${CURRENT}\``);
    }
  },
};
