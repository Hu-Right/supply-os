/**
 * 公告列表/详情共用的展示格式化（兼容 re-export 层）。
 *
 * 2026-10-31 数据归一化收口：实现上移 shared/utils/noticeDisplay（依赖本就全在
 * shared，首页滚动卡改走统一口径后此三层不再是两套代码）。本文件保留导出面，
 * 既有消费方（NoticeCard/NoticeDetail/SimilarTab/单测）import 路径零变化。
 */
export {
  formatNoticeAmount,
  formatNoticeDeadline,
  formatNoticeReference,
  pickNoticeTitle,
  displayNoticeAgency,
  type NoticeDisplayFields,
} from "@/shared/utils/noticeDisplay";
