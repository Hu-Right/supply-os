/**
 * 服务生态静态数据（内容型静态数据统一存放于 src/data）
 * Services Ecosystem Static Data
 *
 * @module data/services
 * @description 服务项列表、成功案例（迁移阶段使用静态数据，后续可改为 API）。
 *              自 features/services/data.ts 上移至全局静态数据仓库，
 *              与 FAQ / 学习资料 / 展厅 / 商机等静态内容同源管理。
 */

import {
  ShieldCheck,
  Globe,
  FilePenLine,
  Handshake,
  Languages,
  Ship,
} from "lucide-react";

/** 服务生命周期阶段 */
export type ServicePhase = "pre-bid" | "prep" | "submit" | "post-award";

/** 服务项 */
export interface ServiceItem {
  title: string;
  desc: string;
  icon: import("lucide-react").LucideIcon;
  specs: string[];
  active?: boolean;
  /** 所属生命周期阶段 */
  phase?: ServicePhase;
  /** 价格标签 */
  priceLabel?: string;
}

/** 成功案例 */
export interface SuccessStoryItem {
  date: string;
  title: string;
  description: string;
}

/**
 * 服务项列表
 * Service Items List
 */
export const SERVICES: ServiceItem[] = [
  // ── 投标前 ──
  {
    title: "企业国际公采能力诊断",
    desc: "首次出海/能力薄弱企业",
    icon: ShieldCheck,
    specs: ["快速评估企业国际公采能力"],
    active: true,
    phase: "pre-bid",
    priceLabel: "¥199 起",
  },
  {
    title: "UNGM/平台注册托管",
    desc: "新注册/维护难企业",
    icon: Globe,
    specs: ["账号注册、资料合规管理"],
    active: true,
    phase: "pre-bid",
    priceLabel: "项目报价",
  },
  // ── 投标准备 ──
  {
    title: "标书拆解与代写",
    desc: "无经验/时间紧企业",
    icon: FilePenLine,
    specs: ["拆解要点、专业撰写标书"],
    active: true,
    phase: "prep",
    priceLabel: "项目报价",
  },
  {
    title: "国际商务谈判支持",
    desc: "需谈判/价格博弈企业",
    icon: Handshake,
    specs: ["策略支持，提升中标成功率"],
    active: true,
    phase: "prep",
    priceLabel: "按次/项目",
  },
  // ── 投标提交 ──
  {
    title: "认证 / 公证 / 翻译",
    desc: "资料需认证翻译企业",
    icon: Languages,
    specs: ["多语种认证翻译一站式支持"],
    active: true,
    phase: "submit",
    priceLabel: "项目报价",
  },
  // ── 中标后 ──
  {
    title: "海外履约与展厅",
    desc: "中标后/需履约企业",
    icon: Ship,
    specs: ["仓储、物流、展厅一站式落地"],
    active: true,
    phase: "post-award",
    priceLabel: "年费 / 项目",
  },
];

/** 生态伙伴服务类别 */
export type EcoPartnerCategory = "compliance" | "fulfillment" | "after-sales" | "localization";

/** 生态伙伴合作状态：live 已入驻 / in-talks 洽谈中 */
export type EcoPartnerStatus = "live" | "in-talks";

/** 第三方生态伙伴（邀约入驻制） */
export interface EcoPartnerItem {
  /** 伙伴名称（中文） */
  name: string;
  /** 伙伴名称（英文/原文） */
  nameEn: string;
  /** 服务类别 */
  category: EcoPartnerCategory;
  /** 服务能力简述 */
  scope: string;
  /** 覆盖区域 */
  regions: string;
  /** 合作状态 */
  status: EcoPartnerStatus;
}

/** 生态伙伴类目标签（分区类目条展示用） */
export const ECO_PARTNER_CATEGORIES: { key: EcoPartnerCategory; label: string }[] = [
  { key: "compliance", label: "合规准入" },
  { key: "fulfillment", label: "履约交付" },
  { key: "after-sales", label: "售后服务" },
  { key: "localization", label: "本地化运营" },
];

/**
 * 第三方生态伙伴列表
 * Eco Partners List — 邀约入驻制；洽谈中伙伴先以品牌墙形式展示，
 * 签约后将 status 置为 live 并补充服务详情（后续可迁 API）。
 */
export const ECO_PARTNERS: EcoPartnerItem[] = [
  {
    name: "富士康",
    nameEn: "Foxconn",
    category: "localization",
    scope: "海外本地化生产与供应链落地，助力满足当地市场准入要求",
    regions: "全球产能布局",
    status: "in-talks",
  },
  {
    name: "小米全球售后服务",
    nameEn: "Xiaomi Global After-Sales Service",
    category: "after-sales",
    scope: "海外售后服务网络对接，覆盖维修网点与备件体系",
    regions: "全球服务网点",
    status: "in-talks",
  },
];

/**
 * 成功案例列表
 * Success Stories List
 */
export const SUCCESS_STORIES: SuccessStoryItem[] = [
  {
    date: "2026.04",
    title: "常州精密机床成功在法兰克福样品展厅接单三万套零件采购",
    description: "在双语展厅代表接待后，通过CRM一键会商顺利开单。",
  },
  {
    date: "2026.03",
    title: "非洲水利滴灌系统成套配套设备快速送达多座联合国援助仓",
    description: "通过肯尼亚内罗毕物理展厅样品核验，加速通过KEBS国标审定。",
  },
  {
    date: "2026.01",
    title: "山东某新型装配公司获免税绿皮书，全量中标人道救灾营房项目",
    description: "联合顾问在线编制英文投标书，14天成功获得最终入选通知。",
  },
];
