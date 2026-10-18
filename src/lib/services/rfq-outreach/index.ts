/**
 * RFQ 发布邀约触达服务（rfq-outreach）— 服务端专用
 *
 * @module server/services/rfq-outreach
 * @description 把一条已发布 RFQ 邀约给「匹配的认证供应商」并邮件触达：
 *              - 匹配（非-AI）：品目口径 = RFQ `category_code`(UGT 节点码) 与供应商
 *                `crm_supplier_backbone_interests.code` 经 `getBackboneIndex().pathOf` 展开
 *                成祖先节点集后求交集（同一祖先即命中，越大类越近权重越高）；地域以省份相近优先。
 *                无品类码 / 索引不可用 / 交集为空 → 保守回退「省份 + 活跃认证供应商」Top-N（strategy=region）。
 *              - 触达账本 crm_rfq_outreach 按 (rfq_id, recipient) 去重，避免对同一供应商重复群发。
 *              - 显式收件（指定邮箱）为管理/测试快路径，不走匹配器。
 *              ⚠️ 群发是外发副作用：默认仅 dryRun 预览；放量须调用方显式 dryRun:false（并遵守“付费/外发由用户放行”）。
 *              复用 lib/services/email 模板与 seo/site absoluteUrl；不 import features/core（分层红线1）。
 */
import "server-only";
import type { Pool as DbPool, RowDataPacket } from "mysql2/promise";
import { RFQ_STATUS } from "@/shared/constants/rfq";
import { absoluteUrl } from "@/lib/services/seo/site";
import { isEmailConfigured, sendRfqInviteEmail } from "@/lib/services/email";
import { getBackboneIndex } from "@/lib/services/commodity/backbone-cache";

/** 默认最多邀约匹配的认证供应商数（防骚扰与 SMTP 限流）。 */
export const DEFAULT_MATCH_LIMIT = 20;
/** 匹配前先取的地域候选池上限（再用类目交集收窄），避免一次载入全量供应商。 */
const CANDIDATE_POOL = 300;

/** 邀约收件人（匹配路径带供应商上下文，供预览展示）。 */
export interface ReachRecipient {
  userId: number;
  email: string;
  company: string;
  /** 与 RFQ 品目的祖先节点交集大小（region 回退时为 0）。 */
  matchCount: number;
}

export interface OutreachResult {
  rfqId: number;
  /** RFQ 是否 published（否则不触达）。 */
  published: boolean;
  /** 匹配/指定的收件人数量。 */
  recipients: number;
  emailed: number;
  /** 命中去重（此前已触达）而跳过的数量。 */
  skipped: number;
  dryRun: boolean;
  /** 匹配策略：category=品目交集命中；region=回退按地域；explicit=显式收件。 */
  strategy?: "category" | "region" | "explicit";
  /** 预览收件人（dryRun 时返回，供人工放行；显式收件时为空）。 */
  preview?: ReachRecipient[];
}

function deadlineText(deadline: unknown): string | undefined {
  const d = String(deadline ?? "").trim();
  return d || undefined;
}

/** 该 RFQ 是否已向此邮箱触达过。 */
async function alreadyReached(dbPool: DbPool, rfqId: number, email: string): Promise<boolean> {
  const [rows] = await dbPool.query(
    `SELECT 1 FROM crm_rfq_outreach WHERE rfq_id = ? AND recipient = ? LIMIT 1`,
    [rfqId, email],
  );
  return (rows as RowDataPacket[]).length > 0;
}

/** 记录一次触达（幂等：命中唯一键则刷新 contacted_at 不报错）。 */
async function recordOutreach(
  dbPool: DbPool,
  rfqId: number,
  email: string,
  supplierUserId: number | null,
): Promise<void> {
  await dbPool.query(
    `INSERT INTO crm_rfq_outreach (rfq_id, recipient, supplier_user_id, contacted_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE contacted_at = contacted_at`,
    [rfqId, email, supplierUserId, Math.floor(Date.now() / 1000)],
  );
}

/**
 * 匹配「可邀约的认证供应商」收件人（非-AI：品目祖先交集 + 地域优先）。
 * 已触达（crm_rfq_outreach）者排除；上限 limit。
 */
