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
  /** 英文文案（非中文界面使用；缺省回落中文） */
  titleEn?: string;
  descEn?: string;
  specsEn?: string[];
  priceLabelEn?: string;
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
    titleEn: "International public procurement capability diagnosis",
    descEn: "First-time exporters / enterprises with limited capability",
    specsEn: ["Rapid assessment of international public procurement readiness"],
    priceLabelEn: "From ¥199",
  },
  {
    title: "UNGM/平台注册托管",
    desc: "新注册/维护难企业",
    icon: Globe,
    specs: ["账号注册、资料合规管理"],
    active: true,
    phase: "pre-bid",
    priceLabel: "项目报价",
    titleEn: "UNGM / platform registration management",
    descEn: "New registrations / enterprises that struggle to maintain profiles",
    specsEn: ["Account registration and document compliance management"],
    priceLabelEn: "Project quote",
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
    titleEn: "Tender document breakdown and drafting",
    descEn: "No in-house experience / tight deadlines",
    specsEn: ["Key requirements breakdown and professional tender drafting"],
    priceLabelEn: "Project quote",
  },
  {
    title: "国际商务谈判支持",
    desc: "需谈判/价格博弈企业",
    icon: Handshake,
    specs: ["策略支持，提升中标成功率"],
    active: true,
    phase: "prep",
    priceLabel: "按次/项目",
    titleEn: "International business negotiation support",
    descEn: "Enterprises facing negotiation or pricing pressure",
    specsEn: ["Strategy support to improve the win rate"],
    priceLabelEn: "Per session / project",
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
    titleEn: "Certification / notarization / translation",
    descEn: "Enterprises needing certified document translation",
    specsEn: ["One-stop multilingual certification and translation support"],
    priceLabelEn: "Project quote",
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
    titleEn: "Overseas fulfilment and showroom",
    descEn: "Post-award / enterprises that need delivery support",
    specsEn: ["Warehousing, logistics and showroom landing support"],
    priceLabelEn: "Annual fee / project",
  },
];

/** 生态伙伴类目已迁 data/ecosystem.ts（版块独立为 /ecosystem 后随之搬家） */

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
