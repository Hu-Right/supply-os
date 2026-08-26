/**
 * 行业偏好 API（跨 feature 公共接口）
 * Industry Preference API (cross-feature shared interface)
 *
 * @module core/api/industry-prefs
 * @description 账号默认行业偏好的读取和保存，供 procurement 和 auth 两个 feature 使用
 */
import { api } from "@/core/http";

/** 账号默认行业偏好：UNSPSC 类目路径 id（UI 使用 1~3 级：前两级必选，第三级可选） */
export interface IndustryPrefs {
  level1_id: number | null;
  level2_id?: number | null;
  level3_id?: number | null;
  level4_id?: number | null;
  level5_id?: number | null;
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
 * 保存账号默认行业偏好（level1_id 传空即清除偏好）
 * Save the account's default industry preference (null level1_id clears it)
 */
export const saveIndustryPrefs = (prefs: Partial<IndustryPrefs>) =>
  api("/api/user/industry-prefs", {
    method: "POST",
    body: prefs,
  });
