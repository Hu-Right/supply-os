/**
 * 供应商企业主页 — 中英静态文案
 *
 * @module features/supplier-profile/copy
 * @description 页面主体是服务端组件，无法用 useLocale；文案集中在本文件，由路由层按 locale 传入。
 *              数据侧名称（公司名/产品/行业）不在此翻译：行业名用 industry.primary.nameEn，
 *              公司名保留原文，产品目录为采集原文（不做伪造翻译）。
 */

export type SupplierProfileLocale = "zh" | "en";

export interface SupplierProfileCopy {
  breadcrumbHome: string;
  breadcrumbDirectory: string;
  verifiedBadge: string;
  reviewedBadge: string;
  domestic: string;
  international: string;
  claimedBadge: string;
  licenseBadge: string;
  mainProductsPrefix: string;
  sendInquiry: string;
  viewContact: string;
  claimAction: string;
  fileTitle: string;
  established: string;
  registeredCapital: string;
  registrationNo: string;
  companyType: string;
  completeness: string;
  website: string;
  address: string;
  productsTitle: string;
  platformCategory: string;
  industryTitle: string;
  certificationsTitle: string;
  certificationNote: string;
  scorecardTitle: string;
  scorecardTotal: string;
  scorecardEvaluated: string;
  contactTitle: string;
  contactEmpty: string;
  contactMaskedNote: string;
  contactUnlockedNote: string;
  ownerTitle: string;
  ownerDesc: string;
  similarTitle: string;
  similarMore: string;
  similarByCommodity: string;
  similarByIndustry: string;
  similarByRegion: string;
  /** 注册标识类型 → 展示名（按 locale 覆盖） */
  creditCodeLabels: Record<string, string>;
}

const ZH: SupplierProfileCopy = {
  breadcrumbHome: "首页",
  breadcrumbDirectory: "供应商目录",
  verifiedBadge: "平台认证企业",
  reviewedBadge: "信息已审核",
  domestic: "国内供应商",
  international: "国际供应商",
  claimedBadge: "已认领",
  licenseBadge: "营业执照已上传",
  mainProductsPrefix: "主营：",
  sendInquiry: "发送询盘",
  viewContact: "查看联系方式",
  claimAction: "认领该企业",
  fileTitle: "企业档案",
  established: "成立时间",
  registeredCapital: "注册资本",
  registrationNo: "注册号",
  companyType: "企业类型",
  completeness: "资料完整度",
  website: "企业官网",
  address: "注册/办公地址",
  productsTitle: "主营产品",
  platformCategory: "平台归类",
  industryTitle: "行业定位",
  certificationsTitle: "资质与认证",
  certificationNote: "认证信息由企业提供；平台认证企业已完成执照与主体一致性审核。",
  scorecardTitle: "投标能力成绩单",
  scorecardTotal: "总分",
  scorecardEvaluated: "评测于",
  contactTitle: "联系方式",
  contactEmpty: "该企业暂未公开联系人信息，可通过平台发起询盘。",
  contactMaskedNote: "联系方式已脱敏；VIP 会员可查看完整联系人、邮箱与电话。",
  contactUnlockedNote: "VIP 会员，已显示完整联系方式。",
  ownerTitle: "你是该企业负责人？",
  ownerDesc: "认领企业主页后可维护企业档案、补充资质与联系方式，并查看访客与询盘数据。",
  similarTitle: "相似供应商",
  similarMore: "查看同行业供应商",
  similarByCommodity: "同品目",
  similarByIndustry: "同行业",
  similarByRegion: "同地区参考",
  creditCodeLabels: {
    uscc: "统一社会信用代码",
    hk_br: "香港商业登记号",
    hk_cr: "香港公司注册号",
    overseas_reg: "海外注册号",
    tax_id: "税号",
    other: "注册号",
  },
};

const EN: SupplierProfileCopy = {
  breadcrumbHome: "Home",
  breadcrumbDirectory: "Supplier Directory",
  verifiedBadge: "Verified supplier",
  reviewedBadge: "Profile reviewed",
  domestic: "Domestic supplier",
  international: "International supplier",
  claimedBadge: "Claimed",
  licenseBadge: "Business license on file",
  mainProductsPrefix: "Main products: ",
  sendInquiry: "Send enquiry",
  viewContact: "View contact details",
  claimAction: "Claim this company",
  fileTitle: "Company facts",
  established: "Established",
  registeredCapital: "Registered capital",
  registrationNo: "Registration no.",
  companyType: "Company type",
  completeness: "Profile completeness",
  website: "Website",
  address: "Registered / office address",
  productsTitle: "Products",
  platformCategory: "Platform categories",
  industryTitle: "Industry",
  certificationsTitle: "Certifications",
  certificationNote:
    "Certifications are provided by the company. Verified suppliers have passed platform license and entity checks.",
  scorecardTitle: "Bid capability scorecard",
  scorecardTotal: "Overall",
  scorecardEvaluated: "Evaluated",
  contactTitle: "Contact",
  contactEmpty: "No public contact has been provided; send an enquiry through the platform.",
  contactMaskedNote: "Contact details are masked. VIP members can view the full contact person, email and phone.",
  contactUnlockedNote: "VIP member — full contact details shown.",
  ownerTitle: "Are you the owner of this company?",
  ownerDesc:
    "Claim this profile to maintain company information, add certifications and contacts, and view visitor and enquiry data.",
  similarTitle: "Similar suppliers",
  similarMore: "Browse suppliers in the same industry",
  similarByCommodity: "Same commodity",
  similarByIndustry: "Same industry",
  similarByRegion: "Same region (reference)",
  creditCodeLabels: {
    uscc: "Unified social credit code",
    hk_br: "HK business registration no.",
    hk_cr: "HK company registration no.",
    overseas_reg: "Overseas registration no.",
    tax_id: "Tax ID",
    other: "Registration no.",
  },
};

export const SUPPLIER_PROFILE_COPY: Record<SupplierProfileLocale, SupplierProfileCopy> = {
  zh: ZH,
  en: EN,
};
