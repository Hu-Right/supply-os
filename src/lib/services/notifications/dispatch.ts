/**
 * 业务通知分发（事件 → 渠道策略）
 *
 * @module lib/services/notifications/dispatch
 * @description 通知触达策略由系统统一决定，不向用户暴露渠道开关：
 *              - 安全/交易类事件：站内信 + 邮件（保证可追溯），失败静默降级；
 *              - 营销类事件不在本文件发送（需明示同意 + 退订入口）。
 *              发送失败只记日志，绝不阻断支付/开票等主流程。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { pushNotificationSafe } from "./index";
import { isEmailConfigured, sendNotificationEmail } from "../email";
import { absoluteUrl } from "@/lib/services/seo/site";

export type NotificationEvent =
  | "billing.payment_succeeded"
  | "billing.invoice.submitted"
  | "billing.invoice.issued"
  | "billing.invoice.rejected";

interface NotificationPolicy {
  /** 站内信始终落一份，作为可追溯兜底 */
  inapp: true;
  /** 需要留痕/正式凭证的场景发邮件 */
  email: boolean;
}

/** 事件 → 渠道策略：行业通行做法（交易/服务类站内信 + 邮件） */
const POLICY: Record<NotificationEvent, NotificationPolicy> = {
  "billing.payment_succeeded": { inapp: true, email: true },
  "billing.invoice.submitted": { inapp: true, email: true },
  "billing.invoice.issued": { inapp: true, email: true },
  "billing.invoice.rejected": { inapp: true, email: true },
};

interface ContactRow extends RowDataPacket {
  email: string | null;
  nickname: string | null;
}

