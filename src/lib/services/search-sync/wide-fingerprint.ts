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
import { WIDE_OPP_JOIN } from "./wide-row-builder";

/** 字段分隔符：ASCII 单元分隔符（0x1f），业务文本中不出现，避免拼接歧义 */
const SEP = "CHAR(31 USING utf8mb4)";

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
         AND ${WIDE_FP_EXPR} <> ns.sync_src_hash`,
      [win.lo, win.hi],
    );
    for (const r of rows as RowDataPacket[]) ids.push(Number(r.id));
  }
  return ids;
}
