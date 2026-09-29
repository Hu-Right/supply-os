/**
 * 106: 权益目录 sort_order 重编号为全局唯一（影子表切换的前置解耦步骤）
 * benefit-catalog-sort-order-unique
 *
 * @description 影子表终态只有 6 列，矩阵行序无法再靠 `ORDER BY group_code, sort_order` 两级排，
 *              只能 `ORDER BY sort_order` —— 而现网 sort_order 是"组内把手"，跨组重复
 *              （60 与 130 各两行）。若代码先改成单列排序，官网行序会立刻变。
 *              本迁移先把 sort_order 重编为全局唯一，使两种写法逐行同序，
 *              从而让"代码发布"与"表切换"彻底解耦（方案 §1.2 / §5）。
 *
 *              编号用公式而非硬编码清单：
 *                ROW_NUMBER() OVER (ORDER BY group_code, sort_order, benefit_code) * 10
 *              数学上保证「新 sort_order 序 ≡ 旧 (group_code, sort_order) 序」，
 *              与行数、新增行都无关，不会因映射表过期而静默改官网顺序。
 *              步长 10 给插队留空间；序号本身不含业务语义（矩阵行序权威是 crm_plan_benefits）。
 *
 *              幂等：仅当现值 ≠ 目标值才 UPDATE；已是终态时整段跳过。
 *              自检：写入后必须满足「唯一」+「两种 ORDER BY 逐行同序」，不符即抛错
 *                    （宁可不启动，也不让官网静默换行序）。
 *
 *              生产已执行记录见 scripts/out/benefit-catalog-renumber-apply.log；
 *              scripts/benefit-catalog-renumber-main.mjs 与本迁移共用同一公式。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

const SORT_SQL = `ROW_NUMBER() OVER (ORDER BY group_code, sort_order, benefit_code) * 10`;

async function renumber(dbPool: Pool): Promise<void> {
  const [target] = await dbPool.query<RowDataPacket[]>(
    `SELECT benefit_code, sort_order AS old_so, ${SORT_SQL} AS new_so FROM crm_benefit_catalog`,
  );

  const pending = target.filter((r) => Number(r.old_so) !== Number(r.new_so));
  if (pending.length === 0) {
    console.log("[migration 106] sort_order 已是全局唯一终态，跳过");
    return;
  }

  for (const r of pending) {
    const [res] = await dbPool.execute("UPDATE crm_benefit_catalog SET sort_order = ? WHERE benefit_code = ?", [
      Number(r.new_so),
      r.benefit_code,
    ]);
    if ((res as { affectedRows: number }).affectedRows !== 1) {
      throw new Error(`[migration 106] UPDATE ${r.benefit_code} 期望影响 1 行，实际 ${(res as { affectedRows: number }).affectedRows} 行`);
    }
  }

  // ── 自检 1：目标值本身唯一 ──
  const values = target.map((r) => Number(r.new_so));
  if (new Set(values).size !== values.length) {
    throw new Error("[migration 106] 目标 sort_order 存在重复值，拒绝继续");
  }
  // ── 自检 2：落库值与目标一致（affectedRows 双校验） ──
  const [after] = await dbPool.query<RowDataPacket[]>(
    "SELECT benefit_code, sort_order FROM crm_benefit_catalog",
  );
  const mismatch = target.filter(
    (t) => Number(after.find((a) => a.benefit_code === t.benefit_code)?.sort_order) !== Number(t.new_so),
  );
  if (mismatch.length > 0) {
    throw new Error(`[migration 106] 回读不符 ${mismatch.length} 行：${mismatch.map((m) => m.benefit_code).join(",")}`);
  }
  // ── 自检 3：两种写法逐行同序（本迁移存在的全部理由） ──
  const [byGroup] = await dbPool.query<RowDataPacket[]>(
    "SELECT benefit_code FROM crm_benefit_catalog WHERE is_active = 1 ORDER BY group_code, sort_order, benefit_code",
  );
  const [bySort] = await dbPool.query<RowDataPacket[]>(
    "SELECT benefit_code FROM crm_benefit_catalog WHERE is_active = 1 ORDER BY sort_order, benefit_code",
  );
  const seqA = byGroup.map((r) => r.benefit_code).join(",");
  const seqB = bySort.map((r) => r.benefit_code).join(",");
  if (seqA !== seqB) {
    throw new Error(`[migration 106] 重编号后两种 ORDER BY 不同序，官网行序会被改动，拒绝生效：\n  (group,sort)=${seqA}\n  sort=${seqB}`);
  }
  console.log(`[migration 106] sort_order 重编号完成：改动 ${pending.length} 行，两种排序逐行同序 ✓`);
}

/** 供启动时 ensureProcurementSchema() 调用 */
export async function migrateBenefitCatalogSortOrder(dbPool: Pool): Promise<void> {
  await renumber(dbPool);
}

export const migration: Migration = {
  version: 106,
  name: "benefit-catalog-sort-order-unique",
  up: async (dbPool) => {
    await migrateBenefitCatalogSortOrder(dbPool);
  },
};
