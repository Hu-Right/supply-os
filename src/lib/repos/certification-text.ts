/**
 * 证书文本的单一读取口径（2026-11-19 起）
 *
 * @module lib/repos/certification-text
 * @description 「认证资质」的唯一事实源是 `enterprise_capability_items`（capability_type='certification'）。
 *              历史列 `supplier.certification`（varchar(500) 逗号文本）已停写：迁移 057 把存量
 *              28 行拆成能力项，编辑表单不再接收该字段，代码也不再读它。
 *
 *              本片段把能力项聚合成与旧列同名的 `certification` 别名，让门户卡片、AI 画像等
 *              上层读侧不必改字段名，也不会再出现「两套证书口径」。
 *              走 idx_cap_enterprise_type(enterprise_id, capability_type)，单行一次索引查；
 *              supplier 列表页每页 20 行，代价可忽略（能力项表当前仅数十行）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
/**
 * 批量把证书文本装配到 supplier 行上（键 `certification`，与旧列同名，读侧上层不用改）。
 * 一次 GROUP BY 查询覆盖整页，避免逐行相关子查询；表内只有数十行，代价可忽略。
 */
export async function attachCertificationText<T extends object>(
  pool: Pool,
  rows: T[],
  idKey: "id" | "supplier_id" = "id",
): Promise<T[]> {
  const idOf = (row: T): number => Number((row as Record<string, unknown>)[idKey] ?? 0);
  const ids = Array.from(new Set(rows.map(idOf).filter((id) => id > 0)));
  const map = new Map<number, string>();
  if (ids.length > 0) {
    const [agg] = await pool.query<RowDataPacket[]>(
      `SELECT enterprise_id,
              GROUP_CONCAT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(value_json, '$.code')), name)
                           ORDER BY id SEPARATOR ',') AS certification
         FROM enterprise_capability_items
        WHERE capability_type = 'certification' AND enterprise_id IN (?)
        GROUP BY enterprise_id`,
      [ids],
    );
    for (const row of agg) {
      const text = String(row.certification ?? "").trim();
      if (text) map.set(Number(row.enterprise_id), text);
    }
  }
  for (const row of rows) {
    (row as Record<string, unknown>).certification = map.get(idOf(row)) ?? null;
  }
  return rows;
}

/**
 * 读某企业的证书展示名（code 优先，回退 name），按登记顺序去重。
 * 企业信息页「认证资质」只读聚合与门户/AI 的 certification 文本同源。
 */
export async function listCertificationNames(pool: Pool, enterpriseId: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(value_json, '$.code')), name) AS label
       FROM enterprise_capability_items
      WHERE enterprise_id = ? AND capability_type = 'certification'
      ORDER BY id`,
    [enterpriseId],
  );
  const out: string[] = [];
  for (const row of rows) {
    const label = String(row.label ?? "").trim();
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}
