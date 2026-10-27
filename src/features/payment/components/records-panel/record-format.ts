/**
 * 采购记录行 — 纯格式化函数（自 MyRecordsPanel.tsx 上收，行为逐字不变）。
 * 「禁止组件文件内定义可复用工具函数」条款落地。
 *
 * @module features/payment/components/records-panel/record-format
 */
import { formatDateTimeZh } from "@/shared/utils/format";
import type { OrderRecord, UnlockRecord } from "../../api";

export type RecordRow = OrderRecord | UnlockRecord;

/**
 * 记录时间：解锁时间 → 支付时间 → 创建时间 逐级回落。
 * 两个端点（/api/payment/orders 与 /api/payment/unlocks）都是 camel 契约，
 * 但属于不同响应体，字段并不共有，故逐支用 `in` 窄化后读自己那个键。
 */
export const recordTime = (row: RecordRow) =>
  formatDateTimeZh(
    ("unlockedAt" in row ? row.unlockedAt : undefined) ||
      ("paidAt" in row ? row.paidAt : undefined) ||
      ("createdAt" in row ? row.createdAt : undefined),
  );

/** 记录标题：公告标题优先；订单按 planCode 前缀生成可读类型名 */
export function recordTitle(row: RecordRow, t: (key: string) => string): string {
  // 公告标题优先
  if (row.notice?.title) return row.notice.title;
  // 订单类型：按 planCode 生成可读标题
  if ("orderNo" in row) {
    const planCode = row.planCode || "";
    if (planCode.startsWith("material_")) return t("myRecordsLearningMaterial");
    if (planCode.startsWith("bundle_")) return t("myRecordsLearningBundle");
    if (planCode.startsWith("training_course_")) return t("myRecordsTraining");
    if (planCode.startsWith("svc_")) return t("myRecordsServiceOrder");
    return t("myRecordsMembershipOrder");
  }
  if (row.noticeId) return String(row.noticeId);
  return t("myRecordsUntitled");
}

/** 订单副标题：金额 + 时间（不展示订单号） */
export function recordSubtitle(row: RecordRow, t: (key: string) => string): string {
  void t; // 保持与旧内联闭包相同的调用面（当前无文案分支）
  if ("orderNo" in row) {
    const amt = `${row.currency || "CNY"} ${Number(row.amount || 0).toFixed(2)}`;
    return `${amt} · ${recordTime(row)}`;
  }
  return `${row.unlockType || "unlock"} · ${recordTime(row)}`;
}
