/**
 * 会员专区静态数据
 * Membership Zone Static Data
 *
 * @module features/membership/data
 * @description VIP 特权项列表（迁移阶段使用静态数据，后续可改为 API）
 *              VIP privileges list (static data for migration phase, can be replaced with API later)
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