async function findContact(pool: Pool, userId: number): Promise<ContactRow | null> {
  const [rows] = await pool.query<ContactRow[]>(
    "SELECT email, nickname FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  return rows[0] ?? null;
}

function money(value: unknown): string {
  return "¥" + Number(value ?? 0).toFixed(2);
}

/** 按事件生成站内信/邮件文案（兜底中文；前端可按 type 再做多语言渲染） */
function render(event: NotificationEvent, data: Record<string, unknown>): {
  title: string;
  body: string;
  link: string;
  emailSubject: string;
  emailHeading: string;
  emailLines: string[];
} {
  switch (event) {
    case "billing.payment_succeeded":
      return {
        title: "支付成功",
        body: `订单 ${String(data.orderNo ?? "")} 已支付成功，金额 ${money(data.amount)}。`,
        link: "/settings/billing?tab=orders",
        emailSubject: "支付成功",
        emailHeading: "支付成功",
        emailLines: [
          `订单号：${String(data.orderNo ?? "")}`,
          `商品：${String(data.productName ?? "")}`,
          `金额：${money(data.amount)}`,
        ],
      };
    case "billing.invoice.submitted":
      return {
        title: "开票申请已提交",
        body: `发票申请 #${String(data.requestId ?? "")} 已提交，金额 ${money(data.amount)}，我们将在 1 个工作日内处理。`,
        link: "/settings/billing?tab=invoices",
        emailSubject: "开票申请已提交",
        emailHeading: "开票申请已提交",
        emailLines: [
          `申请单号：#${String(data.requestId ?? "")}`,
          `发票类型：${data.invoiceType === "special" ? "增值税专用发票" : "电子普通发票"}`,
          `金额：${money(data.amount)}`,
          "处理完成后会再次通知您。",
        ],
      };
    case "billing.invoice.issued":
      return {
        title: "发票已开具",
        body: `发票申请 #${String(data.requestId ?? "")} 已开具${data.invoiceNo ? `，发票号 ${String(data.invoiceNo)}` : ""}，可在费用中心下载。`,
        link: "/settings/billing?tab=invoices",
        emailSubject: "发票已开具",
        emailHeading: "发票已开具",
        emailLines: [
          `申请单号：#${String(data.requestId ?? "")}`,
          `发票号：${String(data.invoiceNo ?? "—")}`,
          "请登录费用中心 → 发票管理下载发票文件。",
        ],
      };
    case "billing.invoice.rejected":
      return {
        title: "开票申请未通过",
        body: `发票申请 #${String(data.requestId ?? "")} 未通过：${String(data.reason ?? "请联系客服了解原因")}`,
        link: "/settings/billing?tab=invoices",
        emailSubject: "开票申请未通过",
        emailHeading: "开票申请未通过",
        emailLines: [
          `申请单号：#${String(data.requestId ?? "")}`,
          `原因：${String(data.reason ?? "请联系客服了解原因")}`,
        ],
      };
  }
}

/**
 * 分发一条业务通知：站内信 + 邮件（按策略）。
 * 所有渠道失败都只记日志，不抛异常。
 */
export async function dispatchNotification(
  pool: Pool,
  input: {
    userId: number;
    event: NotificationEvent;
    data?: Record<string, unknown>;
    dedupeKey?: string | null;
  },
): Promise<void> {
  const policy = POLICY[input.event];
  if (!policy) return;
  const data = input.data ?? {};
  const content = render(input.event, data);

  if (policy.inapp) {
    await pushNotificationSafe(pool, {
      userId: input.userId,
      type: input.event,
      title: content.title,
      body: content.body,
      link: content.link,
      payload: data,
      dedupeKey: input.dedupeKey ?? null,
    });
  }

  if (policy.email && isEmailConfigured()) {
    try {
      const contact = await findContact(pool, input.userId);
      if (contact?.email) {
        await sendNotificationEmail(contact.email, {
          subject: content.emailSubject,
          heading: content.emailHeading,
          lines: content.emailLines,
          link: { href: absoluteUrl(content.link), text: "前往查看" },
        });
      }
    } catch (err) {
      console.warn("[notifications] 邮件发送失败（不影响主流程）:", (err as Error).message);
    }
  }
}

/** 支付成功后通知（按订单号幂等） */
export async function notifyPaymentSucceeded(pool: Pool, orderNo: string): Promise<void> {
  try {
    const [rows] = await pool.query<Array<RowDataPacket & {
      user_id: number; order_no: string; product_name: string | null; amount: string | number;
    }>>(
      "SELECT user_id, order_no, product_name, amount FROM orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    const order = rows[0];
    if (!order) return;
    await dispatchNotification(pool, {
      userId: Number(order.user_id),
      event: "billing.payment_succeeded",
      data: { orderNo: order.order_no, productName: order.product_name ?? "", amount: order.amount },
      dedupeKey: `payment:${order.order_no}`,
    });
  } catch (err) {
    console.warn("[notifications] 支付成功通知失败:", (err as Error).message);
  }
}

/** 新开票申请：通知用户，同时（可选）提醒内部运营邮箱 */
export async function notifyInvoiceSubmitted(
  pool: Pool,
  input: { requestId: number; userId: number; amount: number; invoiceType: string },
): Promise<void> {
  await dispatchNotification(pool, {
    userId: input.userId,
    event: "billing.invoice.submitted",
    data: input,
    dedupeKey: `invoice.submitted:${input.requestId}`,
  });
  const opsEmail = (process.env.BILLING_NOTIFY_EMAIL || "").trim();
  if (opsEmail && isEmailConfigured()) {
    try {
      await sendNotificationEmail(opsEmail, {
        subject: "新开票申请待处理",
        heading: "新开票申请待处理",
        lines: [
          `申请单号：#${input.requestId}`,
          `发票类型：${input.invoiceType === "special" ? "增值税专用发票" : "电子普通发票"}`,
          `金额：${money(input.amount)}`,
          "请登录后台「订单与订阅 → 发票管理」处理。",
        ],
      });
    } catch (err) {
      console.warn("[notifications] 运营开票提醒邮件失败:", (err as Error).message);
    }
  }
}