export async function matchSuppliers(
  dbPool: DbPool,
  rfq: { id: number; categoryCode: string | null; province: string },
  limit = DEFAULT_MATCH_LIMIT,
): Promise<{ recipients: ReachRecipient[]; strategy: "category" | "region" }> {
  // 地域候选池：活跃认证供应商（有邮箱、有 supplier 档案），省份相符者优先
  const [crows] = await dbPool.query(
    `SELECT u.id AS user_id, u.email, u.supplier_id, s.company, s.province
       FROM crm_users u
       JOIN supplier s ON s.id = u.supplier_id
      WHERE u.supplier_link_status = 'verified'
        AND u.supplier_id IS NOT NULL
        AND (u.account_status IS NULL OR (u.account_status <> 'disabled' AND u.account_status <> 'rejected'))
        AND u.email IS NOT NULL AND u.email <> ''
        AND NOT EXISTS (SELECT 1 FROM crm_rfq_outreach o WHERE o.rfq_id = ? AND o.recipient = u.email)
      ORDER BY (s.province <=> ?) DESC, u.id ASC
      LIMIT ?`,
    [rfq.id, rfq.province, CANDIDATE_POOL],
  );
  const candidates = (crows as RowDataPacket[]).map((r) => ({
    userId: Number(r.user_id),
    email: String(r.email),
    supplierId: Number(r.supplier_id),
    company: String(r.company ?? "").trim(),
    province: String(r.province ?? ""),
  }));
  if (candidates.length === 0) return { recipients: [], strategy: "region" };

  // 品目交集收窄：RFQ 品类节点集 ∩ 供应商兴趣节点集 非空即命中，交集大小排序
  if (rfq.categoryCode) {
    const index = await getBackboneIndex(dbPool).catch(() => null);
    if (index) {
      const rfqNodes = new Set(index.pathOf([rfq.categoryCode]).codes);
      if (rfqNodes.size > 0) {
        const ids = candidates.map((c) => c.supplierId).filter((n) => n > 0);
        const bySup = new Map<number, string[]>();
        if (ids.length > 0) {
          const ph = ids.map(() => "?").join(",");
          const [irows] = await dbPool.query(
            `SELECT supplier_id, code FROM crm_supplier_backbone_interests
             WHERE supplier_id IN (${ph}) AND code <> ''`,
            ids,
          );
          for (const row of irows as RowDataPacket[]) {
            const sid = Number(row.supplier_id);
            const code = String(row.code ?? "").trim();
            if (!sid || !code) continue;
            const arr = bySup.get(sid);
            if (arr) arr.push(code);
            else bySup.set(sid, [code]);
          }
        }
        const scored: ReachRecipient[] = [];
        for (const c of candidates) {
          const codes = bySup.get(c.supplierId);
          if (!codes || codes.length === 0) continue;
          const supNodes = index.pathOf(codes).codes;
          let hit = 0;
          for (const n of supNodes) if (rfqNodes.has(n)) hit++;
          if (hit > 0) scored.push({ userId: c.userId, email: c.email, company: c.company, matchCount: hit });
        }
        if (scored.length > 0) {
          scored.sort((a, b) => b.matchCount - a.matchCount || a.userId - b.userId);
          return { recipients: scored.slice(0, limit), strategy: "category" };
        }
        // 有品类却零交集 → 保守回退地域，不硬凑无关供应商
      }
    }
  }

  return {
    recipients: candidates.slice(0, limit).map((c) => ({ userId: c.userId, email: c.email, company: c.company, matchCount: 0 })),
    strategy: "region",
  };
}

