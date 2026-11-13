/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 类目与认证数据访问层
 * Catalog Repository
 *
 * @module repos/catalog.repo
 *
 * 旧品类字典退役（2026-10-13）：本仓储原读 `旧品类字典表` 的
 * 旧字典的三个查询方法 全部下线——
 * 层级选项改走品目骨架树（lib/services/commodity/tree），智能推断改走
 * 树内 FULLTEXT（lib/services/commodity/infer，端点 /api/commodity/smart-infer）。
 * 仓储仅保留供应商资质证书一项。
 */
import type { Pool } from "mysql2/promise";

export interface CertificationRow {
  id: number;
  /** 认证编码（如 ISO9001 / CE / PCAB）：归一与匹配的锚点，对外契约键 */
  code: string;
  name: string;
  /** 性质：management / industry / market_access / product_safety / esg，供下拉分组 */
  category: string;
}

export class CatalogRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的供应商资质证书（顺序即 id，字典按性质分组连续编号） */
  async listActiveCertifications(): Promise<CertificationRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, code, name, category FROM supplier_certifications WHERE is_active = 1 ORDER BY id",
    );
    return rows as CertificationRow[];
  }
}
