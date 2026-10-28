/**
 * 行业面读层 — industry_nodes / supplier_industry_rel
 * Industry Facet Repository
 *
 * @module lib/repos/industry-node.repo
 * @description 行业面主表是供应商**行业身份**的唯一权威树（GB/T 4754-2017 四级 + 自研延伸层），
 *              但门户此前只读 `supplier.industry` 自由文本，整棵树在门户侧零消费：
 *              非中文界面拿到的是中文文本（`mapSupplierRow` 把 industryEn 直接等于 industryZh），
 *              行业下拉则是把整页供应商拉回前端去重出来的字符串集合。
 *              本 repo 只做四类读：
 *                1. 按码批量取节点（把 UGT-I-xxx 翻成中英双语标签、拼祖先路径）；
 *                2. 按供应商 id 批量取多行业挂靠（卡片上的行业标签行）；
 *                3. 关键词命中节点（行业词检索，官方名 / 释义两个粒度）；
 *                4. 行业级联下拉的完整树读取：按层级取某一层、按父码取直接子级。
 *
 *              级联下拉自 2026-10-12 起展示**完整行业分类树**（含零挂靠节点），不再按门户可见
 *              供应商数过滤——它是一棵分类浏览树，选中无供应商的节点就正常返回「无结果」。
 *              因此这一层不再 JOIN supplier，也就没有「下拉计数 vs 点进去结果」的口径耦合问题。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { escapeLikeWildcard } from "../utils/normalize";
import { isIndustryCode, NAV_INDUSTRIES_LEVELS, type IndustryNavLevel } from "../services/industry-code";

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

export class IndustryNodeRepo {
  constructor(private pool: Pool) {}

  /** 按码批量取节点（空入参不发 SQL） */
  async findNodesByCodes(codes: readonly string[]): Promise<IndustryNodeRow[]> {
    if (codes.length === 0) return [];
    const placeholders = codes.map(() => "?").join(", ");
    const [rows] = await this.pool.query(
      `SELECT code, name_zh, name_en, level, parent_code
         FROM industry_nodes
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
         FROM supplier_industry_rel r
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
         FROM industry_nodes
        WHERE name_zh LIKE ? OR name_en LIKE ?${withDescription ? " OR description LIKE ?" : ""}
        ORDER BY CHAR_LENGTH(code), code
        LIMIT ?`,
      withDescription ? [like, like, like, safeLimit] : [like, like, safeLimit],
    );
    return rows as IndustryNodeRow[];
  }

  /**
   * 某一层的全部标准节点（status=1），按码序返回——行业级联下拉的第一级（门类）取数口。
   *
   * 不再 JOIN supplier / 算计数：展示完整分类树，零挂靠节点同样下发、同样可选。
   * 层级走 NAV 白名单，越界值不发 SQL（level 永不拼进字符串）。
   */
  async listNodesByLevel(level: IndustryNavLevel): Promise<IndustryNodeRow[]> {
    if (!NAV_INDUSTRIES_LEVELS.includes(level)) return [];
    const [rows] = await this.pool.query(
      `SELECT code, name_zh, name_en, level, parent_code
         FROM industry_nodes
        WHERE level = ? AND status = 1
        ORDER BY code`,
      [level],
    );
    return rows as IndustryNodeRow[];
  }

  /**
   * 某个父码的全部直接子节点（status=1），按码序返回——行业级联下拉第 2~4 级取数口。
   *
   * 走 idx_parent 等值；不再按供应商数过滤，零挂靠子级照常下发（选中后正常出「无结果」）。
   * 非法父码不发 SQL（返回空），与 /api/suppliers?industry_code= 的「非法码=不筛选」同纪律。
   */
  async listChildNodes(parentCode: string): Promise<IndustryNodeRow[]> {
    if (!isIndustryCode(parentCode)) return [];
    const [rows] = await this.pool.query(
      `SELECT code, name_zh, name_en, level, parent_code
         FROM industry_nodes
        WHERE parent_code = ? AND status = 1
        ORDER BY code`,
      [parentCode],
    );
    return rows as IndustryNodeRow[];
  }
}
