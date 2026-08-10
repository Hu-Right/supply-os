/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 中文版订单拆解报告（Word）生成服务
 * 已拆分至 bid-report/ 子目录，本文件为向后兼容的 barrel re-export。
 *
 * @see bid-report/index.ts
 * @deprecated 新代码请直接导入 ./bid-report 子模块
 */
export {
  mergeBidReportRow,
  bidReportFileName,
  buildBidReportDocx,
  estimateFullReportCharCount,
  buildBidReportPreviewText,
} from "./bid-report/index";
export type { ReportPreviewSection } from "./bid-report/index";
