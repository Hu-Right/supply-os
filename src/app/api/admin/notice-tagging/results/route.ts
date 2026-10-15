/**
 * GET /api/admin/notice-tagging/results — 打标结果列表（落点表，倒序）
 * @description 「公告管理」页「打标结果」页签数据源：crm_notice_attribution_nodes 最近落点，
 *              JOIN 公告标题与节点名。?source= 过滤（ai_content|manual_confirm|legacy_tag），
 *              ?page=1&pageSize=20。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { requireAdminOrThrow } from "@/lib/services/admin-access";

const SOURCE_RE = /^(ai_content|manual_confirm|legacy_tag)$/;

export const GET = withRoute(async (req: NextRequest) => {
  await requireAdminOrThrow(req);
  const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("pageSize")) || 20)));
  const source = String(req.nextUrl.searchParams.get("source") || "").trim();
  const pool = getContext().dbPool;

  const where = SOURCE_RE.test(source) ? `WHERE a.source = ?` : "";
  const params: unknown[] = SOURCE_RE.test(source) ? [source] : [];

  const [countRows] = await pool.query(`SELECT COUNT(*) n FROM crm_notice_attribution_nodes a ${where}`, params);
  const total = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);

  const [rows] = await pool.query(
    `SELECT a.notice_pk, a.node_code, a.level, a.confidence, a.source, a.model, a.evidence_text,
            n.notice_id, n.title, b.name_zh AS node_name
       FROM crm_notice_attribution_nodes a
       JOIN crm_bid_notices n ON n.id = a.notice_pk
       LEFT JOIN crm_commodity_backbone b ON b.code = a.node_code
       ${where}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const items = (rows as Array<Record<string, unknown>>).map((r) => ({
    noticeId: String(r.notice_id ?? ""),
    title: String(r.title ?? ""),
    nodeCode: String(r.node_code ?? ""),
    nodeName: String(r.node_name ?? ""),
    level: Number(r.level ?? 0),
    confidence: Number(r.confidence ?? 0),
    source: String(r.source ?? ""),
    model: String(r.model ?? ""),
    evidence: String(r.evidence_text ?? ""),
  }));
  return NextResponse.json({ total, page, pageSize, items });
});
