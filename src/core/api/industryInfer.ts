/**
 * 行业推断 API（行业树 UGT-I，与品目的 UGT 骨架树无关）
 *
 * @module core/api/industryInfer
 * @description 设置页「所属行业」选择器：输入关键词 → 行业节点候选。
 *              只产候选，必须用户点选才落值（与品目推断同一取舍：低置信推断不自动回填）。
 */
import { apiCached } from "@/core/http";

/** 行业节点候选 / 已选行业 */
export interface IndustryBrief {
  /** 行业码 UGT-I-* */
  code: string;
  nameZh: string;
  nameEn: string;
  /** section|division|group|subclass|extension */
  level?: string;
  /** 0~1 粗分（候选列表用） */
  score?: number;
  /** 自门类到自身的名称链 */
  path?: string[];
}

/** 关键词 → 行业候选（UGT-I 行业树 LIKE + 应用层打分） */
export const fetchIndustryInfer = (q: string) =>
  apiCached<{ candidates: IndustryBrief[] }>(`/api/industries/infer?q=${encodeURIComponent(q)}`);