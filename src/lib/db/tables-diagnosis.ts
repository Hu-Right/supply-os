/**
 * 诊断扩展表（V3）——建表 DDL 集中在这里，启动时幂等确保存在
 *
 * @module lib/db/tables-diagnosis
 * @description 2026-11-24 用户口径：**新表直接建**，不要为"建一张新表"写编号迁移。
 *              迁移只用于「改已有表结构」（且改表要走影子换表，见 076）。
 *              本模块只做 `CREATE TABLE IF NOT EXISTS` + 种子数据 `INSERT IGNORE`，
 *              由 `ensureProcurementSchema()` 在启动时调用，对新老库都安全。
 */
import type { Pool } from "mysql2/promise";

const MARKET_REQUIREMENT_DDL = `
CREATE TABLE IF NOT EXISTS \`market_requirement\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`market\` VARCHAR(16) NOT NULL COMMENT '市场码（EU/UK/US/…）',
  \`kind\` ENUM('legal','scoring','voluntary') NOT NULL COMMENT 'legal=法定门槛 / scoring=评分 / voluntary=自愿披露',
  \`standard\` VARCHAR(120) NOT NULL COMMENT '标准号或简称（CE/CBAM/ISO14067/EPD…）',
  \`name\` VARCHAR(200) NOT NULL COMMENT '中文名称',
  \`cert_code\` VARCHAR(40) DEFAULT NULL COMMENT '可关联的证书 code（判已持用；无证书留空）',
  \`product_scopes\` JSON NOT NULL COMMENT '适用产品桶（all/eee/machinery/…）',
  \`evidence\` VARCHAR(500) NOT NULL COMMENT '需要提交的证据材料',
  \`remediation\` VARCHAR(500) NOT NULL COMMENT '整改第一步',
  \`lead_time_days\` INT DEFAULT NULL COMMENT '典型办理周期（天）',
  \`source\` VARCHAR(200) NOT NULL COMMENT '法规/标准出处',
  \`version\` VARCHAR(20) NOT NULL DEFAULT '2026-11' COMMENT '条目版本',
  \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_market_kind_standard\` (\`market\`, \`kind\`, \`standard\`),
  KEY \`idx_market_active\` (\`market\`, \`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='市场准入与绿色低碳要求条目'`;

const SUPPLIER_EVIDENCE_DDL = `
CREATE TABLE IF NOT EXISTS \`supplier_evidence\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`supplier_id\` BIGINT UNSIGNED NOT NULL COMMENT '企业主体（supplier.id）',
  \`checklist_key\` VARCHAR(80) NOT NULL COMMENT '对应补齐待办项：<市场>|<标准>',
  \`name\` VARCHAR(200) NOT NULL COMMENT '证据名称',
  \`issuer\` VARCHAR(120) DEFAULT NULL COMMENT '签发方 / 公告机构',
  \`valid_from\` DATE DEFAULT NULL,
  \`valid_to\` DATE DEFAULT NULL COMMENT '有效期至；NULL=长期有效',
  \`location\` VARCHAR(300) DEFAULT NULL COMMENT '存放位置',
  \`note\` VARCHAR(500) DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_supplier_checklist_name\` (\`supplier_id\`, \`checklist_key\`, \`name\`),
  KEY \`idx_supplier\` (\`supplier_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业证据台账（只登记元数据）'`;

