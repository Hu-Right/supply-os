/**
 * POST /api/admin/notice-tagging/confirm — 人工确认落点 { noticeId, code, reason? }
 * @description 「公告管理」人工确认通道（ops 人工锚定脚本的应用内版）：
 *              形制闸 + 树内闸（码必须真实存在于骨架树）→ INSERT IGNORE 落点表
 *              (source='manual_confirm') → intake pending 翻 resolved → 推宽表同步队列。
 *              码不合形制或不在树上直接 400，绝不放行脏码。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { withRoute, parseJson, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { requireAdminOrThrow } from "@/lib/services/admin-access";
import { assertAttributionNode } from "@/lib/services/commodity/attribution";
import { backboneNodeLevel } from "@/lib/services/commodity/backbone-path";
import { enqueue as enqueueWideSync } from "@/lib/services/search-sync/sync-queue";

const confirmBodySchema = z.object({
  noticeId: z.string().min(1).max(64),
  code: z.string().min(1).max(40),
  reason: z.string().max(500).optional(),
});

export const POST = withRoute(async (req: NextRequest) => {
  const adminId = await requireAdminOrThrow(req);
  const body = await parseJson(req, confirmBodySchema);
  const noticeId = body.noticeId.trim();
  const rawCode = body.code.trim();
  const reason = body.reason ?? "";
  if (!noticeId) routeError(400, EC_INVALID_PARAMS, "noticeId 必填");
  if (!rawCode) routeError(400, EC_INVALID_PARAMS, "code 必填（在品目树里选到哪层就确认到哪层，最低 L2）");

  const pool = getContext().dbPool;

  // 双闸：形制 + 树内（与 AI 管道同口径，人工确认不豁免）
  let code = "";
  try {
    code = assertAttributionNode(rawCode, noticeId);
  } catch {
    routeError(400, EC_INVALID_PARAMS, `节点码形制非法：「${rawCode}」不是 UGT- 合法层级码`);
  }
  const [hit] = await pool.query(`SELECT level, name_zh FROM crm_commodity_backbone WHERE code = ? AND status = 1 LIMIT 1`, [code]);
  const node = (hit as Array<{ level: number; name_zh: string }>)[0];
  if (!node) routeError(400, EC_INVALID_PARAMS, `节点码不在骨架树上：「${code}」`);
  if (backboneNodeLevel(code) < 2) routeError(400, EC_INVALID_PARAMS, "落点最低到 L2（不得只挂大类）");

  const [pkRows] = await pool.query(`SELECT id FROM crm_bid_notices WHERE notice_id = ? LIMIT 1`, [noticeId]);
  const pk = Number((pkRows as Array<{ id: number }>)[0]?.id ?? 0);
  if (!pk) routeError(400, EC_INVALID_PARAMS, `公告不存在：${noticeId}`);

  const evidence = reason || `人工确认（admin ${adminId}）`;
  await pool.query(
    `INSERT IGNORE INTO crm_notice_attribution_nodes (notice_pk, node_code, level, confidence, source, model, evidence_text)
     VALUES (?, ?, ?, ?, 'manual_confirm', 'manual_confirm', ?)`,
    [pk, code, backboneNodeLevel(code), "1.000", evidence],
  );
  await pool.query(
    `UPDATE crm_taxonomy_intake SET status='resolved', code=?, reason=? WHERE notice_id=? AND status='pending'`,
    [code, evidence, noticeId],
  );
  enqueueWideSync(pool, [pk]);
  return NextResponse.json({ ok: true, code, nodeName: String(node.name_zh ?? "") });
});
