/**
 * 品目智能推断 API（跨 feature 公共接口）
 * Commodity Smart Inference API (cross-feature shared interface)
 *
 * @module core/api/commoditySmartInfer
 * @description 主营业务关键词 → 品目骨架树节点候选。两个消费方：
 *              - `features/auth/components/SupplierProductsPicker`（企业主营产品选品）
 *              - `features/auth/components/IndustryPrefsForm`（已随「主营行业」下线删除）
 *              本文件承接原 `core/api/industry-prefs` 里与行业偏好无关的推断能力，
 *              使删除行业偏好时不牵连企业主营产品。
 */
import { apiCached } from "@/core/http";

/** 一条品目推断候选（/api/commodity/smart-infer） */
export interface CommodityInferCandidate {
  /** 骨架节点码 UGT-* */
  code: string;
  nameZh: string;
  nameEn: string;
  level: number;
  /** 0~1 粗分（展示徽章档位用） */
  score: number;
  /** 父级分类链名（自 L1 到自身，浅→深），供面包屑展示 */
  path?: string[];
}

/**
 * 主营业务关键词 → 品目树节点候选（UGT 树内 FULLTEXT 匹配，只产候选不自动回填）
 */
export const fetchSmartInferCommodity = (q: string) =>
  apiCached<{ candidates: CommodityInferCandidate[] }>(
    `/api/commodity/smart-infer?q=${encodeURIComponent(q)}`,
  );