/** 首批市场准入/绿色低碳要求（幂等插入） */
const SEED: ReadonlyArray<readonly [string, string, string, string, string | null, string[], string, string, number | null, string]> = [
  ["EU", "legal", "CE", "CE 标志（欧盟市场准入）", "CE", ["eee", "machinery", "toys", "medical", "construction", "energy"], "EU 符合性声明（DoC）+ 技术文件 + 公告机构证书（适用时）", "按适用指令做型式试验并留存技术文件；高风险品类需公告机构介入", 90, "EU 各指令/法规（如 (EU) 2019/1020 市场监管条例）"],
  ["EU", "legal", "CBAM", "CBAM 碳边境调节机制申报", null, ["construction", "machinery", "chemical", "energy"], "产品隐含碳排放核算报告 + 境外生产设施登记 + CBAM 申报账号", "先按 (EU) 2023/956 核算每吨产品隐含碳，再注册 CBAM 申报人（或委托进口商）", 120, "Regulation (EU) 2023/956（CBAM，过渡期后实缴）"],
  ["EU", "scoring", "ISO14067", "产品碳足迹（ISO 14067）", null, ["all"], "按 ISO 14067 出具的产品碳足迹报告（含边界、排放因子来源）", "用 ISO 14067 口径核算主销型号碳足迹，第三方核查后进标书", 60, "ISO 14067:2018；采购方气候评分项常见要求"],
  ["EU", "scoring", "EPD", "环境产品声明（EPD / EN 15804）", null, ["construction", "energy"], "经第三方验证的 EPD 文件（PCR 对应、含 GWP 等指标）", "选适用 PCR，做 LCA 后注册发布 EPD", 120, "EN 15804 / ISO 14025；绿色采购与绿色建筑评分"],
  ["EU", "voluntary", "I-REC", "可再生电力证书（I-REC / 绿证）", null, ["all"], "I-REC 或中国绿证签发记录（对应生产用电量）", "为出口产品对应的用电量采购绿证，保留签发与核销记录", 30, "I-REC 标准；客户 RE100 供应链要求"],
  ["UK", "legal", "UKCA", "UKCA 标志（英国市场准入）", "UKCA", ["eee", "machinery", "toys", "medical", "construction", "energy"], "UK 符合性声明 + 技术文件 + 指定机构证书（适用时）", "按 UK 指定标准重做符合性评估；注意与 CE 的技术文件不完全通用", 90, "UK Market Access（原 EU 指令转国内法）"],
  ["UK", "scoring", "UK-EPD", "英国净零与碳披露（PPN 06/21 类要求）", null, ["construction", "machinery", "services"], "碳减排计划（Carbon Reduction Plan）+ 组织碳足迹（ISO 14064-1）", "先出组织碳足迹，再写碳减排计划", 60, "UK PPN 06/21（公共采购碳减排计划要求）"],
  ["US", "legal", "FCC", "FCC 认证（美国无线及电子）", "FCC", ["eee"], "FCC ID / SDoC + 测试报告（47 CFR Part 15 等）", "按产品类别走 Certification 或 SDoC，先做预测试再送认可实验室", 45, "47 CFR Part 15 / Part 18"],
  ["US", "scoring", "ENERGYSTAR", "ENERGY STAR 能源之星", "ENERGYSTAR", ["eee", "machinery"], "EPA 认可实验室能效测试报告 + 产品注册", "按对应产品类别的能效规范测试并注册", 60, "US EPA ENERGY STAR 产品规范"],
  ["US", "voluntary", "LEED", "LEED 绿色建筑认证（材料与设备加分）", "LEED", ["construction", "energy"], "材料 EPD/HPD、回收成分声明、能效与水资源数据", "按 LEED v4.1 材料与资源类目准备 EPD/HPD 与成分披露", 90, "USGBC LEED v4.1"],
];

/** 幂等建表 + 灌种子；启动时由 ensureProcurementSchema 调用 */
export async function ensureDiagnosisExtensionTables(pool: Pool): Promise<void> {
  await pool.query(MARKET_REQUIREMENT_DDL);
  await pool.query(SUPPLIER_EVIDENCE_DDL);
  for (const [market, kind, standard, name, certCode, scopes, evidence, remediation, lead, source] of SEED) {
    await pool.query(
      `INSERT IGNORE INTO \`market_requirement\`
        (\`market\`, \`kind\`, \`standard\`, \`name\`, \`cert_code\`, \`product_scopes\`, \`evidence\`, \`remediation\`, \`lead_time_days\`, \`source\`, \`version\`, \`is_active\`)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, '2026-11', 1)`,
      [market, kind, standard, name, certCode, JSON.stringify(scopes), evidence, remediation, lead, source],
    );
  }
}
