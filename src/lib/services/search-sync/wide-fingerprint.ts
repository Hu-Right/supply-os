/**
 * 宽表源指纹（Single-Writer 的收敛基础）
 * Wide Table Source Fingerprint
 *
 * @module server/services/search-sync/wide-fingerprint
 * @description 宽表历史上存在两个作者：buildWideRow（构建）与 5 段手写 UPDATE（对账修复），
 *              两者口径分叉后已实测产出 8,367 行「宽表描述=主表值、详情页=机会表值」的
 *              长期不一致（D4）。本模块把「宽表内容是否落后于输入」收敛为一个可比较的指纹：
 *
 *              1. 指纹与宽表内容取自**同一次 SELECT 快照**（WIDE_FP_EXPR 拼进
 *                 WIDE_SYNC_SELECT，由 buildWideRow 原样透传、upsertWideRows 一并写入），
 *                 因此宽表不需要任何 UPDATE —— 单一写入者保持绝对成立（I1）。
 *              2. 检测侧用同一表达式在 SQL 内实时计算并比较（比较下推给 DB，不把
 *                 46 万行指纹拉回 JS），只返回差异 id；修复一律委托 syncWideIds，
 *                 故重建后必然相等（可断言收敛）。
 *              3. 指纹只依赖输入、绝不读宽表自身列，避免自反馈。
 *
 *              编码选择：用 COUNT + SUM(CRC32(字段串)) 聚合而非 GROUP_CONCAT —— 后者受
 *              group_concat_max_len（默认 1024 字节）截断，超限后的内容变化指纹看不见。
 *              聚合顺序无关（宽表按 lang/level 归并成 Map，本就与行序无关）。
 *
 *              已知边界（不假装完备）：crm_agency_aliases 与 UNSPSC 字典树自身的变更不进入
 *              指纹（二者是全表级维度，且构建侧有 10 分钟缓存 TTL），需要刷新时走
 *              search-common/rebuild-trigger 的 requestIndexRebuild 全量重建。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { DESC_SOURCE_EXPR, WIDE_LIMITS } from "../../utils/notice-field-limits";
// 从叶子模块导入，不得从 wide-row-builder 导入（builder 已依赖本模块的 WIDE_FP_EXPR，会成环）
import { WIDE_OPP_JOIN } from "./wide-sync-sql";

/** 字段分隔符：ASCII 单元分隔符（0x1f），业务文本中不出现，避免拼接歧义 */
const SEP = "CHAR(31 USING utf8mb4)";

/** 指纹列名（宽表 crm_notice_search） */
export const WIDE_FP_COLUMN = "sync_src_hash";

let _fpColOk: boolean | null = null;
let _fpColExpires = 0;
const FP_COL_TTL = 5 * 60 * 1000;

/**
 * 指纹列是否已存在（5 分钟缓存）—— 所有读写该列的路径必须先问它。
 *
 * 为何必需：迁移 087 要在生产维护窗口才能执行（本表现阶段无法 ALGORITHM=INSTANT），
 * 而代码可能先/后于它部署。若直接 SELECT/写入不存在的列，宽表同步会每 5 秒报错
 * 并被外层 try/catch 吞成 warning —— 属于静默坏掉。因此列缺失时整体降级为
 * 「不选指纹、不写指纹、不做内容级对账」，行为回到本次重构前的状态（不会更差）。
 *
 * 探测失败（权限/网络抖动）一律按「缺失」处理：宁可降级，不行差。
 */
export async function isFingerprintColumn(pool: Pool): Promise<boolean> {
  if (_fpColOk !== null && Date.now() < _fpColExpires) return _fpColOk;
  let ok: boolean;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notice_search' AND COLUMN_NAME = ?`,
      [WIDE_FP_COLUMN],
    );
    ok = Number((rows as RowDataPacket[])[0]?.total || 0) > 0;
  } catch {
    ok = false;
  }
  if (!ok && _fpColOk !== false) {
    console.warn(
      `[wide-fingerprint] ${WIDE_FP_COLUMN} 列缺失（迁移 087 未执行）` +
      "→ 指纹写入与内容级对账自动降级关闭；加列后无需改代码，缓存过期即自动启用",
    );
  }
  _fpColOk = ok;
  _fpColExpires = Date.now() + FP_COL_TTL;
  return ok;
}

/** 仅供测试：清除列存在性缓存，保证用例互不污染 */
export function __resetFingerprintColumnCache(): void {
  _fpColOk = null;
  _fpColExpires = 0;
}

/**
 * 宽表源指纹 SQL 表达式（依赖别名 n = crm_bid_notices、opp = crm_bid_opportunities，
 * 与 WIDE_OPP_JOIN 同构）。全库唯一定义点：WIDE_SYNC_SELECT 与本文件的漂移检测都拼
 * 本常量，禁止再写第二份。
 */
