/**
 * 行业面读层 — crm_industry_nodes / crm_supplier_industry_rel
 * Industry Facet Repository
 *
 * @module lib/repos/industry-node.repo
 * @description 行业面主表是供应商**行业身份**的唯一权威树（GB/T 4754-2017 四级 + 自研延伸层），
 *              但门户此前只读 `supplier.industry` 自由文本，整棵树在门户侧零消费：
 *              非中文界面拿到的是中文文本（`mapSupplierRow` 把 industryEn 直接等于 industryZh），
 *              行业下拉则是把整页供应商拉回前端去重出来的字符串集合。
 *              本 repo 只做三类读：
 *                1. 按码批量取节点（把 UGT-I-xxx 翻成中英双语标签、拼祖先路径）；
 *                2. 按供应商 id 批量取多行业挂靠（卡片上的行业标签行）；
 *                3. 面向门户可见供应商的层级计数（行业筛选下拉的 facet）。
 *
 *              可见口径与 supplier-directory 完全一致：`verify_status='done' AND company<>'测试'`。
 *              不一致会让下拉里的计数和点下去的结果对不上——这是筛选类接口最容易失真的一处。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { escapeLikeWildcard } from "../utils/normalize";
import { NAV_INDUSTRIES_LEVELS, type IndustryNavLevel } from "../services/industry-code";

/** 行业节点行 */
export interface IndustryNodeRow extends RowDataPacket {
  code: string;
  name_zh: string | null;
  name_en: string | null;
  level: string;
  parent_code: string | null;
}

/** 供应商×行业挂靠行 */
export interface IndustryLinkRow extends RowDataPacket {
  supplier_id: number;
  industry_code: string;
}

/** facet 行：某导航节点下（含子树）有挂靠的门户可见供应商数 */
export interface IndustryFacetRow extends RowDataPacket {
  code: string;
  name_zh: string | null;
  name_en: string | null;
  suppliers: number;
}

/** 门户可见供应商谓词（与 SupplierDirectoryRepo 同口径，改动必须两处一起改） */
const VISIBLE_SUPPLIER_WHERE = "s.verify_status = 'done' AND s.company <> '测试'";

export class IndustryNodeRepo {
  constructor(private pool: Pool) {}

  /** 按码批量取节点（空入参不发 SQL） */
  async findNodesByCodes(codes: readonly string[]): Promise<IndustryNodeRow[]> {
    if (codes.length === 0) return [];
    const placeholders = codes.map(() => "?").join(", ");
    const [rows] = await this.pool.query(
      `SELECT code, name_zh, name_en, level, parent_code
         FROM crm_industry_nodes
        WHERE code IN (${placeholders})`,
      [...codes],
    );
    return rows as IndustryNodeRow[];
  }

  /** 按供应商 id 批量取多行业挂靠（主行业码也在其中，见 check:industry-links 第 7 项） */
  async listLinksBySupplierIds(ids: readonly number[]): Promise<IndustryLinkRow[]> {
    const numeric = ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    if (numeric.length === 0) return [];
    const placeholders = numeric.map(() => "?").join(", ");
    const [rows] = await this.pool.query(
      `SELECT r.supplier_id, r.industry_code
         FROM crm_supplier_industry_rel r
        WHERE r.supplier_id IN (${placeholders})
        ORDER BY r.supplier_id, r.industry_code`,
      numeric,
    );
    return rows as IndustryLinkRow[];
  }

  /**
   * 关键词命中节点，两个粒度分开（调用方两级使用，见 lib/services/industry-facets）：
   * - `searchNodesByName`：只碰中文名 / ISIC 英文名——命中就是命中这个节点本身；
   * - `searchNodesByKeyword`：再加上国标官方释义——释义是「本层包括哪些活动」的枚举，
   *   所以任何细分词都会同时命中它的整个大类/门类（实测「照明」因 门类03 释义里列了
   *   照明器具而膨胀成整个制造业），宽召回但粗。它只在官方名一个都没命中时当兜底。
   *
   * 两者都按码长升序返回（粗层优先），配合 minimalSubtreePrefixes 去重后得到最小子树集。
   * 英文名参与检索，是「英文界面能按行业搜供应商」的唯一通路（supplier.industry 只有中文）。
   */
  async searchNodesByName(keyword: string, limit = 200): Promise<IndustryNodeRow[]> {
    return this.searchNodes(keyword, limit, false);
  }

  async searchNodesByKeyword(keyword: string, limit = 200): Promise<IndustryNodeRow[]> {
    return this.searchNodes(keyword, limit, true);
  }

  private async searchNodes(keyword: string, limit: number, withDescription: boolean): Promise<IndustryNodeRow[]> {
    const kw = String(keyword ?? "").trim();
    if (!kw) return [];
    const like = `%${escapeLikeWildcard(kw)}%`;
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const [rows] = await this.pool.query(
      `SELECT code, name_zh, name_en, level, parent_code
         FROM crm_industry_nodes
        WHERE name_zh LIKE ? OR name_en LIKE ?${withDescription ? " OR description LIKE ?" : ""}
        ORDER BY CHAR_LENGTH(code), code
        LIMIT ?`,
      withDescription ? [like, like, like, safeLimit] : [like, like, safeLimit],
    );
    return rows as IndustryNodeRow[];
  }

  /**
   * 行业筛选面：指定导航层级的节点 + 「子树内可见供应商去重数」，零挂靠节点不返回。
   *
   * 子树靠 parent_code 递归展开（不是码前缀 LIKE）：这里要的是「一棵子树里有几家」，
   * 递归 CTE 只读 1,996 行树，成本可忽略，且不与 check:taxonomy 的 I4 不变量重复绑定。
   * 计数放在 HAVING 里而非应用层，避免把 21,218 行挂靠拉进 Node。
   */
  async listFacets(level: IndustryNavLevel): Promise<IndustryFacetRow[]> {
    if (!NAV_INDUSTRIES_LEVELS.includes(level)) return [];
    const [rows] = await this.pool.query(
      `WITH RECURSIVE sub AS (
          SELECT code AS anc, code AS node FROM crm_industry_nodes WHERE level = ?
          UNION ALL
          SELECT sub.anc, n.code FROM crm_industry_nodes n JOIN sub ON n.parent_code = sub.node
        )
       SELECT a.code, a.name_zh, a.name_en, COUNT(DISTINCT s.id) AS suppliers
         FROM crm_industry_nodes a
         JOIN sub ON sub.anc = a.code
         JOIN crm_supplier_industry_rel r ON r.industry_code = sub.node
         JOIN supplier s ON s.id = r.supplier_id AND ${VISIBLE_SUPPLIER_WHERE}
        WHERE a.level = ?
        GROUP BY a.code, a.name_zh, a.name_en
       HAVING suppliers > 0
       ORDER BY suppliers DESC, a.code`,
      [level, level],
    );
    return rows as IndustryFacetRow[];
  }
}
