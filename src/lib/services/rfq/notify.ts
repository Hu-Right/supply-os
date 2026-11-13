/**
 * RFQ 站内信通知（审核结论 / 到期关闭）
 * @module lib/services/rfq/notify
 *
 * @description `notifications` 表没有唯一键（注释里的 `ref_id` 幂等并未实现），
 *              重复调用会刷屏。这里补一层"按 (user, type, ref_id) 只推一次"的守卫：
 *              - 先查后写，本仓是唯一写入方、并发极低，够用；
 *              - 真正的唯一键作为债务记录在 ADR-0015，等通知量上来再加。
 *              通知失败不得影响主流程（调用方 try/catch 兜底）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { pushNotification, type PushNotificationInput } from "@/lib/services/notifications";

/** 按 (user_id, type, ref_id) 去重后推送；已存在返回 false */
export async function pushNotificationOnce(
  db: Pool,
  input: PushNotificationInput,
): Promise<boolean> {
  if (input.refId != null) {
    const [rows] = await db.query(
      `SELECT 1 FROM notifications
        WHERE user_id = ? AND type = ? AND ref_id = ? LIMIT 1`,
      [input.userId, input.type, input.refId],
    );
    if ((rows as RowDataPacket[]).length > 0) return false;
  }
  await pushNotification(db, input);
  return true;
}

export interface ReviewResultNoticeInput {
  demandId: number;
  buyerUserId: number;
  title: string;
  approved: boolean;
  reason?: string | null;
}

/** 审核结论回执：采购方在工作台/详情看到"通过/退回 + 理由" */
export async function notifyReviewResult(
  db: Pool,
  input: ReviewResultNoticeInput,
): Promise<boolean> {
  const approved = input.approved;
  return pushNotificationOnce(db, {
    userId: input.buyerUserId,
    type: approved ? "rfq_review_approved" : "rfq_review_rejected",
    title: approved ? "需求已通过审核并发布" : "需求审核未通过",
    body: approved
      ? `《${input.title}》已发布，供应商可以开始报价。`
      : `《${input.title}》被退回：${(input.reason ?? "").slice(0, 300)}`,
    link: `/rfq/${input.demandId}`,
    refId: input.demandId,
  });
}

/** 到期关闭回执 */
export async function notifyDemandExpired(
  db: Pool,
  input: { demandId: number; buyerUserId: number; title: string },
): Promise<boolean> {
  return pushNotificationOnce(db, {
    userId: input.buyerUserId,
    type: "rfq_demand_expired",
    title: "需求已到期关闭",
    body: `《${input.title}》报价窗口结束且未选定供应商，已自动结案。`,
    link: `/rfq/${input.demandId}`,
    refId: input.demandId,
  });
}

export interface AwardNoticeInput {
  demandId: number;
  title: string;
  winnerSupplierUserId: number;
  loserSupplierUserIds: number[];
}

/** 定标回执：中标方 + 落选方（站内信，按类型去重） */
export async function notifyAwardResult(db: Pool, input: AwardNoticeInput): Promise<void> {
  await pushNotificationOnce(db, {
    userId: input.winnerSupplierUserId,
    type: "rfq_awarded",
    title: "恭喜，你已中标",
    body: `《${input.title}》采购方已选定你的报价，请等待后续联系。`,
    link: `/rfq/${input.demandId}`,
    refId: input.demandId,
  });
  for (const userId of input.loserSupplierUserIds) {
    if (userId === input.winnerSupplierUserId) continue;
    await pushNotificationOnce(db, {
      userId,
      type: "rfq_lost",
      title: "本次未能中选",
      body: `《${input.title}》已完成供应商选定，感谢参与。`,
      link: `/rfq/${input.demandId}`,
      refId: input.demandId,
    });
  }
}
