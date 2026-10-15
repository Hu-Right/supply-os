/**
 * 供应商品目自报落点（source='self_report'）
 * Supplier self-reported commodity landing nodes
 *
 * @module lib/services/commodity/supplier-self-report
 * @description 归属人在企业信息编辑页勾选「主营产品（按品目树）」后，把选中的 UGT 节点码写成
 *              `crm_supplier_backbone_interests` 的 `source='self_report'` 行。这条落点的唯一消费方
 *              是 `ai-match` 粗筛（`SELECT supplier_id, code` → `getBackboneIndex().pathOf` 展开祖先），
 *              所以本服务只保证三件事，其余一律不做：
 *              1. 落点精准（宁缺毋滥）：只收形制合法（2~5 级）且**树里真实存在**的码；
 *                 换不出的丢弃并在返回值 `dropped` 点名，绝不写一条指向不存在节点的脏落点。
 *              2. 幂等替换：以「提交的集合」为准覆盖该供应商的 self_report 行（删未选 + ODKU 已选），
 *                 重复提交同一集合结果一致。
 *              3. 来源隔离：一切读写严格限定 `source='self_report'`，**绝不动**行为/历史来源行
 *                 （register/filter/unlock/ai_inferred 等）。
 *
 *              为什么不落祖先链、不填 level1_id..level5_id：祖先由码前缀纯切片唯一决定
 *              （BB1 不变量，消费端 pathOf 现算），存两份就是造第二个事实源；那五列是旧字典 id 空间
 *              的死列，供应商侧零读者（用户偏好侧同名五列已物理 DROP）。与 `commodity/interest.ts`
 *              「只存落点不存祖先链」是同一条纪律。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { commodityNodeLevel } from "./tree";

/** 自报来源标识：兴趣表 source 列的取值，也是本服务一切读写的隔离边界 */
export const SELF_REPORT_SOURCE = "self_report";
/**
 * 自报是权威口径，给一个稳定的高档权重供推荐排序（不做行为累加，LEAST 封顶用不上）。
 * 量级与既有行为来源（unlock 2.5 / subscribe 2.0）同档偏上，表达"用户亲口确认"。
 */
const SELF_REPORT_WEIGHT = 3.0;
/** 自报最高置信：由归属人点选确认，非推断 */
const SELF_REPORT_CONFIDENCE = 1.0;
/** 落点层级下限：L1 大类太粗（等于声称整个大类都能做），不允许只报大类 */
const MIN_LEVEL = 2;
/** 单个供应商自报上限：防止异常入参把兴趣表灌爆（编辑页人手挑不出这么多） */
const MAX_NODES = 50;

/** 一条自报落点（回填 chips 展示用；name 取兴趣表内已存的权威中文名） */
export interface SupplierSelfReportNode {
  code: string;
  nameZh: string;
}

/**
 * 归一入参：字符串 trim、形制判定（`commodityNodeLevel` 2~5 级）、去重、截上限。
 * 脏码 / L1 / 空一律剔除，不猜一个看起来合理的节点出来（形制判定复用 tree.ts 单一入口）。
 */
function normalizeCodes(input: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    const code = typeof raw === "string" ? raw.trim() : "";
    if (!code || seen.has(code)) continue;
    if (commodityNodeLevel(code) < MIN_LEVEL) continue;
    seen.add(code);
    if (seen.size >= MAX_NODES) break;
  }
  return [...seen];
}

/**
 * 一次点查骨架树，只回「真实存在且 status=1」的码（附权威 name_zh / level）。
 * 走 `code`（uk_code）等值 IN，不载整棵树——自报是低频小批量写入，不值得触发 15s 全树索引载入。
 */
