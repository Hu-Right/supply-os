/**
 * 供应商「所属行业」自报落库
 *
 * @module lib/services/industry/supplier-industry
 *
 * @description 设置页企业信息里用户自选的行业（UGT-I 行业树），与「主营品目」（UGT 骨架树）
 *              是两套独立分类，互不推导。
 *
 *              写入口径：
 *              - `supplier.industry_code`（单值主行业）= 用户选择，直接覆盖；
 *              - `supplier_industry_rel` 以 source='self_report' 落一条挂靠（唯一键
 *                (supplier_id, industry_code)，与管线已有同码行冲突时只提置信度、不改 source，
 *                避免把管线来源伪装成用户自报）；
 *              - 清空时只删 self_report 行；若主行业原本来自自报，则回落到剩余挂靠的第一条
 *                （管线的 layer1/ai-calibration），没有则置 NULL。
 *              - 不重置 info_review_status：行业与品目一样属于自报属性，不该把已审核主体打回
 *                未审核（否则一改行业就从供应商目录消失）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { isIndustryCode } from "@/shared/constants/industry-code";

export type SaveSupplierIndustryResult =
  | { ok: true; code: string | null }
  | { ok: false; reason: "invalid_code" | "not_found" };

export async function saveSupplierIndustrySelfReport(
  db: Pool,
  input: { supplierId: number; code: string | null },
): Promise<SaveSupplierIndustryResult> {
  const raw = String(input.code ?? "").trim();
  if (raw && !isIndustryCode(raw)) return { ok: false, reason: "invalid_code" };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [supplierRows] = await conn.query(
      "SELECT id, industry_code FROM supplier WHERE id = ? LIMIT 1",
      [input.supplierId],
    );
    const supplier = (supplierRows as Array<{ id: number; industry_code: string | null }>)[0];
    if (!supplier) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const current = String(supplier.industry_code ?? "").trim();

    if (raw) {
      const [nodeRows] = await conn.query(
        "SELECT code FROM industry_nodes WHERE code = ? AND status = 1 LIMIT 1",
        [raw],
      );
      if ((nodeRows as RowDataPacket[]).length === 0) {
        await conn.rollback();
        return { ok: false, reason: "invalid_code" };
      }
    }

    const [prevRows] = await conn.query(
      "SELECT industry_code FROM supplier_industry_rel WHERE supplier_id = ? AND source = 'self_report'",
      [input.supplierId],
    );
    const prevSelf = new Set((prevRows as Array<{ industry_code: string }>).map((r) => String(r.industry_code)));

    await conn.query(
      "DELETE FROM supplier_industry_rel WHERE supplier_id = ? AND source = 'self_report'",
      [input.supplierId],
    );

    if (raw) {
      await conn.query(
        `INSERT INTO supplier_industry_rel (supplier_id, industry_code, source, confidence, created_at)
         VALUES (?, ?, 'self_report', 1.000, NOW())
         ON DUPLICATE KEY UPDATE confidence = GREATEST(COALESCE(confidence, 0), 1.000)`,
        [input.supplierId, raw],
      );
      await conn.query("UPDATE supplier SET industry_code = ? WHERE id = ?", [raw, input.supplierId]);
    } else if (current && prevSelf.has(current)) {
      // 主行业原本来自自报，清空后回落到剩余挂靠（管线来源），没有则置空
      const [restRows] = await conn.query(
        "SELECT industry_code FROM supplier_industry_rel WHERE supplier_id = ? ORDER BY id ASC LIMIT 1",
        [input.supplierId],
      );
      const fallback = (restRows as Array<{ industry_code: string }>)[0]?.industry_code ?? null;
      await conn.query("UPDATE supplier SET industry_code = ? WHERE id = ?", [fallback, input.supplierId]);
    }

    await conn.commit();
    return { ok: true, code: raw || null };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}