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
import { deletePublicRows } from "@/lib/services/notice-public/build";

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

/** 采购方式 → 公告类型码（与 notice-type 的归一码一致；LTA 不投影为标讯） */
const NOTICE_TYPE_BY_METHOD: Record<string, string> = {
  rfq: "RFQ",
  itb: "ITB",
  rfp: "RFP",
  eoi: "EOI",
};

export function noticeTypeForMethod(method: string | null | undefined): string {
  const key = String(method ?? "").trim().toLowerCase();
  const code = NOTICE_TYPE_BY_METHOD[key];
  // 方式 → 类型码必须显式命中：lta 不投影为标讯（既定口径），未知方式一律拒绝而非回退 RFQ
  //（P0 旧实现缺省回退 "RFQ"，会把 lta/脏值静默投影成询价公告 —— 守护与检索面双重失真）
  if (!code) throw new Error(`PROCUREMENT_METHOD_NOT_PROJECTABLE: ${String(method)}`);
  return code;
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
    province_name: row.delivery_city ?? null,
    category_code: row.primary_ugt_code ?? null,
    notice_type: noticeTypeForMethod(row.method),
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
    // 水位选行（notice-public/build.ts 主表分支）只认 update_time 非空的行：
    // 平台投影行不写时间戳 → 服务表/宽表/Meili 对平台单永久零覆盖（2026-11-17 实测修复）。
    // 口径与爬虫行一致：bigint epoch 秒。
    create_time: publishedAtSec,
    update_time: publishedAtSec,
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
  "create_time",
  "update_time",
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
    // 重发布（同行换版本）只顶 update_time，保留首次创建时间
    const setCols = COLUMNS.filter((c) => c !== "notice_id" && c !== "create_time");
    const sets = setCols.map((c) => `${c} = ?`);
    const params = setCols.map((c) => built[c]);
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

/** 截止收标：把投影行标记为已关闭（保留公告页，检索面按 deadline 自然下架） */
export async function markProjectionClosed(db: Pool, noticePk: number, at: number): Promise<void> {
  await db.query(
    "UPDATE bid_notices SET rfq_status = 'closed', update_time = ? WHERE id = ? AND entry_source = 'platform'",
    [at, noticePk],
  );
}

/** 关闭/撤回时撤下投影：只删本域写入的那一行（按 id + platform 防误伤爬虫行） */
export async function removeProjection(db: Pool, noticePk: number | null): Promise<void> {
  if (!noticePk) return;
  await db.query("DELETE FROM bid_notices WHERE id = ? AND entry_source = 'platform'", [noticePk]);
  // 服务宽表/搜索宽表是物化投影，删主表不会级联；撤回后若不清，公告列表仍能读到旧行
  await deletePublicRows(db, [noticePk]);
  try {
    await db.query("DELETE FROM notice_search WHERE id = ?", [noticePk]);
  } catch (err) {
    // 某些环境未启用 notice_search（历史宽表）；清理失败不应阻断撤回
    console.warn("[procurement] 清理 notice_search 失败（继续）:", (err as Error).message);
  }
  // 守护销账：v2 撤投影是删行，不销账守护对账会误报「主行已不存在」
  await db.query("DELETE FROM rfq_guard WHERE rfq_id = ?", [noticePk]);
}
