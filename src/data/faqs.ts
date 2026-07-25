/**
 * 常见问题静态数据
 * FAQ Static Data
 *
 * @module data/faqs
 * @description 3 条预置 FAQ（UNGM 编码 / 海外展厅 / 供应商审核）
 *              Pre-seeded FAQ items covering UNGM coding, overseas exhibition halls, and supplier vetting
 */

import type { FAQItem } from "@/types";

export const FAQS: FAQItem[] = [
  {
    id: "faq-01",
    questionZh: "什么是联合国全球采购（国际公共采购）编码体系？国内建材企业该如何匹配对应的国际公共采购 code？",
    questionEn: "What is the 国际公共采购 coding system? How do building materials companies map their UNSPSC codes?",
    answerZh: "国际公共采购采用UNSPSC（联合国标准产品与服务分类）编码。例如，建筑材料及预制房屋归属于第30门类（30000000）。您可以在国际公共采购官网使用英文关键字（如'prefabricated'、'building cement'）进行精确搜索，并关联到您公司的产品属性。匹配不精准可能导致无法及时获取智能系统推送的相关招标线索。",
    answerEn: "The 国际公共采购 utilizes the UNSPSC system. For instance, structural building supplies fall under Division 30 (30000000). You can query keywords like 'prefabricated structure' or 'panel wood' on the portal to locate specific 8-digit codes. Precise search matching guarantees automated, relevant system tender notifications.",
    category: "ungm"
  },
  {
    id: "faq-02",
    questionZh: "加入海外展厅有什么增值优势？企业不在当地如何维护现场展品？",
    questionEn: "What are the core value of joining an overseas exhibition hall? How are samples managed without locally active staff?",
    answerZh: "海外展厅采用'前展后仓、联人联货'常态化运营模式。我们有派驻法兰克福、迪拜、内罗毕等当地的高素质中英双语顾问，负责现场接待客商采购、演示设备，并随时把线索回传国内，您只需通过视频及本平台的CRM消息系统即可在几分钟内与买方取得一对一远程商务对接机会。",
    answerEn: "Our overseas exhibition spaces combine 'persistent hardware showroom with local bonded depots.' Fully trained bilingual coordinators manage your physical displays, perform basic operations, and gather offline client inquiries. You receive qualified leads in real-time through this CRM to spark instant video conferences.",
    category: "ungm"
  },
  {
    id: "faq-03",
    questionZh: "平台的供应商审核流程要多久？国内外的差异是什么？",
    questionEn: "How long does the supplier vetting process take? What is the difference between local and foreign applicants?",
    answerZh: "注册提交后，平台运营专员通常在1-2个工作日内完成合规与资质初审。国内企业侧重其三证、出口清关测试及主营业务是否具备代加工或跨国贸易经验。国外企业由于接入国际公共采购公采网络，必须提供有效的国际公共采购供应商注册编码，便于我们从UN系统进行合规自动核验。",
    answerEn: "Once submitted, the compliance audit completes within 1-2 business days. For domestic factories, the focus rests on export track-records and manufacturing capabilities. For foreign companies, the active 国际公共采购 code must be specified to trigger credentials sync verification through UN-level channels.",
    category: "ungm"
  }
];
