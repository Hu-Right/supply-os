/**
 * JSON-LD 安全序列化 + 站点实体
 * Safe JSON-LD serialization for <script type="application/ld+json">
 *
 * @module lib/services/seo/json-ld
 * @description 结构化数据里的字段大量来自采集数据（公告标题/描述等），
 *              直接 JSON.stringify 不转义 "<"：`</script>` 会闭合标签并执行任意 JS。
 *              全站唯一出口，禁止各页面自行 JSON.stringify。
 */
import { SITE_URL } from "./site";
import { COMPANY } from "./company";

/** 站点根（去掉多余尾斜杠，避免拼出 //logo.png 这类无效 URL） */
const ROOT = SITE_URL.replace(/\/+$/, "");

/** 序列化为可安全内联进 <script> 的 JSON 字符串 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** 实体 ID：中英文站点、各页 provider/publisher 都指向同一个 Organization */
export const ORGANIZATION_ID = `${ROOT}#organization`;

/** 站点实体（多处 JSON-LD 的 provider/publisher 共用，避免名字与 URL 各写一份） */
export const SITE_ENTITY = {
  "@type": "Organization" as const,
  "@id": ORGANIZATION_ID,
  name: COMPANY.brand,
  url: ROOT,
};

/**
 * Organization 结构化数据 — 给生成式引擎的「标准名片」。
 *
 * 除品牌名与 URL 外，补 legalName / taxID / address / contactPoint / sameAs：
 * AI 需要把「云境」与工商主体、客服渠道、站外账号对上号，才敢把它当确定实体引用。
 * 未配置的字段直接省略（不编造），配置后无需改代码即可生效。
 */
export function organizationJsonLd(options?: {
  name?: string;
  alternateName?: string;
  description?: string;
}): Record<string, unknown> {
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: options?.name ?? COMPANY.brand,
    legalName: COMPANY.name,
    alternateName: options?.alternateName ?? "Yunjing International Procurement Platform",
    url: ROOT,
    logo: `${ROOT}/logo.png`,
    description:
      options?.description ??
      "云境·国际采购平台 — 联合国及全球政府采购公告搜索、供应商目录、CRM 客户管理、投标服务、学习培训一站式平台。",
    foundingDate: COMPANY.foundedAt,
    areaServed: "Worldwide",
    serviceType: ["国际采购", "政府采购", "供应商管理", "CRM", "投标服务", "培训"],
  };

  if (COMPANY.creditCode) org.taxID = COMPANY.creditCode;
  if (COMPANY.address) {
    org.address = {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address,
      addressCountry: "CN",
    };
  }
  if (COMPANY.supportPhone) org.telephone = COMPANY.supportPhone;
  const contactPoints: Array<Record<string, unknown>> = [];
  if (COMPANY.supportPhone) {
    contactPoints.push({
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: COMPANY.supportPhone,
      areaServed: "Worldwide",
      availableLanguage: ["zh-CN", "en"],
    });
  }
  if (COMPANY.supportEmail) {
    contactPoints.push({
      "@type": "ContactPoint",
      contactType: "customer support",
      email: COMPANY.supportEmail,
      areaServed: "Worldwide",
      availableLanguage: ["zh-CN", "en"],
    });
  }
  if (contactPoints.length > 0) org.contactPoint = contactPoints;
  if (COMPANY.sameAs.length > 0) org.sameAs = COMPANY.sameAs;

  return org;
}
