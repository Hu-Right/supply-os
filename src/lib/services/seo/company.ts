/**
 * 运营主体信息 — 单一事实源
 *
 * @module lib/services/seo/company
 * @description 全站（关于我们 / 联系我们 / 常见问题 / Organization 结构化数据 / 页脚）
 *              共用的主体信息。统一从 NEXT_PUBLIC_* 环境变量读取：未配置的字段保持空串，
 *              页面侧按「不臆造」原则省略或标注待补充，避免各页各写一份导致口径漂移。
 */

const splitList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const COMPANY = {
  /** 公司全称（营业执照口径） */
  name: process.env.NEXT_PUBLIC_COMPANY_NAME || "杭州云境智展科技有限公司",
  /** 平台品牌名 */
  brand: "云境·国际采购平台",
  /** 统一社会信用代码 */
  creditCode: process.env.NEXT_PUBLIC_COMPANY_CREDIT_CODE || "",
  /** 注册地址 */
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "",
  /** 法定代表人 */
  legalRep: process.env.NEXT_PUBLIC_COMPANY_LEGAL_REP || "",
  /** 客服邮箱 */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  /** 客服电话 */
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "",
  /** 成立日期（工商登记口径，Organization.foundingDate 用） */
  foundedAt: "2025-07-31",
  /** ICP 备案号 */
  icp: process.env.NEXT_PUBLIC_ICP || "浙ICP备2026027779号-3",
  /** 增值电信业务经营许可证 */
  icpLicense: process.env.NEXT_PUBLIC_ICP_LICENSE || "",
  /** 欧盟代表（如适用） */
  euRep: process.env.NEXT_PUBLIC_EU_REPRESENTATIVE || "",
  /** 站外同源实体链接（企查查/天眼查/领英/公众号等，逗号分隔） */
  sameAs: splitList(process.env.NEXT_PUBLIC_ORG_SAMEAS),
  /** 网站域名 */
  site: "osneosmart.com",
  /** 服务时间 */
  serviceHours: "工作日 9:00–18:00（法定节假日除外）",
} as const;
