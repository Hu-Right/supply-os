/**
 * 采购记录行 — 纯格式化函数（自 MyRecordsPanel.tsx 上收，行为逐字不变）。
 * 「禁止组件文件内定义可复用工具函数」条款落地。
 *
 * @module features/payment/components/records-panel/record-format
 */
import { formatDateTimeZh } from "@/shared/utils/format";
import type { OrderRecord, UnlockRecord } from "../../api";

export type RecordRow = OrderRecord | UnlockRecord;

/** 记录时间：解锁时间 → 支付时间 → 创建时间 逐级回落 */
export const recordTime = (row: RecordRow) =>
  formatDateTimeZh(
    ("unlocked_at" in row ? row.unlocked_at : undefined) ||
      ("paid_at" in row ? row.paid_at : undefined) ||
      ("created_at" in row ? row.created_at : undefined),
  );

/** 记录标题：公告标题优先；订单按 plan_code 前缀生成可读类型名 */
export function recordTitle(row: RecordRow, t: (key: string) => string): string {
  // 公告标题优先
  if (row.notice?.title) return row.notice.title;
  // 订单类型：按 plan_code 生成可读标题
  if ("order_no" in row) {
    const planCode = (row as OrderRecord).plan_code || "";
    if (planCode.startsWith("material_")) return t("myRecordsLearningMaterial");
    if (planCode.startsWith("bundle_")) return t("myRecordsLearningBundle");
    if (planCode.startsWith("training_course_")) return t("myRecordsTraining");
    if (planCode.startsWith("svc_")) return t("myRecordsServiceOrder");
    return t("myRecordsMembershipOrder");
  }
  if (row.notice_id) return String(row.notice_id);
  return t("myRecordsUntitled");
}

/** 订单副标题：金额 + 时间（不展示订单号） */
export function recordSubtitle(row: RecordRow, t: (key: string) => string): string {
  void t; // 保持与旧内联闭包相同的调用面（当前无文案分支）
  if ("order_no" in row) {
    const o = row as OrderRecord;
    const amt = `${o.currency || "CNY"} ${Number(o.amount || 0).toFixed(2)}`;
    return `${amt} · ${recordTime(row)}`;
  }
  return `${row.unlock_type || "unlock"} · ${recordTime(row)}`;
}
