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

/** 带适用范围的字典行（V3 资质分级内部用；`scope` 刻意不进 /api/certifications 的对外契约） */
export interface CertificationScopeRow {
  code: string;
  name: string;
  category: string;
  /** 适用范围：global 或地区/国家码（EU/UK/US/…），可能是逗号分隔多值 */
  scope: string;
  /**
   * V3：适用产品/行业桶（迁移 071）。NULL/空 = 未分类，判定时不参与比对；
   * 数组里含 `all` = 跨行业通用，所有企业都进应备清单。
   */
  productScopes?: string[] | null;
}

export class CatalogRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的供应商资质证书（顺序即 id，字典按性质分组连续编号） */
  async listActiveCertifications(): Promise<CertificationRow[]> {
    const [rows] = await this.pool.query(
      "SELECT id, code, name, category FROM supplier_certifications WHERE is_active = 1 AND is_certificate = 1 ORDER BY id",
    );
    return rows as CertificationRow[];
  }

  /**
   * 带 `scope` 的激活字典（V3 资质分级取数）。
   * 与 `listActiveCertifications` 分开两个方法而不是给原方法加列：
   * 那个方法的返回值直接进公开接口，多一列就多一次「不小心上网」的机会（命名红线②）。
   */
  async listActiveCertificationsWithScope(): Promise<CertificationScopeRow[]> {
    const [rows] = await this.pool.query(
      "SELECT code, name, category, scope, product_scopes AS productScopes FROM supplier_certifications WHERE is_active = 1 AND is_certificate = 1 ORDER BY id",
    );
    // mysql2 对 JSON 列可能返回字符串，统一成数组（非法值按「未分类」处理）
    return (rows as CertificationScopeRow[]).map((r) => {
      const raw = r.productScopes as unknown;
      if (Array.isArray(raw)) return { ...r, productScopes: raw.map(String) };
      if (typeof raw === "string" && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          return { ...r, productScopes: Array.isArray(parsed) ? parsed.map(String) : null };
        } catch {
          return { ...r, productScopes: null };
        }
      }
      return { ...r, productScopes: null };
    });
  }
}
