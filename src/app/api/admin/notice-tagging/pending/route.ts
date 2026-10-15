/**
 * GET /api/admin/notice-tagging/pending — 待人工确认列表（低置信 + 从未判定）
 * @description 「公告管理」页人工确认队列的数据源：crm_taxonomy_intake 里 status='pending'
 *              的行，JOIN 公告标题与 AI 建议节点名。有 code 的行=AI 低置信建议，无 code 的
 *              行=还没跑过 AI（新登记）。按公告 pk 倒序（新公告在前）。
 *              ?page=1&pageSize=20（pageSize ≤ 100）
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { requireAdminOrThrow } from "@/lib/services/admin-access";

export const GET = withRoute(async (req: NextRequest) => {
  await requireAdminOrThrow(req);
  const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("pageSize")) || 20)));
  const pool = getContext().dbPool;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) n FROM crm_taxonomy_intake WHERE status='pending'`,
  );
  const total = Number((countRows as Array<{ n: number }>)[0]?.n ?? 0);

  const [rows] = await pool.query(
    `SELECT i.notice_id, i.code AS suggest_code,
            CASE WHEN i.code LIKE 'UGT-%' THEN 1 ELSE 0 END AS suggest_is_ugt,
            i.reason AS suggest_reason, n.id AS pk, n.title, n.deadline_sec,
            b.name_zh AS suggest_name
       FROM crm_taxonomy_intake i
       JOIN crm_bid_notices n ON n.notice_id = i.notice_id
       LEFT JOIN crm_commodity_backbone b ON b.code = i.code
      WHERE i.status='pending'
      ORDER BY n.id DESC
      LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize],
  );
  // 只有 UGT 形态的 code 才配叫「AI 建议」：队列里还躺着旧桥表时代登记的行，
  // code 列存的是 UNSPSC 8 位码/字母桶码（85760000 / J），那些是历史残留不是建议。
  const items = (rows as Array<Record<string, unknown>>).map((r) => ({
    noticeId: String(r.notice_id ?? ""),
    pk: Number(r.pk ?? 0),
    title: String(r.title ?? ""),
    suggestCode: Number(r.suggest_is_ugt) === 1 ? String(r.suggest_code ?? "") : "",
    suggestName: Number(r.suggest_is_ugt) === 1 ? String(r.suggest_name ?? "") : "",
    suggestReason: Number(r.suggest_is_ugt) === 1 ? String(r.suggest_reason ?? "") : "",
    expired: Number(r.deadline_sec ?? 0) > 0 && Number(r.deadline_sec) < Math.floor(Date.now() / 1000),
  }));
  return NextResponse.json({ total, page, pageSize, items });
});
