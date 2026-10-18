/**
 * RFQ 发布邀约触达服务
 *
 * @module lib/services/rfq-outreach
 * @description 已发布 platform RFQ 的“发现邮件”触达：把需求邀约发给匹配的认证供应商
 *              （或显式收件），邮件 + 触达账本去重。best-effort：SMTP 未配或单封失败均不阻断。
 *              匹配为保守 Top-N「活跃认证供应商」粗筛（精确类目匹配待接入撮合底座）；
 *              默认由调用方/定时任务显式限量，避免无监督群发。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { absoluteUrl } from "@/lib/services/seo/site";
import { formatDeadlineDateYMD, currencySymbol } from "@/shared/utils/format";
import { isEmailConfigured, sendRfqInviteEmail } from "@/lib/services/email";

export interface OutreachRecipient {
  email: string;
  supplierUserId: number | null;
}

export interface OutreachInput {
  rfqId: number;
  /** 显式收件邮箱（给定则只发这些，用于定向/测试；否则走匹配供应商）。 */
  emails?: string[];
  /** 匹配供应商上限（emails 未给时生效）。 */
  limit?: number;
  /** 只解析收件、不发送也不写账本（成本预估/审阅）。 */
  dryRun?: boolean;
}

export interface OutreachResult {
  rfqId: number;
  published: boolean;
  recipients: number;
  emailed: number;
  skipped: number;
  dryRun: boolean;
}

const DEFAULT_MATCH_LIMIT = 20;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 预算展示文案（与需求广场同口径：万元）。 */
function budgetText(value: number, currency: string): string {
  if (!value || value <= 0) return "预算保密";
  return `${currencySymbol(currency)}${Math.round(value)} 万`;
}

/** 匹配认证供应商收件：活跃、已绑定 supplier、有邮箱，排除本 RFQ 已触达者，Top-N。 */
async function matchSupplierRecipients(dbPool: Pool, rfqId: number, limit: number): Promise<OutreachRecipient[]> {
  const [rows] = await dbPool.query(
    `SELECT u.id AS uid, u.email AS email
       FROM crm_users u
       LEFT JOIN crm_rfq_outreach o ON o.rfq_id = ? AND o.supplier_user_id = u.id
      WHERE u.supplier_link_status = 'verified'
        AND u.supplier_id IS NOT NULL
        AND u.account_status NOT IN ('disabled', 'rejected')
        AND u.email IS NOT NULL AND u.email <> ''
        AND o.id IS NULL
      ORDER BY u.id ASC
      LIMIT ?`,
    [rfqId, limit],
  );
  return (rows as RowDataPacket[]).map((r) => ({ email: String(r.email), supplierUserId: Number(r.uid) }));
}

/** 该 RFQ 是否已触达过此收件邮箱。 */
async function alreadyReached(dbPool: Pool, rfqId: number, email: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    `SELECT 1 FROM crm_rfq_outreach WHERE rfq_id = ? AND recipient = ? LIMIT 1`,
    [rfqId, email],
  );
  return (rows as RowDataPacket[]).length > 0;
}

/** 记录触达（幂等：唯一键冲突视为已触达，不报错）。 */
async function recordOutreach(dbPool: Pool, rfqId: number, recipient: OutreachRecipient): Promise<void> {
  await dbPool.query(
    `INSERT INTO crm_rfq_outreach (rfq_id, recipient, supplier_user_id, contacted_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE contacted_at = contacted_at`,
    [rfqId, recipient.email, recipient.supplierUserId, nowSec()],
  );
}

/**
 * 对一条已发布 RFQ 执行邀约触达。
 * - emails 显式给定 → 只发这些（定向/测试）；否则匹配 Top-N 认证供应商。
 * - dryRun → 仅解析收件数，不发送、不写账本。
 */
export async function outreachPublishedRfq(dbPool: Pool, input: OutreachInput): Promise<OutreachResult> {
  const [rows] = await dbPool.query(
    `SELECT id, title, deadline_sec, estimated_value, currency, rfq_status
       FROM crm_bid_notices
      WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform' LIMIT 1`,
    [input.rfqId],
  );
  const rfq = (rows as RowDataPacket[])[0];
  if (!rfq || String(rfq.rfq_status) !== RFQ_STATUS.PUBLISHED) {
    return { rfqId: input.rfqId, published: false, recipients: 0, emailed: 0, skipped: 0, dryRun: !!input.dryRun };
  }

  const recipients: OutreachRecipient[] =
    input.emails && input.emails.length > 0
      ? input.emails.map((e) => ({ email: e, supplierUserId: null }))
      : await matchSupplierRecipients(dbPool, input.rfqId, input.limit ?? DEFAULT_MATCH_LIMIT);

  const link = absoluteUrl(`/rfq/${input.rfqId}`);
  const title = String(rfq.title || "");
  const deadline = formatDeadlineDateYMD(Number(rfq.deadline_sec) || 0, { utc: true, emptyText: "" });
  const budget = budgetText(Number(rfq.estimated_value) || 0, String(rfq.currency || "CNY"));

  let emailed = 0;
  let skipped = 0;
  for (const r of recipients) {
    if (!r.email) {
      skipped++;
      continue;
    }
    if (await alreadyReached(dbPool, input.rfqId, r.email)) {
      skipped++;
      continue;
    }
    if (input.dryRun) {
      emailed++; // 预估将发
      continue;
    }
    if (!isEmailConfigured()) {
      skipped++;
      continue;
    }
    try {
      await sendRfqInviteEmail(r.email, { rfqTitle: title, rfqLink: link, deadlineText: deadline, budgetText: budget });
      await recordOutreach(dbPool, input.rfqId, r);
      emailed++;
    } catch (e) {
      console.warn("[rfq-outreach] 邀约邮件失败，跳过该收件:", (e as Error).message);
      skipped++;
    }
  }

  return { rfqId: input.rfqId, published: true, recipients: recipients.length, emailed, skipped, dryRun: !!input.dryRun };
}

/** 待触达的已发布 RFQ（尚无触达账本记录、未过期），供定时任务限量处理。 */
export async function pendingOutreachRfqIds(dbPool: Pool, limit: number): Promise<number[]> {
  const [rows] = await dbPool.query(
    `SELECT n.id AS id
       FROM crm_bid_notices n
      WHERE n.notice_type = 'RFQ' AND n.entry_source = 'platform' AND n.rfq_status = ?
        AND (n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
        AND NOT EXISTS (SELECT 1 FROM crm_rfq_outreach o WHERE o.rfq_id = n.id)
      ORDER BY n.id DESC
      LIMIT ?`,
    [RFQ_STATUS.PUBLISHED, limit],
  );
  return (rows as RowDataPacket[]).map((r) => Number(r.id));
}
