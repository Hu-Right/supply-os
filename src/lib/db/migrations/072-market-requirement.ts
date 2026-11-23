/**
 * 迁移 072 · 市场要求条目表（market_requirement）
 *
 * @module lib/db/migrations/072-market-requirement
 * @description 结构缺口（2026-11-23 复盘）：原来只有一张 `supplier_certifications`，
 *              既当"证书字典"又当"某市场的要求"用，于是要求只能用「国家 scope + 性质 category」
 *              两个字段表达。后果：
 *              1. 不绑国家的（global）永远进不了应备清单——光伏的 IEC61215 就这样被 global 过滤掉；
 *              2. 性质是 esg/management 的低碳类被一刀切排除——CBAM 这种**法定**门槛也跟着消失；
 *              3. 表达不了"谁提的要求、什么效力、管哪类产品、依据哪条法规"。
 *
 *              本表把「要求」从证书字典里独立出来：
 *              - `kind`：legal（法定门槛，决定 A/B/C）/ scoring（招标或客户评分项）/ voluntary（自愿披露）；
 *              - `productScopes`：适用产品桶（与 shared/constants/product-scopes 同码）；
 *              - `source`：法规或平台出处，报告要印出来；
 *              - `cert_code`：能对上证书字典的就挂 code（用来判"已持"），对不上（CBAM/EPD）留空，
 *                已持判定降级为"档案里是否有同标准记录"→ 目前视为未持，报告如实写"待核验"。
 *
 *              幂等：CREATE TABLE IF NOT EXISTS + 唯一键 INSERT IGNORE，重跑不重复插。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "market_requirement";

interface SeedRow {
  market: string;
  kind: "legal" | "scoring" | "voluntary";
  standard: string;
  name: string;
  certCode: string | null;
  productScopes: string[];
  evidence: string;
  remediation: string;
  leadTimeDays: number | null;
  source: string;
}

/** 首批：EU / UK / US 共 10 条（法定 4 条 + 评分 4 条 + 自愿 2 条） */
const SEEDS: readonly SeedRow[] = [
  // ── 欧盟 ──
  {
    market: "EU", kind: "legal", standard: "CE", name: "CE 标志（欧盟市场准入）", certCode: "CE",
    productScopes: ["eee", "machinery", "toys", "medical", "construction", "energy"],
    evidence: "EU 符合性声明（DoC）+ 技术文件 + 公告机构证书（适用时）",
    remediation: "按适用指令做型式试验并留存技术文件；高风险品类需公告机构介入",
    leadTimeDays: 90, source: "EU 各指令/法规（如 (EU) 2019/1020 市场监管条例）",
  },
  {
    market: "EU", kind: "legal", standard: "CBAM", name: "CBAM 碳边境调节机制申报", certCode: null,
    productScopes: ["construction", "machinery", "chemical", "energy"],
    evidence: "产品隐含碳排放核算报告 + 境外生产设施登记 + CBAM 申报账号",
    remediation: "先按 (EU) 2023/956 核算每吨产品隐含碳，再注册 CBAM 申报人（或委托进口商）",
    leadTimeDays: 120, source: "Regulation (EU) 2023/956（CBAM，过渡期后实缴）",
  },
  {
    market: "EU", kind: "scoring", standard: "ISO14067", name: "产品碳足迹（ISO 14067）", certCode: null,
    productScopes: ["all"],
    evidence: "按 ISO 14067 出具的产品碳足迹报告（含边界、排放因子来源）",
    remediation: "用 ISO 14067 口径核算主销型号碳足迹，第三方核查后进标书",
    leadTimeDays: 60, source: "ISO 14067:2018；采购方气候评分项常见要求",
  },
  {
    market: "EU", kind: "scoring", standard: "EPD", name: "环境产品声明（EPD / EN 15804）", certCode: null,
    productScopes: ["construction", "energy"],
    evidence: "经第三方验证的 EPD 文件（PCR 对应、含 GWP 等指标）",
    remediation: "选适用 PCR，做 LCA 后注册发布 EPD；建材与光伏组件是高频要求",
    leadTimeDays: 120, source: "EN 15804 / ISO 14025；绿色采购与绿色建筑评分",
  },
  {
    market: "EU", kind: "voluntary", standard: "I-REC", name: "可再生电力证书（I-REC / 绿证）", certCode: null,
    productScopes: ["all"],
    evidence: "I-REC 或中国绿证签发记录（对应生产用电量）",
    remediation: "为出口产品对应的用电量采购绿证，保留签发与核销记录",
    leadTimeDays: 30, source: "I-REC 标准；客户 RE100 供应链要求",
  },

  // ── 英国 ──
  {
    market: "UK", kind: "legal", standard: "UKCA", name: "UKCA 标志（英国市场准入）", certCode: "UKCA",
    productScopes: ["eee", "machinery", "toys", "medical", "construction", "energy"],
    evidence: "UK 符合性声明 + 技术文件 + 指定机构证书（适用时）",
    remediation: "按 UK 指定标准重做符合性评估；注意与 CE 的技术文件不完全通用",
    leadTimeDays: 90, source: "UK Market Access（原 EU 指令转国内法）",
  },
  {
    market: "UK", kind: "scoring", standard: "UK-EPD", name: "英国净零与碳披露（PPN 06/21 类要求）", certCode: null,
    productScopes: ["construction", "machinery", "services"],
    evidence: "碳减排计划（Carbon Reduction Plan）+ 组织碳足迹（ISO 14064-1）",
    remediation: "先出组织碳足迹，再写碳减排计划；英国公共采购超过门槛即要求",
    leadTimeDays: 60, source: "UK PPN 06/21（公共采购碳减排计划要求）",
  },

  // ── 美国 ──
  {
    market: "US", kind: "legal", standard: "FCC", name: "FCC 认证（美国无线及电子）", certCode: "FCC",
    productScopes: ["eee"],
    evidence: "FCC ID / SDoC + 测试报告（47 CFR Part 15 等）",
    remediation: "按产品类别走 Certification 或 SDoC，先做预测试再送认可实验室",
    leadTimeDays: 45, source: "47 CFR Part 15 / Part 18",
  },
  {
    market: "US", kind: "scoring", standard: "ENERGYSTAR", name: "ENERGY STAR 能源之星", certCode: "ENERGYSTAR",
    productScopes: ["eee", "machinery"],
    evidence: "EPA 认可实验室能效测试报告 + 产品注册",
    remediation: "按对应产品类别的能效规范测试并注册；投标能效评分常见项",
    leadTimeDays: 60, source: "US EPA ENERGY STAR 产品规范",
  },
  {
    market: "US", kind: "voluntary", standard: "LEED", name: "LEED 绿色建筑认证（材料与设备加分）", certCode: "LEED",
    productScopes: ["construction", "energy"],
    evidence: "材料 EPD/HPD、回收成分声明、能效与水资源数据",
    remediation: "按 LEED v4.1 材料与资源类目准备 EPD/HPD 与成分披露",
    leadTimeDays: 90, source: "USGBC LEED v4.1",
  },
];

