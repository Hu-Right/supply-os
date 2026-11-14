/**
 * 采购需求 → 公告主表的搜索投影（新发布域）
 * @module lib/services/procurement/projection
 *
 * @description 与旧 rfq/projection.ts 同语义（ADR-0015：重构后唯一允许写 bid_notices 的
 *              平台入口），字段源换成 procurement 域。投影仍写 entry_source='platform' +
 *              notice_type='RFQ' + rfq_status='published'——公告/宽表/Meili/首页三条
 *              检索面只认 bid_notices 这些列（全案：云境原生订单与外部标讯同搜索体系）。
 *              描述 = 项目背景 + 明细清单文本化（搜索可命中产品词）。
 */
import type { Pool } from "mysql2/promise";
import type { ProjectRow } from "./projects";

const SHANGHAI_OFFSET_SEC = 8 * 3600;

/** 秒 → Asia/Shanghai 的 yyyy-MM-dd（服务表 published_date/deadline 都是短日期串） */
export function formatShanghaiDate(sec: number | null | undefined): string | null {
  if (!sec) return null;
  const d = new Date((sec + SHANGHAI_OFFSET_SEC) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ProjectionSource {
  projectId: number;
  noticePk: number | null;
  reference: string;
  buyerOrgName: string;
  buyerUserId: number | null;
  row: ProjectRow;
  description: string;
}

export interface ProjectionRowLike {
  [column: string]: unknown;
}

/** 投影行（纯函数，便于单测；字段即"服务表口径的入表规则"） */
export function buildProjectionRow(src: ProjectionSource, publishedAtSec: number): ProjectionRowLike {
  const row = src.row;
  const budgetPublic = Number(row.budget_public) === 1 && row.budget_amount != null;
  return {
    notice_id: src.reference,
    reference: src.reference,
    title: row.title_zh,
    description: src.description,
    country: row.delivery_country || "China",
    province_name: row.delivery_province ?? row.delivery_city ?? null,
    category_code: row.primary_ugt_code ?? null,
    notice_type: "RFQ",
    deadline: formatShanghaiDate(row.quote_deadline_at),
    // deadline_sec 是 STORED 生成列（deadline_ts → 秒），写毫秒走生成列分支；无截止 → NULL
    deadline_ts: row.quote_deadline_at ? row.quote_deadline_at * 1000 : null,
    published_date: formatShanghaiDate(publishedAtSec),
    estimated_value: budgetPublic ? String(row.budget_amount) : null,
    currency: row.budget_currency,
    budget_confidential: budgetPublic ? 0 : 1,
    organization: src.buyerOrgName,
    user_id: src.buyerUserId,
    entry_source: "platform",
    rfq_status: "published",
  };
}

const COLUMNS = [
  "notice_id",
  "reference",
  "title",
  "description",
  "country",
  "province_name",
  "category_code",
  "notice_type",
  "deadline",
  "deadline_ts",
  "published_date",
  "estimated_value",
  "currency",
  "budget_confidential",
  "organization",
  "user_id",
  "entry_source",
  "rfq_status",
] as const;

/** 组装公开描述：项目背景 + 明细清单文本化 */
export function buildPublicDescription(
  row: ProjectRow,
  items: Array<{ name_zh: string; spec: string | null; quantity: string | number | null; qty_unit: string }>,
): string {
  const lines: string[] = [];
  if (row.background) lines.push(String(row.background));
  if (items.length > 0) {
    lines.push("采购明细 / Item list:");
    items.forEach((it, idx) => {
      const spec = it.spec ? `（${it.spec}）` : "";
      lines.push(`${idx + 1}. ${it.name_zh}${spec} × ${it.quantity ?? "-"} ${it.qty_unit}`);
    });
  }
  return lines.join("\n\n") || row.title_zh;
}

/** 写入/更新投影行，返回 bid_notices.id（notice_pk）。调用方回写（同事务）。 */
export async function upsertProjection(
  db: Pool,
  src: ProjectionSource,
  publishedAtSec: number,
): Promise<number> {
  const built = buildProjectionRow(src, publishedAtSec);
  const values = COLUMNS.map((c) => built[c]);

  if (src.noticePk) {
    const sets = COLUMNS.filter((c) => c !== "notice_id").map((c) => `${c} = ?`);
    const params = COLUMNS.filter((c) => c !== "notice_id").map((c) => built[c]);
    params.push(src.noticePk);
    await db.query(`UPDATE bid_notices SET ${sets.join(", ")} WHERE id = ?`, params);
    return src.noticePk;
  }

  const placeholders = COLUMNS.map(() => "?").join(", ");
  const [result] = await db.query(
    `INSERT INTO bid_notices (${COLUMNS.join(", ")}) VALUES (${placeholders})`,
    values,
  );
  return Number((result as { insertId?: number }).insertId ?? 0);
}

/** 关闭/撤回时撤下投影：只删本域写入的那一行（按 id + platform + RFQ 三条件防误伤爬虫行） */
export async function removeProjection(db: Pool, noticePk: number | null): Promise<void> {
  if (!noticePk) return;
  await db.query(
    "DELETE FROM bid_notices WHERE id = ? AND entry_source = 'platform' AND notice_type = 'RFQ'",
    [noticePk],
  );
  // 守护销账：v2 撤投影是删行，不销账守护对账会误报「主行已不存在」
  await db.query("DELETE FROM rfq_guard WHERE rfq_id = ?", [noticePk]);
}
