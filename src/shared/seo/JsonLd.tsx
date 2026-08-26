/**
 * JSON-LD 结构化数据组件
 * 为页面添加结构化数据，帮助搜索引擎理解内容并展示富摘要
 *
 * @module shared/seo/JsonLd
 */
import { Helmet } from "react-helmet-async";

export interface OrganizationJsonLdProps {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
}

/**
 * 组织结构化数据
 * 用于首页，声明网站所属组织信息
 */
export function OrganizationJsonLd({
  name,
  url,
  logo,
  description,
  sameAs = [],
}: OrganizationJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    logo: logo || `${url}/logo.png`,
    description,
    sameAs,
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

export interface WebSiteJsonLdProps {
  name: string;
  url: string;
  description?: string;
}

/**
 * 网站结构化数据
 * 用于首页，声明网站基本信息
 */
export function WebSiteJsonLd({ name, url, description }: WebSiteJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/procurement?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

export interface CourseJsonLdProps {
  name: string;
  description: string;
  provider: string;
  url: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  price?: string;
  priceCurrency?: string;
}

/**
 * 课程/研修班结构化数据
 * 用于研修班落地页，声明课程详细信息
 */
export function CourseJsonLd({
  name,
  description,
  provider,
  url,
  startDate,
  endDate,
  location,
  price,
  priceCurrency = "CNY",
}: CourseJsonLdProps) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Course",
    name,
    description,
    provider: {
      "@type": "Organization",
      name: provider,
      sameAs: url,
    },
    url,
  };

  if (startDate) data.startDate = startDate;
  if (endDate) data.endDate = endDate;
  if (location) {
    data.location = {
      "@type": "Place",
      name: location,
    };
  }
  if (price) {
    data.offers = {
      "@type": "Offer",
      price,
      priceCurrency,
      availability: "https://schema.org/InStock",
      url,
    };
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}