/** 为定向 RFQ 写入邀约白名单（幂等，主键去重）。invitedBy = 发起邀约的采购方 user_id。返回受影响行数。 */
export async function addInvites(dbPool: DbPool, rfqId: number, invitedBy: number, userIds: number[]): Promise<number> {
  const ids = [...new Set(userIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return 0;
  const values = ids.map(() => "(?, ?, ?)").join(", ");
  const params: unknown[] = [];
  for (const id of ids) params.push(rfqId, id, invitedBy);
  const [result] = await dbPool.query(
    `INSERT IGNORE INTO crm_rfq_invites (rfq_id, supplier_user_id, invited_by) VALUES ${values}`,
    params,
  );
  return (result as { affectedRows: number }).affectedRows;
}

/**
 * 邀约触达一条已发布 RFQ。
 * - 收件来源：显式 emails（管理/测试）或匹配器（认证供应商 Top-N）。
 * - dryRun=true：只返回将触达的范围（含预览名单），不写库不发信。
 */
export async function outreachPublishedRfq(
  dbPool: DbPool,
  input: { rfqId: number; emails?: string[]; limit?: number; dryRun?: boolean },
): Promise<OutreachResult> {
  const [rows] = await dbPool.query(
    `SELECT title, deadline, rfq_status, category_code, province_name, visibility
       FROM crm_bid_notices WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform' LIMIT 1`,
    [input.rfqId],
  );
  const rfq = (rows as RowDataPacket[])[0];
  if (!rfq || String(rfq.rfq_status) !== RFQ_STATUS.PUBLISHED) {
    return { rfqId: input.rfqId, published: false, recipients: 0, emailed: 0, skipped: 0, dryRun: !!input.dryRun };
  }

  const title = String(rfq.title);
  const link = absoluteUrl(`/rfq/${input.rfqId}`);
  const dl = deadlineText(rfq.deadline);

  // 收件来源：显式 emails 或匹配器
  let explicitEmails: string[] | null = null;
  let matched: ReachRecipient[] = [];
  let strategy: OutreachResult["strategy"];
  if (input.emails && input.emails.length > 0) {
    explicitEmails = [...new Set(input.emails.map((e) => e.trim()).filter(Boolean))];
    strategy = "explicit";
  } else {
    const m = await matchSuppliers(
      dbPool,
      {
        id: input.rfqId,
        categoryCode: String(rfq.category_code ?? "").trim() || null,
        province: String(rfq.province_name ?? ""),
      },
      input.limit ?? DEFAULT_MATCH_LIMIT,
    );
    matched = m.recipients;
    strategy = m.strategy;
  }

  // dryRun：返回范围与预览名单，不写库不发信
  if (input.dryRun) {
    const count = explicitEmails ? explicitEmails.length : matched.length;
    return {
      rfqId: input.rfqId,
      published: true,
      recipients: count,
      emailed: 0,
      skipped: 0,
      dryRun: true,
      strategy,
      preview: explicitEmails ? [] : matched,
    };
  }

  let emailed = 0;
  let skipped = 0;
  const canSend = isEmailConfigured();
  if (!canSend) {
    return {
      rfqId: input.rfqId,
      published: true,
      recipients: explicitEmails ? explicitEmails.length : matched.length,
      emailed: 0,
      skipped: 0,
      dryRun: false,
      strategy,
      preview: explicitEmails ? [] : matched,
    };
  }

  if (explicitEmails) {
    for (const email of explicitEmails) {
      if (await alreadyReached(dbPool, input.rfqId, email)) {
        skipped++;
        continue;
      }
      await sendRfqInviteEmail(email, { rfqTitle: title, rfqLink: link, deadlineText: dl });
      await recordOutreach(dbPool, input.rfqId, email, null);
      emailed++;
    }
  } else {
    for (const r of matched) {
      await sendRfqInviteEmail(r.email, { rfqTitle: title, rfqLink: link, deadlineText: dl });
      await recordOutreach(dbPool, input.rfqId, r.email, r.userId);
      emailed++;
    }
  }
  return {
    rfqId: input.rfqId,
    published: true,
    recipients: explicitEmails ? explicitEmails.length : matched.length,
    emailed,
    skipped,
    dryRun: false,
    strategy,
    preview: explicitEmails ? [] : matched,
  };
}

/** 扫描「已发布但尚未触达」的平台 RFQ id（供定时任务批量邀约；限量、按新到旧）。 */
export async function pendingOutreachRfqIds(dbPool: DbPool, limit = 5): Promise<number[]> {
  const [rows] = await dbPool.query(
    `SELECT n.id
       FROM crm_bid_notices n
      WHERE n.entry_source = 'platform'
        AND n.notice_type = 'RFQ'
        AND n.rfq_status = ?
        AND (n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
        AND NOT EXISTS (SELECT 1 FROM crm_rfq_outreach o WHERE o.rfq_id = n.id)
      ORDER BY n.id DESC
      LIMIT ?`,
    [RFQ_STATUS.PUBLISHED, limit],
  );
  return (rows as RowDataPacket[]).map((r) => Number(r.id));
}