export const migration: Migration = {
  version: 72,
  name: "market_requirement",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`market\` VARCHAR(16) NOT NULL COMMENT '市场码（EU/UK/US/…，与 supplier_certifications.scope 同码）',
        \`kind\` ENUM('legal','scoring','voluntary') NOT NULL COMMENT 'legal=法定门槛（决定 A/B/C）/ scoring=招标或客户评分 / voluntary=自愿披露',
        \`standard\` VARCHAR(120) NOT NULL COMMENT '标准号或简称（CE/CBAM/ISO14067/EPD…）',
        \`name\` VARCHAR(200) NOT NULL COMMENT '中文名称（报告直接印）',
        \`cert_code\` VARCHAR(40) DEFAULT NULL COMMENT '可关联的证书字典 code（判"已持"用；CBAM/EPD 这类无证书留空）',
        \`product_scopes\` JSON NOT NULL COMMENT '适用产品桶（all/eee/machinery/…）',
        \`evidence\` VARCHAR(500) NOT NULL COMMENT '需要提交的证据材料',
        \`remediation\` VARCHAR(500) NOT NULL COMMENT '整改第一步',
        \`lead_time_days\` INT DEFAULT NULL COMMENT '典型办理周期（天）',
        \`source\` VARCHAR(200) NOT NULL COMMENT '法规/标准出处（报告要印）',
        \`version\` VARCHAR(20) NOT NULL DEFAULT '2026-11' COMMENT '条目版本（口径变更时升版）',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_market_kind_standard\` (\`market\`, \`kind\`, \`standard\`),
        KEY \`idx_market_active\` (\`market\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='市场准入与绿色低碳要求条目（V3 起唯一出处）'`,
    );

    for (const s of SEEDS) {
      await dbPool.query(
        `INSERT IGNORE INTO \`${TABLE}\`
          (\`market\`, \`kind\`, \`standard\`, \`name\`, \`cert_code\`, \`product_scopes\`, \`evidence\`, \`remediation\`, \`lead_time_days\`, \`source\`, \`version\`, \`is_active\`)
         VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, '2026-11', 1)`,
        [s.market, s.kind, s.standard, s.name, s.certCode, JSON.stringify(s.productScopes), s.evidence, s.remediation, s.leadTimeDays, s.source],
      );
    }
  },
};
