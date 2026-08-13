/**
 * 会员专区静态数据
 * Membership Zone Static Data
 *
 * @module features/membership/data
 * @description VIP 特权项列表和权益对比表数据
 *              VIP privileges list and plan comparison data
 */

/**
 * VIP 特权项
 * VIP Privilege Item
 */
export interface VipPrivilege {
  titleKey: "vipPriv1Title" | "vipPriv2Title" | "vipPriv3Title" | "vipPriv4Title";
  descKey: "vipPriv1Desc" | "vipPriv2Desc" | "vipPriv3Desc" | "vipPriv4Desc";
}

/**
 * VIP 特权列表
 * VIP Privileges List
 */
export const VIP_PRIVILEGES: VipPrivilege[] = [
  { titleKey: "vipPriv1Title", descKey: "vipPriv1Desc" },
  { titleKey: "vipPriv2Title", descKey: "vipPriv2Desc" },
  { titleKey: "vipPriv3Title", descKey: "vipPriv3Desc" },
  { titleKey: "vipPriv4Title", descKey: "vipPriv4Desc" },
];

/**
 * 权益对比表功能项
 * Comparison Feature Item
 */
export interface ComparisonFeature {
  key: string;
  labelKey: string;
  values: Record<string, string | boolean>;
}

/**
 * 权益对比表分类
 * Comparison Category
 */
export interface ComparisonCategory {
  category: string;
  categoryKey: string;
  features: ComparisonFeature[];
}

/**
 * 权益对比表数据
 * Plan Comparison Data
 *
 * 按功能分类，每个功能项标注各套餐是否支持
 * 数据结构与数据库中的 plan_code 对应
 */
export const PLAN_COMPARISON: ComparisonCategory[] = [
  {
    category: "核心权益",
    categoryKey: "comparisonCoreBenefits",
    features: [
      {
        key: "unlock_quota",
        labelKey: "comparisonUnlockQuota",
        values: {
          single_89: "1 次",
          single_199: "1 次",
          personal_799: "100 次",
          enterprise_basic_8800: "365 次",
          enterprise_flagship_16800: "365 次",
          enterprise_premium_26800: "365 次",
          annual_8800: "无限次",
        },
      },
      {
        key: "validity",
        labelKey: "comparisonValidity",
        values: {
          single_89: "不限",
          single_199: "不限",
          personal_799: "365 天",
          enterprise_basic_8800: "365 天",
          enterprise_flagship_16800: "365 天",
          enterprise_premium_26800: "365 天",
          annual_8800: "365 天",
        },
      },
      {
        key: "original_link",
        labelKey: "comparisonOriginalLink",
        values: {
          single_89: true,
          single_199: true,
          personal_799: true,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
      {
        key: "doc_download",
        labelKey: "comparisonDocDownload",
        values: {
          single_89: true,
          single_199: true,
          personal_799: true,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
      {
        key: "report",
        labelKey: "comparisonReport",
        values: {
          single_89: true,
          single_199: true,
          personal_799: true,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
    ],
  },
  {
    category: "增值服务",
    categoryKey: "comparisonAdditionalServices",
    features: [
      {
        key: "trade_group",
        labelKey: "comparisonTradeGroup",
        values: {
          single_89: false,
          single_199: false,
          personal_799: true,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
      {
        key: "supplier_library",
        labelKey: "comparisonSupplierLibrary",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: false,
        },
      },
      {
        key: "dedicated_support",
        labelKey: "comparisonDedicatedSupport",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: true,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
      {
        key: "private_group",
        labelKey: "comparisonPrivateGroup",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: false,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
      {
        key: "ungm_reg",
        labelKey: "comparisonUngmReg",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: false,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: false,
        },
      },
      {
        key: "bid_support",
        labelKey: "comparisonBidSupport",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: false,
          enterprise_flagship_16800: false,
          enterprise_premium_26800: true,
          annual_8800: false,
        },
      },
      {
        key: "contract_sign",
        labelKey: "comparisonContractSign",
        values: {
          single_89: false,
          single_199: false,
          personal_799: false,
          enterprise_basic_8800: false,
          enterprise_flagship_16800: true,
          enterprise_premium_26800: true,
          annual_8800: true,
        },
      },
    ],
  },
];
