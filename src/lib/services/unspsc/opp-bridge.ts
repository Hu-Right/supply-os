/**
 * 商机桥表补行（DB 层）：扫描「桥表零行」的商机 → 按主表码派生 → 幂等写入
 * Opportunity bridge backfill (DB layer)
 *
 * @module lib/services/unspsc/opp-bridge
 * @description 商机桥表 crm_bid_opportunity_unspsc_codes 曾是爬虫程序直写主库的表，
 *              2026-09-22 起该路径断掉（仓库内从未有过它的同步白名单，唯一写入器 bridge-sync
 *              的调用方 admin 路由也已于 2026-08-29 移除），此后新商机一律没有类目行：
 *              商机页类目筛选（opportunities.repo）与行业墙（industry-scope.opportunityInCategory）
 *              全部查不到数据。本模块把「补出这些行」做成同步链路里的一个常规步骤，
 *              派生口径全部委托纯函数 unspsc/bridge-derive，运维脚本复用本模块，不另写一份。
 *
 *              写入边界（为什么不会伤到既有数据）：
 *              - 只扫「桥表零行」的商机 → 既有 83,480 行不被读取也不被更新；
 *              - INSERT IGNORE + uk_opportunity_code(opportunity_id, code) → 重跑幂等，并发撞键静默跳过；
 *              - 列值口径由 BRIDGE_NORMALIZE_POLICIES 决定（本表 varchar 列 + 空串表示空，与公告桥表的 NULL 不同）。
 *
 *              ⚠️ 不猜码：主表没有码、或码不在旧字典的商机一律不写。这类商机在行业墙上是
 *              「无类目数据」，本模块不提供任何放行兜底——数据缺失要靠补码解决，不靠在读取侧降级掩盖。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  BRIDGE_NORMALIZE_POLICIES,
  BRIDGE_PATH_COLUMNS,
  type BridgePathColumn,
  type UnspscDictIndex,
} from "./bridge-normalize";
import { deriveBridgeRows, extractFullCodes } from "./bridge-derive";

/** 商机桥表表名（派生行的落库目标） */
export const OPP_BRIDGE_TABLE = "crm_bid_opportunity_unspsc_codes";

/** 一条待写入的桥表行（列名与表结构一一对应） */
export interface OppBridgeInsertRow {
  opportunity_id: number;
  code_id: number;
  code: string;
  name: string;
  level: number;
  level1_id: string;
  level2_id: string;
  level3_id: string;
  level4_id: string;
  level5_id: string;
}

export interface OppBridgePlan {
  rows: OppBridgeInsertRow[];
  stats: {
    /** 桥表零行的商机数 */
    scanned: number;
    /** 主表抽不出任何 8 位码的商机数 */
    no_code: number;
    /** 有码但一个都进不了计划的商机数 */
    uncovered: number;
    /** 被「码不在字典」闸口挡掉的码数 */
    code_not_in_dict: number;
    /** 被「派生不出 level1」闸口挡掉的码数 */
    path_unresolvable: number;
  };
}

/**
 * 生成补行计划（只读，不写库）。运维脚本 dry 模式与同步链路共用这一份口径。
 * @param dict 旧字典索引（与 crawler-sync 入库归一同一实例）
 * @param titles 字典节点 id → 中文标题，用于填本表独有的 name 列；缺省留空串
 */
