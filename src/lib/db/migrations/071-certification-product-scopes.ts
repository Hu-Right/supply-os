/**
 * 迁移 071 · 认证字典加「适用产品 / 行业」维（V3 资质裁剪）
 *
 * @module lib/db/migrations/071-certification-product-scopes
 * @description 缺陷背景（2026-11-23 用户实测）：选了目标市场后，报告把该市场**所有**
 *              准入类证书都列成应备（医疗器械的 MDR、游乐设备的 EN1176、防爆 ATEX 全塞给
 *              一家建筑工程公司），因为字典只有「性质 category + 地区 scope」，没有
 *              「适用于什么产品」这一维。
 *
 *              本次只加一列 `product_scopes`（JSON 数组，桶定义见 shared/constants/product-scopes）：
 *              - 挂 `all` = 跨行业通用（CE/EAC/UKCA、ISO 体系等），所有企业都进应备；
 *              - 挂具体桶 = 只有主营范围命中的企业才进应备；
 *              - **保持 NULL 不标注** = 数据未分类，判定时不参与比对（报告注明未参与），
 *                宁可少列也不乱塞——这是本次排期刻意留下的显式空白，后续按行业补。
 *
 *              幂等：只在 product_scopes IS NULL 时回填，重跑不会覆盖人工修订。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const TABLE = "supplier_certifications";

/** 逐条标注（穷举 89 条在售认证；未列出的行保持 NULL = 未分类，不参与比对） */
const BACKFILL: ReadonlyArray<readonly [string, readonly string[]]> = [
  // ── 跨行业通用：市场准入类的主标 + 管理体系 + 通用社会责任 ──
  ["CE", ["all"]], ["UKCA", ["all"]], ["EAC", ["all"]], ["G-MARK", ["all"]],
  ["CCC", ["all"]], ["SASO", ["all"]], ["SONCAP", ["all"]], ["KEBS", ["all"]],
  ["TISI", ["all"]], ["SNI", ["all"]], ["BIS", ["all"]], ["KC", ["all"]],
  ["RCM", ["eee"]], ["B-BBEE", ["all"]],
  ["ISO9001", ["all"]], ["ISO14001", ["all"]], ["ISO45001", ["all"]],
  ["ISO27001", ["all"]], ["ISO20000", ["all"]], ["ISO22301", ["all"]],
  ["ISO50001", ["all"]], ["ISO22000", ["food_contact"]], ["ISO14064", ["all"]],
  ["ISO26000", ["all"]], ["SA8000", ["all"]], ["SEDEX", ["all"]], ["GS1", ["all"]],

  // ── 电气电子 / 无线 ──
  ["FCC", ["eee"]], ["ENERGYSTAR", ["eee"]], ["ISED", ["eee"]], ["MIC", ["eee"]],
  ["PSE", ["eee"]], ["INMETRO", ["eee"]], ["ROHS", ["eee"]], ["UL", ["eee"]],
  ["CSA", ["eee"]], ["VDE", ["eee"]], ["IEC61439", ["eee"]], ["IEC62443", ["eee", "machinery"]],

  // ── 医疗 ──
  ["MDR", ["medical"]], ["FDA", ["medical", "food_contact"]], ["WHO-PQ", ["medical"]],
  ["ANVISA", ["medical"]], ["GMP", ["medical"]], ["ISO13485", ["medical"]],
  ["ISO11137", ["medical"]], ["ISO11607", ["medical"]], ["ISO15189", ["medical", "lab"]],
  ["ISO14644", ["medical", "lab"]], ["IEC60601-1", ["medical"]],

  // ── 玩具 / 儿童 ──
  ["EN1176", ["toys"]], ["CPC", ["toys"]], ["EN61010-1", ["lab", "eee"]],

  // ── 食品与食品接触 ──
  ["HACCP", ["food_contact"]], ["BRC", ["food_contact"]], ["IFS", ["food_contact"]],
  ["KOSHER", ["food_contact"]], ["NSF", ["food_contact"]], ["FSC", ["food_contact", "textile"]],
  ["PEFC", ["food_contact", "textile"]],

  // ── 化学品 / 危险品 ──
  ["REACH", ["chemical"]], ["ATEX", ["chemical", "oil_gas"]],

  // ── 建筑工程 ──
  ["EN1090", ["construction"]], ["EN10204", ["construction", "machinery"]],
  ["ISO3834", ["construction", "machinery"]], ["ISO1461", ["construction", "machinery"]],
  ["CIDB", ["construction"]], ["PCAB", ["construction"]], ["LEED", ["construction"]],

  // ── 纺织服装 ──
  ["OEKO-TEX", ["textile"]], ["GRS", ["textile"]], ["ISO20345", ["textile"]],
  ["BSCI", ["textile", "toys", "eee"]], ["SLCP", ["textile", "toys", "eee"]],

  // ── 汽车 / 交通 ──
  ["E-MARK", ["auto"]], ["DOT", ["auto"]], ["IATF16949", ["auto"]],

  // ── 能源 / 电力 ──
  ["IEC61215", ["energy"]], ["IEC61730", ["energy"]], ["IEC61850", ["energy"]],

  // ── 石油天然气 / 机械装备 ──
  ["API", ["oil_gas"]], ["ASME", ["machinery", "oil_gas"]],
  ["DVGW", ["oil_gas"]], ["AS9100", ["machinery"]], ["NADCAP", ["machinery"]],

  // ── 检测实验室 / 安保 / 标准 ──
  ["ISO17025", ["lab"]], ["VDS", ["security"]], ["PSIRA", ["security"]], ["SABS", ["all"]],
];

export const migration: Migration = {
  version: 71,
  name: "certification_product_scopes",
  async up(dbPool: Pool): Promise<void> {
    const [cols] = await dbPool.query(
      "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'product_scopes'",
      [TABLE],
    );
    const exists = Number((cols as { n?: number }[])[0]?.n ?? 0) > 0;
    if (!exists) {
      await dbPool.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`product_scopes\` JSON DEFAULT NULL ` +
          "COMMENT 'V3 适用产品/行业桶（数组：all/eee/machinery/medical/…；NULL=未分类，判定时不参与比对）' " +
          "AFTER `scope`",
      );
    }

    for (const [code, scopes] of BACKFILL) {
      await dbPool.query(
        `UPDATE \`${TABLE}\` SET \`product_scopes\` = CAST(? AS JSON) WHERE \`code\` = ? AND \`product_scopes\` IS NULL`,
        [JSON.stringify(scopes), code],
      );
    }
  },
};
