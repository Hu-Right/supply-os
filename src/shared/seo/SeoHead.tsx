/**
 * SEO 工具组件
 * 为每个页面提供独立的 title、description、keywords 等 SEO 标签
 *
 * @module shared/seo/SeoHead
 */
import { Helmet } from "react-helmet-async";

export interface SeoHeadProps {
  /** 页面标题（会自动追加站点名称） */
  title: string;
  /** 页面描述 */
  description?: string;
  /** 页面关键词（逗号分隔） */
  keywords?: string;
  /** 规范链接（canonical URL） */
  canonical?: string;
  /** Open Graph 图片 URL */
  ogImage?: string;
  /** 是否禁止搜索引擎索引 */
  noIndex?: boolean;
}

/** 站点名称 */
const SITE_NAME = "云境全球智能展厅";
/** 默认 OG 图片 */
const DEFAULT_OG_IMAGE = "https://osneosmart.com/og-image.png";

/**
 * SEO 头部组件
 * 在每个页面中使用，动态设置该页面的 SEO 标签
 *
 * @example
 * ```tsx
 * <SeoHead
 *   title="全球采购公告搜索"
 *   description="搜索全球采购公告，发现采购商机"
 *   keywords="采购,招标,Tender"
 * />
 * ```
 */
export function SeoHead({
  title,
  description,
  keywords,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  noIndex = false,
}: SeoHeadProps) {
  // 完整标题：页面标题 - 站点名称
  const fullTitle = title ? `${title} - ${SITE_NAME}` : SITE_NAME;

  // 完整描述：如果未提供，使用默认描述
  const fullDescription =
    description ||
    "云境OS是外贸员的全球采购订单雷达。不再到处找客户、搜Tender、翻政府网站，登录即可看到哪些国家、哪些机构、哪些企业正在采购您的产品。";

  return (
    <Helmet>
      {/* 核心 SEO 标签 */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* 规范链接 */}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* 搜索引擎爬虫控制 */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph 标签 */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      {canonical && <meta property="og:url" content={canonical} />}

      {/* Twitter Card 标签 */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