export async function collectOppBridgePlan(
  pool: Pool,
  dict: UnspscDictIndex,
  titles?: Map<number, string>,
): Promise<OppBridgePlan> {
  const policy = BRIDGE_NORMALIZE_POLICIES[OPP_BRIDGE_TABLE];
  if (!policy) throw new Error(`未声明 ${OPP_BRIDGE_TABLE} 的归一口径，拒绝按猜测写入`);

  const [sources] = await pool.query<RowDataPacket[]>(
    `SELECT o.id, o.product_code, o.unspsc_codes
       FROM crm_bid_opportunities o
       WHERE NOT EXISTS (SELECT 1 FROM \`${OPP_BRIDGE_TABLE}\` c WHERE c.opportunity_id = o.id)`,
  );

  const rows: OppBridgeInsertRow[] = [];
  const stats = {
    scanned: sources.length,
    no_code: 0,
    uncovered: 0,
    code_not_in_dict: 0,
    path_unresolvable: 0,
  };

  for (const source of sources) {
    const codes = extractFullCodes(source.product_code, source.unspsc_codes);
    if (codes.length === 0) {
      stats.no_code += 1;
      continue;
    }
    const derived = deriveBridgeRows(codes, dict, policy);
    stats.code_not_in_dict += derived.skippedNotInDict;
    stats.path_unresolvable += derived.skippedNoPath;
    if (derived.rows.length === 0) {
      stats.uncovered += 1;
      continue;
    }
    for (const row of derived.rows) {
      rows.push({
        opportunity_id: Number(source.id),
        code_id: row.codeId,
        code: row.code,
        name: titles?.get(row.codeId) ?? "",
        level: row.level,
        ...(Object.fromEntries(BRIDGE_PATH_COLUMNS.map((col) => [col, row.path[col]])) as Record<BridgePathColumn, string>),
      });
    }
  }

  return { rows, stats };
}

/** 读旧字典的中文标题（本表独有的 name 列；字典约 1.3 万行，仅在确有补行计划时加载） */
export async function loadUnspscDictTitles(pool: Pool): Promise<Map<number, string>> {
  const [dictRows] = await pool.query<RowDataPacket[]>(
    "SELECT id, title_zh, title FROM crm_unspsc_codes ORDER BY id",
  );
  const titles = new Map<number, string>();
  for (const r of dictRows) titles.set(Number(r.id), String(r.title_zh || r.title || ""));
  return titles;
}

const INSERT_COLS = ["opportunity_id", "code_id", "code", "name", "level", ...BRIDGE_PATH_COLUMNS, "created_at", "updated_at"] as const;

/** MySQL DATETIME 字面量（与既有行同形态；本表 created_at 无 DEFAULT，不显式写就是 NULL，事后无法区分哪些是补行） */
function nowMysql(datetime: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${datetime.getFullYear()}-${pad(datetime.getMonth() + 1)}-${pad(datetime.getDate())} `
    + `${pad(datetime.getHours())}:${pad(datetime.getMinutes())}:${pad(datetime.getSeconds())}`;
}

/**
 * 批量写入补行（INSERT IGNORE，幂等）。
 * 同一批共用一个写入时刻 → created_at 既是审计痕迹，也是回滚的唯一抓手。
 * @returns 实际新增行数（撞 uk_opportunity_code 被忽略的不计入）
 */
export async function insertOppBridgeRows(pool: Pool, rows: readonly OppBridgeInsertRow[]): Promise<number> {
  const writtenAt = nowMysql(new Date());
  const CHUNK = 500;
  let affected = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) => INSERT_COLS.map((col) => {
      if (col === "created_at" || col === "updated_at") return writtenAt;
      const value = r[col];
      return col === "code_id" || col === "level" || col === "opportunity_id" ? Number(value) : String(value ?? "");
    }));
    const [result] = await pool.query(
      `INSERT IGNORE INTO \`${OPP_BRIDGE_TABLE}\` (${INSERT_COLS.map((c) => `\`${c}\``).join(", ")}) VALUES ?`,
      [batch],
    );
    affected += Number((result as unknown as { affectedRows: number }).affectedRows);
  }
  return affected;
}

export type OppBridgeSyncResult = OppBridgePlan["stats"] & {
  planned: number;
  inserted: number;
};

/**
 * 同步链路入口：扫缺口 → 派生 → 写入。无缺口时零额外开销（不发第二条查询）。
 * 由 search-sync/crawler-sync 在「爬虫库 → 主表」跑完后调用。
 */
export async function syncMissingOppBridge(pool: Pool, dict: UnspscDictIndex): Promise<OppBridgeSyncResult> {
  const plan = await collectOppBridgePlan(pool, dict);
  if (plan.rows.length === 0) return { ...plan.stats, planned: 0, inserted: 0 };

  const titles = await loadUnspscDictTitles(pool);
  for (const row of plan.rows) row.name = titles.get(row.code_id) ?? "";

  const inserted = await insertOppBridgeRows(pool, plan.rows);
  return { ...plan.stats, planned: plan.rows.length, inserted };
}
