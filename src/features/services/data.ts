/**
 * 服务生态静态数据
 * Services Ecosystem Static Data
 *
 * @module features/services/data
 * @description 服务项列表、成功案例（迁移阶段使用静态数据，后续可改为 API）
 *              Service items list, success stories (static data for migration phase, can be replaced with API later)
 */

import {
  LayoutGrid,
  Globe,
  FileText,
  BookOpen,
  Crown,
  MessageSquare,
} from "lucide-react";
import type { ServiceItem, SuccessStoryItem } from "./types";

/**
 * 服务项列表
 * Service Items List
 */
export const SERVICES: ServiceItem[] = [
  {
    title: "国际公共采购 资质代办 & 代注册托管",
    desc: "帮助中方精密智造、生物制药、环保机械工厂快速完成联合国全球开发署/卫生组织一级或二级资格账户升级，减少多周期退单延误风险。",
    icon: LayoutGrid,
    specs: ["英文财务报表制作", "UNSPSC精确对准码", "1对1合规排雷"],
    active: true,
  },
  {
    title: "海外保税区'前展后仓'备件物流",
    desc: "位于法兰克福、迪拜、内罗毕、越南等展厅15公里保税工业园区内，提供样机直接存放、即刻提报、本地送样24小时极速响应。",
    icon: Globe,
    specs: ["海外关税退税核验", "常年Bilingual代表接洽", "同城快配配送服务"],
    active: true,
  },
  {
    title: "中英法阿多文案海牙与使馆认证",
    desc: "提供专业的进出口通关凭证、测试报告、企业章程法务公证、以及出口目的地海牙或联合国指定认证材料加急翻译代办服务。",
    icon: FileText,
    specs: ["使馆背书直连", "特许多语言别名资质印章", "电子化核验通道"],
    active: true,
  },
  {
    title: "国际大宗标书（中英）翻译与编排",
    desc: "资深跨国采购代理起草，在履约违约免责声明、不可抗力风险划分、以及联合国劳工福利合规声明上做针对性编排。",
    icon: BookOpen,
    specs: ["合规范文填充", "PDF高精度防改编排", "AI辅助匹配预测"],
    active: true,
  },
  {
    title: "金牌出海企业深度合规培训",
    desc: "针对合规禁买红线、ESG标准审核、联合国国际劳工保护法、以及防范中东和非洲外汇限额无法结汇的财务防护应对机制全系列培训。",
    icon: Crown,
    specs: ["线下高管封闭课", "高频避坑标准教案", "在线视频实案演练"],
    active: true,
  },
  {
    title: "1v1 全球直联远程会商支持",
    desc: "为入驻会员搭建的高清远程会议系统，当有国际买家在海外展厅中表现出高度意向时，我们顾问一键接连您与买家实现云端即时在线沟通谈判。",
    icon: MessageSquare,
    specs: ["同声即时传译协助", "会商纪要自动创建CRM", "一键订阅商机"],
    active: true,
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
