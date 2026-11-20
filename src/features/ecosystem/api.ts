/**
 * 服务市场 API 调用
 * Services API calls
 *
 * @module features/services/api
 * @description 生态伙伴公开列表（GET /api/eco-partners，迁移 062 eco_partner 表）。
 *              展示口径与服务端对齐：detail 仅 live 态返回；suspended 不出网。
 */

import { api } from "@/core/http";

/** 伙伴合作状态：in-talks 洽谈中 / onboarding 已签约筹备 / live 已上架（suspended 服务端不出网） */
export type EcoPartnerStatus = "in-talks" | "onboarding" | "live";

/** 生态伙伴公开视图（GET /api/eco-partners 响应体，红线② camelCase） */
export interface EcoPartner {
  slug: string;
  name: string;
  nameEn: string | null;
  category: string;
  scope: string;
  scopeEn: string | null;
  /** 服务详情（纯文本段落；仅 live 态非空） */
  detail: string | null;
  regions: string;
  regionsEn: string | null;
  logoUrl: string | null;
  /** 锚定位伙伴（伙伴墙头部大卡） */
  featured: boolean;
  status: EcoPartnerStatus;
}

/** 拉取生态伙伴公开列表（公开端点，无鉴权） */
export const fetchEcoPartners = () => api<EcoPartner[]>("/api/eco-partners");
