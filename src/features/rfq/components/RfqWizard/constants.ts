/**
 * RFQ 向导常量
 * @module features/rfq/components/RfqWizard/constants
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_FILE_COUNT = 10;
export const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp";

/** 需求描述默认模板（引导用户填写关键信息） */
export const DESCRIPTION_TEMPLATE = `【采购背景】
（简述采购用途和项目背景）

【产品/服务要求】
（规格、型号、技术参数等）

【数量与交付】
（数量、交付时间、交付地点）

【资质要求】
（认证、行业经验等）

【报价要求】
（报价币种、付款条件、贸易术语）`;

export const STEP_META = [
  { title: "需求概要" },
  { title: "商务条款" },
  { title: "发布设置" },
] as const;