async function resolveExisting(
  pool: Pool,
  codes: readonly string[],
): Promise<Map<string, { nameZh: string; level: number }>> {
  const out = new Map<string, { nameZh: string; level: number }>();
  if (codes.length === 0) return out;
  const [rows] = await pool.query(
    `SELECT code, name_zh, level FROM crm_commodity_backbone
      WHERE code IN (${codes.map(() => "?").join(",")}) AND status = 1`,
    [...codes],
  );
  for (const r of rows as RowDataPacket[]) {
    out.set(String(r.code ?? ""), { nameZh: String(r.name_zh ?? ""), level: Number(r.level) });
  }
  return out;
}

export interface SelfReportReplaceResult {
  /** 实际落库的码（形制合法且树里存在，去重后） */
  stored: string[];
  /** 形制合法但树里查无此码而被丢弃的码（不静默——交调用方打日志点名） */
  dropped: string[];
}

/**
 * 用给定节点码集合「替换」该供应商的 self_report 落点：删未选、ODKU 已选，幂等。
 * supplierId 非法（非正整数）直接返回空结果，不写库、不抛。
 */
export async function replaceSupplierSelfReport(
  pool: Pool,
  supplierId: number,
  nodeCodes: Iterable<unknown>,
): Promise<SelfReportReplaceResult> {
  const sid = Number(supplierId);
  if (!Number.isInteger(sid) || sid <= 0) return { stored: [], dropped: [] };

  const normalized = normalizeCodes(nodeCodes);
  const existing = await resolveExisting(pool, normalized);

  const stored: string[] = [];
  const dropped: string[] = [];
  for (const code of normalized) {
    if (existing.has(code)) stored.push(code);
    else dropped.push(code);
  }

  // 1) 删除不再自报的行（仅 self_report 来源）。空集合即「清空该供应商全部自报」。
  if (stored.length === 0) {
    await pool.query(
      `DELETE FROM crm_supplier_backbone_interests WHERE supplier_id = ? AND source = ?`,
      [sid, SELF_REPORT_SOURCE],
    );
    return { stored, dropped };
  }

  // 2) 保留集之外、且属于 self_report 的旧行删掉（不误伤其它来源）
  const inPlaceholders = stored.map(() => "?").join(",");
  await pool.query(
    `DELETE FROM crm_supplier_backbone_interests
      WHERE supplier_id = ? AND source = ? AND code NOT IN (${inPlaceholders})`,
    [sid, SELF_REPORT_SOURCE, ...stored],
  );

  // 3) ODKU 落库（唯一键 uk_supplier_code_source）：name 取树的权威中文名，非前端透传
  const valuesSql = stored.map(() => "(?, ?, ?, ?, ?, ?, ?, NOW(), NOW())").join(", ");
  const params: unknown[] = [];
  for (const code of stored) {
    const meta = existing.get(code)!;
    params.push(
      sid,
      code,
      meta.nameZh,
      meta.level,
      SELF_REPORT_SOURCE,
      SELF_REPORT_WEIGHT,
      SELF_REPORT_CONFIDENCE,
    );
  }
  await pool.query(
    `INSERT INTO crm_supplier_backbone_interests
       (supplier_id, code, name, level, source, weight, confidence, created_at, updated_at)
     VALUES ${valuesSql}
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), level = VALUES(level),
       weight = VALUES(weight), confidence = VALUES(confidence), updated_at = NOW()`,
    params,
  );

  return { stored, dropped };
}

/**
 * 读回某供应商当前的 self_report 落点（编辑页回填用）。只取 self_report 来源，按码序返回。
 * supplierId 非法返回空数组，不抛。
 */
export async function listSupplierSelfReport(
  pool: Pool,
  supplierId: number,
): Promise<SupplierSelfReportNode[]> {
  const sid = Number(supplierId);
  if (!Number.isInteger(sid) || sid <= 0) return [];
  const [rows] = await pool.query(
    `SELECT code, name FROM crm_supplier_backbone_interests
      WHERE supplier_id = ? AND source = ? AND code <> '' ORDER BY code`,
    [sid, SELF_REPORT_SOURCE],
  );
  return (rows as RowDataPacket[]).map((r) => ({
    code: String(r.code ?? ""),
    nameZh: String(r.name ?? ""),
  }));
}
