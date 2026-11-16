/**
 * 迁移 027 · 采购需求结构化认证要求
 *
 * @module server/db/migrations/027-procurement-cert-requirements
 * @description F02「强制标准/认证要求」原先是单段文本（standards），采购方只能手写
 *              “CE、ISO9001”等，无法与供应商能力档案里的证书做交集。
 *              本迁移新增 `cert_requirements` JSON 列，存结构化要求：
 *                [{ code, name, custom, mandatory, note, requireValid }]
 *              `standards` 保留为“技术标准/补充说明”，历史数据不丢。
 *              认证字典仍走 `/api/certifications`（管理体系/行业/市场准入/产品安全/ESG 五类）。
 */
import type { Pool } from "mysql2/promise";
import { ensureColumn, type Migration } from "./runner";

export const migration: Migration = {
  version: 27,
  name: "procurement_cert_requirements",
  async up(dbPool: Pool): Promise<void> {
    await ensureColumn(
      dbPool,
      "procurement_projects",
      "cert_requirements",
      "cert_requirements JSON DEFAULT NULL COMMENT '认证要求（F02）：[{code,name,custom,mandatory,note,requireValid}]，未收录项 custom=true 自输入'",
    );
  },
};
