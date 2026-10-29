/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 行业偏好的对外视图（红线②收口点）
 *
 * @module services/industry-profile/view
 * @description GET /api/user/industry-prefs 的出口形状。命名按门禁认得的 `*ViewOf` 约定，
 *              这样规则三（字面量包 opaque 值）能自己看出这里已收视图，登记行才删得掉——
 *              mapper 命名不是风格问题，它是静态面唯一看得见的那点线索。
 *              请求参数不在本视图范围内：POST 仍以 snake `commodity_code` 入参（红线②只约束响应实体字段）。
 */
import type { UserIndustryPrefsRow } from "@/lib/repos/user-prefs.repo";

export interface IndustryPrefsView {
  /** 最深已选 UGT 骨架节点码；所属大类由码前缀推导（industry-scope），不单独下发 */
  commodityCode: string | null;
  /** ISO 字符串；不给 Date，避免出口形态依赖 JSON 序列化的隐式转换 */
  updatedAt: string | null;
}

/** 行 → 视图；无偏好返回 null（路由把 null 原样下发，前端据此回退默认匹配） */
export function industryPrefsViewOf(row: UserIndustryPrefsRow | null): IndustryPrefsView | null {
  if (!row) return null;
  return {
    commodityCode: row.commodity_code ?? null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}
