/**
 * RFQ → 公告主表的搜索投影
 * @module lib/services/rfq/projection
 *
 * @description 重构后唯一允许写 `bid_notices` 的入口（且只写索引所需字段）。
 *              链路：rfq_demand（业务态）→ 本模块投影 → bid_notices（公告镜像）
 *                    → 既有 wide-row-builder → notice_search → Meili/SEO。
 *
 *              三条硬约束（与「按服务表口径展示」直接相关）：
 *              1. **金额必须是"纯数字元"**：宽表侧 `parseDecimalValue(estimated_value)` 与
 *                 预算区间 `CAST(... AS DECIMAL)` 都不认识"万"和币种符号；保密时写 NULL，
 *                 不写 "0"（否则保密单会被区间筛选当成 0 元，也与"未填"不可区分）。
 *              2. **派生列不自己算**：`backbone_path` / `precise_backbone_path` / `sync_src_hash`
 *                 是 builder 的产物（ADR 0002/0007），投影只提供 `category_code`。
 *              3. **不写 agency**：平台买家的公司名写 `organization`（兜底链末端），
 *                 避免污染"采购机构"维度聚合。
 */
import type { Pool } from "mysql2/promise";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";

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
  demandId: number;
  noticePk: number | null;
  reference: string;
  title: string;
  description: string | null;
  categoryCode: string | null;
  provinceName: string | null;
  buyerOrgName: string | null;
  /** 需求归属人（bid_notices.user_id，rfq_guard 守护对账按它比对归属） */
  buyerUserId: number | null;
  /** 报价截止（秒） */
  closeAt: number | null;
  /** 发布时间（秒）；缺省用当前时间 */
  publishedAt?: number | null;
  budgetAmount: number | null;
  budgetCurrency: string;
  budgetConfidential: boolean;
}

/** 投影行（纯函数，便于单测；字段即"服务表口径的入表规则"） */
export function buildProjectionRow(src: ProjectionSource) {
  const publishedAt = src.publishedAt ?? Math.floor(Date.now() / 1000);
  return {
    notice_id: src.reference,
    reference: src.reference,
    title: src.title,
    description: src.description ?? null,
    country: "China",
    province_name: src.provinceName ?? null,
    category_code: src.categoryCode ?? null,
    notice_type: "RFQ",
    deadline: formatShanghaiDate(src.closeAt),
    // deadline_sec 是 STORED 生成列（deadline_ts → 秒），这里写毫秒以走生成列分支
    deadline_ts: src.closeAt ? src.closeAt * 1000 : null,
    published_date: formatShanghaiDate(publishedAt),
    // 保密 → NULL（不是 0）；非保密 → 纯数字元
    estimated_value: src.budgetConfidential || src.budgetAmount == null
      ? null
      : String(src.budgetAmount),
    currency: src.budgetCurrency,
    budget_confidential: src.budgetConfidential ? 1 : 0,
    organization: src.buyerOrgName ?? null,
    user_id: src.buyerUserId,
    entry_source: "platform",
    rfq_status: DEMAND_STATUS.PUBLISHED,
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

/**
 * 写入/更新投影行，返回 `bid_notices.id`（notice_pk）。
 * 调用方负责把它回写到 `rfq_demand.notice_pk`（同事务）。
 */
export async function upsertProjection(db: Pool, src: ProjectionSource): Promise<number> {
  const row = buildProjectionRow(src);
  const values = COLUMNS.map((c) => row[c]);

  if (src.noticePk) {
    const sets = COLUMNS.filter((c) => c !== "notice_id").map((c) => `${c} = ?`);
    const params = COLUMNS.filter((c) => c !== "notice_id").map((c) => row[c]);
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

/** 关闭/撤回时撤下投影：只删本投影写入的那一行（按 id，避免误伤爬虫行）。
 *  v2 语义是**删行**（v1 withdraw 只置 closed 保留行），故必须同步销账 rfq_guard——
 *  守护对账把「登记在册但主行不存在」视为护栏失效信号，不销账会误报。 */
export async function removeProjection(db: Pool, noticePk: number | null): Promise<void> {
  if (!noticePk) return;
  await db.query(
    "DELETE FROM bid_notices WHERE id = ? AND entry_source = 'platform' AND notice_type = 'RFQ'",
    [noticePk],
  );
  await db.query("DELETE FROM rfq_guard WHERE rfq_id = ?", [noticePk]);
}
