/**
 * 第三方服务生态伙伴数据访问层
 * Eco Partner Repository
 *
 * @module repos/eco-partner.repo
 * @description /services 页伙伴墙的公开数据源（迁移 062 建表）。只读：
 *              写入由运营侧直接维护（插行/改 status/填 detail），门户不提供写路径。
 *              状态机与展示口径见迁移 062 文件头注释。
 */
import type { Pool } from "mysql2/promise";

/** 本 repo 依赖的池形状（单测注假池用，口径同 invitation.repo 的 PoolLike） */
export type PoolLike = Pick<Pool, "query" | "execute">;

/** 伙伴合作状态：in-talks 洽谈中 / onboarding 已签约筹备 / live 已上架 / suspended 下架 */
export type EcoPartnerStatus = "in-talks" | "onboarding" | "live" | "suspended";

export interface EcoPartnerRow {
  id: number;
  slug: string;
  name: string;
  nameEn: string | null;
  category: string;
  scope: string;
  scopeEn: string | null;
  detail: string | null;
  regions: string;
  regionsEn: string | null;
  logoUrl: string | null;
  featured: boolean;
  status: EcoPartnerStatus;
  sortWeight: number;
  listedAt: Date | null;
}

export class EcoPartnerRepo {
  constructor(private pool: PoolLike) {}

  /**
   * 公开列表：suspended 不出网；锚定位（featured）与权重靠前者排前。
   * 只选展示所需列——contact_internal 永不进入 SELECT，杜绝手滑透出。
   */
  async listPublic(): Promise<EcoPartnerRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, slug, name, name_en, category, scope, scope_en, detail,
              regions, regions_en, logo_url, featured, status, sort_weight, listed_at
       FROM eco_partner
       WHERE status IN ('in-talks', 'onboarding', 'live')
       ORDER BY featured DESC, sort_weight DESC, id ASC`,
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      slug: String(r.slug),
      name: String(r.name),
      nameEn: (r.name_en as string | null) ?? null,
      category: String(r.category),
      scope: String(r.scope ?? ""),
      scopeEn: (r.scope_en as string | null) ?? null,
      detail: (r.detail as string | null) ?? null,
      regions: String(r.regions ?? ""),
      regionsEn: (r.regions_en as string | null) ?? null,
      logoUrl: (r.logo_url as string | null) ?? null,
      featured: Number(r.featured) === 1,
      status: String(r.status) as EcoPartnerStatus,
      sortWeight: Number(r.sort_weight ?? 0),
      listedAt: (r.listed_at as Date | null) ?? null,
    }));
  }
}
