/**
 * 迁移 082 · 采购需求跨国商务字段补全（资金来源 / 签约模式 / 溢短装）
 *
 * @module lib/db/migrations/082-project-sourcing-fields
 * @description 刚果 17-Lot 跨国采购案（RFI OSS-RFI-2026）暴露的问项缺口：
 *              - 资金来源（政府预算/国际援助/企业自筹）决定采购规则与供应商准入；
 *              - 签约模式（供应商直签 / 外贸主体归集出口）决定报价口径（退税）与收款路径；
 *              - 溢短装（数量允差 ±X%）是外贸合同标准条款，影响合同与结算写法。
 *              纯加列（ensureColumn 幂等），不动存量数据。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 82,
  name: "project_sourcing_fields",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(dbPool, "procurement_projects", "funding_source",
      "funding_source VARCHAR(40) NULL COMMENT '资金来源：government 政府预算 / intl_aid 国际援助 / self_funded 企业自筹 / other 其他' AFTER batch_note");
    await ensureColumn(dbPool, "procurement_projects", "contracting_mode",
      "contracting_mode VARCHAR(24) NULL COMMENT '签约模式：direct 供应商直签 / consolidated 外贸主体归集出口（NULL=待定）' AFTER funding_source");
    await ensureColumn(dbPool, "procurement_projects", "qty_tolerance",
      "qty_tolerance VARCHAR(20) NULL COMMENT '溢短装（数量允差），如 ±5%；NULL=未说明' AFTER contracting_mode");
  },
};
