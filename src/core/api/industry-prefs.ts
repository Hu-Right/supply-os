/**
 * 行业偏好 API（跨 feature 公共接口）
 * Industry Preference API (cross-feature shared interface)
 *
 * @module core/api/industry-prefs
 * @description 账号默认行业偏好的读取和保存，供 procurement 和 auth 两个 feature 使用。
 *              偏好键是 UGT 最深节点码（commodity_code）；旧行的字典 id 随旧品类码
 *              字典退役停用。
 */
import { api, apiCached } from "@/core/http";

/** 账号默认行业偏好：UGT 最深骨架节点码 + 品目大类码（可见性判定输入） */
export interface IndustryPrefs {
  commodity_code: string | null;
  group_code?: string | null;
}

/** 一条品目推断候选（/api/commodity/smart-infer） */
export interface CommodityInferCandidate {
  /** 骨架节点码 UGT-* */
  code: string;
  nameZh: string;
  nameEn: string;
  /** 所属品目大类码（UGT-G-xx）；挂不上为 null */
  groupCode: string | null;
  level: number;
  /** 0~1 粗分（展示徽章档位用） */
  score: number;
}

/**
 * 读取账号默认行业偏好
 * Fetch the account's default industry preference
 *
 * @remarks 任何异常返回 null（回退到推荐/全量），绝不阻断公采页。
 *          偏好可在个人中心随时修改，故不走缓存。
 */
export const fetchIndustryPrefs = async (): Promise<IndustryPrefs | null> => {
  try {
    const data = await api<{ prefs?: IndustryPrefs }>("/api/user/industry-prefs");
    return data?.prefs || null;
  } catch {
    return null;
  }
};

/**
 * 保存账号默认行业偏好（commodity_code 传空即清除偏好）
 * Save the account's default industry preference (empty code clears it)
 */
export const saveIndustryPrefs = (prefs: { commodity_code?: string | null }) =>
  api("/api/user/industry-prefs", {
    method: "POST",
    body: prefs,
  });

/**
 * 主营业务关键词 → 品目树节点候选（UGT 树内 FULLTEXT 匹配，只产候选不自动回填）
 */
export const fetchSmartInferCommodity = (q: string) =>
  apiCached<{ candidates: CommodityInferCandidate[] }>(
    `/api/commodity/smart-infer?q=${encodeURIComponent(q)}`,
  );