export const WIDE_FP_EXPR = `MD5(CONCAT_WS(${SEP},
  IFNULL(LEFT(n.title, ${WIDE_LIMITS.title}), ''),
  IFNULL(LEFT(n.reference, ${WIDE_LIMITS.reference}), ''),
  IFNULL(LEFT(n.notice_id, ${WIDE_LIMITS.noticeId}), ''),
  IFNULL(n.country, ''),
  IFNULL(n.agency, ''),
  IFNULL(n.notice_type, ''),
  CAST(GREATEST(COALESCE(n.deadline_sec, 0), 0) AS CHAR),
  CAST(COALESCE(n.is_featured, 0) AS CHAR),
  CAST(COALESCE(n.estimated_value, 0) AS CHAR),
  IFNULL(CAST(n.published_date AS CHAR), ''),
  IFNULL(n.entry_source, 'crawl'),
  IFNULL(n.rfq_status, ''),
  CAST(IFNULL(CHAR_LENGTH(n.documents), 0) AS CHAR),
  CAST(IFNULL(CHAR_LENGTH(n.procurement_files), 0) AS CHAR),
  CAST(IFNULL(n.category_l1_id, 0) AS CHAR),
  CAST(IFNULL(n.category_l2_id, 0) AS CHAR),
  IFNULL(LEFT(${DESC_SOURCE_EXPR}, ${WIDE_LIMITS.description}), ''),
  IFNULL(LEFT(opp.description_cn, ${WIDE_LIMITS.descriptionCn}), ''),
  IFNULL(LEFT(opp.bid_overview, ${WIDE_LIMITS.bidOverview}), ''),
  IFNULL(LEFT(opp.beneficiary_countries, ${WIDE_LIMITS.beneficiary}), ''),
  IFNULL((SELECT CONCAT(COUNT(*), ':', IFNULL(SUM(CRC32(CONCAT_WS(${SEP},
            level1_id, level2_id, level3_id, level4_id, level5_id))), -1))
          FROM crm_bid_notice_unspsc_codes WHERE notice_id = n.notice_id), 'x'),
  IFNULL((SELECT CONCAT(COUNT(*), ':', IFNULL(SUM(CRC32(CONCAT_WS(${SEP},
            lang, IFNULL(model, ''), IFNULL(title_tr, ''), IFNULL(description_tr, '')))), -1))
          FROM crm_notice_translations WHERE notice_id = n.id), 'x'),
  IFNULL((SELECT CONCAT(COUNT(*), ':', IFNULL(SUM(CRC32(c.candidate_code)), -1))
          FROM crm_bid_opportunities o2
          JOIN crm_bid_opportunity_unspsc_candidates c
            ON c.opportunity_id = o2.id AND c.status = 'approved'
          WHERE o2.source_notice_id = n.notice_id), 'x')
))`;

/**
 * 单轮扫描切片行数（× FP_SLICES_PER_ROUND 为每轮上限）。
 * 取 20000 的依据（2026-09-20 本地镜像库实测，宽表 462,018 行）：
 *   指纹窗口计算 20000 行 ≈ 6.6s（≈0.33ms/行）→ 每轮 2 片 40000 行（≈13s），
 *   全表一轮 462018/40000 × 5min ≈ 58 分钟，满足「全表覆盖 ≤ 1 小时」目标。
 */
export const FP_SLICE_SIZE = 20000;
/** 每轮对账执行的切片数（全表覆盖周期 ≈ 宽表行数 / 每轮行数 × 对账间隔） */
export const FP_SLICES_PER_ROUND = 2;

/** 轮转游标（进程内；重启后从 0 重新清扫，成本上限为一个全表覆盖周期） */
let _fpCursor = 0;

/**
 * 检测「宽表内容落后于输入」的公告 id（只读，不修复 —— I1）。
 *
 * 为何先取窗口边界再比较：若把 LIMIT 直接挂在指纹谓词上，命中行不足时 MySQL 会一路
 * 扫到表尾（成本不封顶），且游标无法得知实际扫到哪里 → 与它批评过的「内容漂移对账
 * 只扫前 2000 id」是同一类窗口算法缺陷。先取窗口后，每轮扫描行数恒定为 FP_SLICE_SIZE。
 */
export async function detectWideFingerprintDrift(pool: Pool): Promise<number[]> {
  // 列缺失时不做内容级对账（降级），也不发任何查询
  if (!(await isFingerprintColumn(pool))) return [];
  const ids: number[] = [];
  for (let i = 0; i < FP_SLICES_PER_ROUND; i++) {
    // 1) 取本轮窗口边界（走宽表主键序，成本恒定）
    const [winRows] = await pool.query(
      `SELECT MIN(id) AS lo, MAX(id) AS hi
       FROM (SELECT id FROM crm_notice_search WHERE id > ? ORDER BY id LIMIT ${FP_SLICE_SIZE}) t`,
      [_fpCursor],
    );
    const win = (winRows as RowDataPacket[])[0];
    if (!win || win.lo == null) {
      // 已到表尾：游标归零，下一轮从头开始（全表周期扫描）
      _fpCursor = 0;
      break;
    }
    _fpCursor = Number(win.hi);

    // 2) 只在该窗口内比较指纹（比较下推给 DB，仅回传差异主键）
    const [rows] = await pool.query(
      `SELECT n.id
       FROM crm_bid_notices n
       ${WIDE_OPP_JOIN}
       INNER JOIN crm_notice_search ns ON ns.id = n.id
       WHERE ns.id BETWEEN ? AND ?
         AND ${WIDE_FP_EXPR} <> ns.${WIDE_FP_COLUMN}`,
      [win.lo, win.hi],
    );
    for (const r of rows as RowDataPacket[]) ids.push(Number(r.id));
  }
  return ids;
}
