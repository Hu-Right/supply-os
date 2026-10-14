/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 类目与认证数据访问层
 * Catalog Repository
 *
 * @module repos/catalog.repo
 *
 * UNSPSC 字典退役（2026-10-13）：本仓储原读 `crm_unspsc_codes` 的
 * listUnspsc / findUnspscNodeById / smartInferUnspsc 全部下线——
 * 层级选项改走品目骨架树（lib/services/commodity/tree），智能推断改走
 * 树内 FULLTEXT（lib/services/commodity/infer，端点 /api/commodity/smart-infer）。
 * 仓储仅保留供应商资质证书一项。
 */
import type { Pool } from "mysql2/promise";

export interface CertificationRow {
  id: number;
  name: string;
}

export class CatalogRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的供应商资质证书 */
  async listActiveCertifications(): Promise<CertificationRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, name FROM crm_supplier_certifications WHERE is_active = 1 ORDER BY sort_order",
    );
    return rows as CertificationRow[];
  }
}
