/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 企业信息门户行的对外视图（红线②收口点）
 *
 * @module services/enterprise/view
 * @description GET /api/user/enterprise 的 `enterprise` 字段。值来自
 *              `SupplierDirectoryRepo.findFullById`（`SELECT <PORTAL_COLUMNS> FROM supplier`，
 *              31 列白名单，历史上是 SELECT *）。“库里加列不自动上网”那道闸在
 *              仓储白名单上，本视图负责把列名改成 camelCase（复用 case-keys，不写第三份改名规则）。
 *
 *              列型以云库实测为准（runtime/probe-supplier-portal-cols.mjs）：
 *                - varchar/text → string；NOT NULL 列不为 null
 *                - `registered_capital` / `data_quality_score` 是 DECIMAL，本池未开
 *                  `decimalNumbers`（见 lib/db/pool.ts 编码红线注释）⇒ 驱动返回**字符串**，
 *                  这里保持字符串，不改数值形态（改了会连带影响前端展示与比较）
 *                - `established_at` 是 DATE ⇒ 驱动返回 Date，序列化后是 ISO 串；
 *                  服务端类型如实写 Date | string，前端契约写序列化后的 string
 *                - `certification` 是 **varchar(500)**（不是 JSON 列），逗号分隔文本
 *
 *              ⚠️ 请求侧不受本视图约束：PUT/POST body 的键仍是 supplier 列名
 *              （前端表单字段 key 就是列名，见 features/auth/components/enterprise-edit/fields.ts）。
 */
import { toCamelKeys } from "@/shared/utils/case-keys";

export interface SupplierEnterpriseView {
  id: number;
  company: string;
  country: string;
  countryCode: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  registeredAddress: string | null;
  contact: string;
  position: string | null;
  phone: string;
  email: string;
  registeredPhone: string | null;
  registeredEmail: string | null;
  website: string;
  legalRep: string | null;
  establishedAt: Date | string | null;
  registeredCapital: string | null;
  creditCode: string | null;
  businessType: string | null;
  /** 逗号分隔文本（varchar），不是数组 */
  certification: string | null;
  products: string | null;
  intro: string | null;
  remark: string | null;
  verifyStatus: string | null;
  claimStatus: string | null;
  coopStatus: number;
  checkNote: string | null;
  /** DECIMAL(5,2) NOT NULL，无 decimalNumbers ⇒ 字符串 */
  dataQualityScore: string;
  addtime: number;
  licenseUrl: string | null;
}

/**
 * 行 → 视图。
 * 行本身已由仓储白名单 `PORTAL_COLUMNS` 投影（31 列），所以这里不裁剪、只改名 +
 * 给 NOT NULL 列上类型化兜底。改名规则复用 `shared/utils/case-keys`（与 awards /
 * membership / notice-public 同一个实现），“新列必须先登记”那道闸因此在仓储白名单上：
 * PORTAL_COLUMNS 加一行→视图与响应多一个键；路由级用例拿同一份名单推期望集，加减列时那里先响。
 */
export function supplierEnterpriseViewOf(row: Record<string, unknown>): SupplierEnterpriseView {
  const out = toCamelKeys(row);
  // NOT NULL 列不得塌成 null：前端对这些键直接 Number()/String.includes()/渲染（类型也不是 nullable）
  out.coopStatus = Number(row.coop_status ?? 0);
  out.addtime = Number(row.addtime ?? 0);
  out.dataQualityScore = String(row.data_quality_score ?? "");
  out.company = String(row.company ?? "");
  out.country = String(row.country ?? "");
  out.contact = String(row.contact ?? "");
  out.phone = String(row.phone ?? "");
  out.email = String(row.email ?? "");
  out.website = String(row.website ?? "");
  return out as unknown as SupplierEnterpriseView;
}
