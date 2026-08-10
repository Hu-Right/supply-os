/**
 * 中文版订单拆解报告（Word）生成服务
 * Chinese bid breakdown report (.docx) builder
 *
 * @description 按 CRM 侧 PHP BidReportService 的章节结构与样式 1:1 移植。
 *              本文件为 barrel re-export 入口，子模块拆分如下：
 *              - constants.ts  平台/行业映射、字体颜色常量、工具函数
 *              - builders.ts   docx 段落/表格构件
 *              - merge.ts      数据合并 + 文件名生成
 *              - build.ts      buildBidReportDocx 主函数
 *              - preview.ts    字符估算 + 纯文本预览
 */

export { mergeBidReportRow, bidReportFileName } from "./merge";
export { buildBidReportDocx } from "./build";
export { estimateFullReportCharCount, buildBidReportPreviewText } from "./preview";
export type { ReportPreviewSection } from "./preview";
