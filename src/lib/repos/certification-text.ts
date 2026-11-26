/**
 * 证书文本的单一读取口径（2026-11-26 起）
 *
 * @module lib/repos/certification-text
 * @description 「认证资质」的唯一事实源 = `supplier.certification_tags`（150 条认证字典的 code 数组）
 *              + `supplier.certification_meta`（validUntil / noExpiry）。
 *              历史列 `supplier.certification`（varchar(500) 逗号文本）已停写。
 *              本片段把 tags 聚合成与旧列同名的 `certification` 别名，让门户卡片、AI 画像等
 *              上层读侧不必改字段名，也不会再出现「两套证书口径」。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

/** JSON 数组列（tags）→ 去空字符串数组 */
function parseTags(raw: unknown): string[] {
  const arr = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter(Boolean);
}

/** code → 中文名（150 字典；一次查询，页面级复用） */
async function loadCertNameMap(pool: Pool): Promise<Map<string, string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT code, name FROM supplier_certifications WHERE is_active = 1 AND is_certificate = 1",
  );
  const map = new Map<string, string>();
  for (const r of rows as unknown as Array<{ code?: unknown; name?: unknown }>) {
    const code = String(r.code ?? "").trim();
    if (code) map.set(code.toUpperCase(), String(r.name ?? "").trim() || code);
  }
  return map;
}

/**
 * 批量把证书文本装配到 supplier 行上（键 `certification`，与旧列同名，读侧上层不用改）。
 * 两次查询覆盖整页：supplier.tags + 150 字典名，避免逐行相关子查询。
 */
export async function attachCertificationText<T extends object>(
  pool: Pool,
  rows: T[],
  idKey: "id" | "supplier_id" = "id",
): Promise<T[]> {
  const idOf = (row: T): number => Number((row as Record<string, unknown>)[idKey] ?? 0);
  const ids = Array.from(new Set(rows.map(idOf).filter((id) => id > 0)));
  const textById = new Map<number, string>();
  if (ids.length > 0) {
    const [supRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, certification_tags FROM supplier WHERE id IN (?)",
      [ids],
    );
    const nameMap = await loadCertNameMap(pool);
    for (const r of supRows as unknown as Array<{ id?: unknown; certification_tags?: unknown }>) {
      const tags = parseTags(r.certification_tags);
      if (tags.length === 0) continue;
      const text = tags.map((code) => nameMap.get(code.toUpperCase()) ?? code).join(",");
      if (text) textById.set(Number(r.id), text);
    }
  }
  for (const row of rows) {
    (row as Record<string, unknown>).certification = textById.get(idOf(row)) ?? null;
  }
  return rows;
}

/**
 * 读某企业的证书展示名（字典中文名优先，未收录 code 回退原码），按 tags 顺序去重。
 */
export async function listCertificationNames(pool: Pool, enterpriseId: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT certification_tags FROM supplier WHERE id = ? LIMIT 1",
    [enterpriseId],
  );
  const tags = parseTags((rows[0] as { certification_tags?: unknown } | undefined)?.certification_tags);
  if (tags.length === 0) return [];
  const nameMap = await loadCertNameMap(pool);
  const out: string[] = [];
  for (const code of tags) {
    const label = nameMap.get(code.toUpperCase()) ?? code;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}
