/**
 * 推荐召回层
 * Recommendation recall: interest-code → backbone-node SQL recall + deadline fallback
 *
 * @module server/services/recommend/recall
 * @description 2026-10-11 换口径两轮，都留了实测：
 *              【为什么不再用桥表旧谓词】`b.level{N}_id IN (字典行 id)` 拿公告祖先的字典行 id
 *              与兴趣码自己的字典行 id 做「同层相等」，字典里没有的码永远召不回（实测用户 6：
 *              旧谓词召回 0 条 → 整屏退化成按截止时间排序；用户 1：旧 699 条 vs 节点码 4,079 条）。
 *              【为什么不再用 backbone_path 上的 FIND_IN_SET】中间一版把谓词改成
 *              `FIND_IN_SET(?, ns.backbone_path)`（与检索侧同一列同一关系），口径对了但形状错了：
 *              对列值做函数永远用不到索引，EXPLAIN `type=ALL` 每次扫 677,629 行 ——
 *              实测候选召回 2.4s / 3.8s / 1.4s，完整主查询 5.2s / 9.8s（探针110/111）。
 *              现在读 crm_notice_backbone_nodes（那一列的行化镜像，2026-10-11 建表 + 全量回填
 *              1,508,793 行）：`cand.node IN (节点码…)` 走 idx_node 的 range，同一轮交错实测
 *              候选收窄 93ms / 50ms / 37ms（探针110）。
 *              换完以后的实况（探针117，直接调 recommendNotices 量真实端到端）：
 *              三个真实用户冷路径 1.9s / 7.2s / 2.4s —— 收窄已经不是瓶颈，瓶颈变成
 *              主查询对全部候选组（最多 8,843 组）每行都跑商机描述子查询 / GROUP_CONCAT /
 *              译文 JOIN，而 LIMIT 20 只留 20 行。拆成「先算分取 40 个 id、再只补给这 40 行
 *              重字段」实测 186ms / 690ms / 256ms，同轮单趟形状是 501ms / 2,984ms / 1,078ms
 *              （探针118）—— 那一步没在本次里做，见 ADR-0010 后续项。
 *              建表与读法决策见 docs/adr/0010-notice-backbone-nodes-inverted-table.md。
 *              三条纪律：
 *              1. L1 落点不进谓词（旧实现也只在 interest.level>=2 时拼条件）：祖先全存 ⇒
 *                 一个大类码就能匹配整个大类（temp/probe100 实测召回从 699 条变成 19,326 条）；
 *                 它仍然参与加权，与旧实现一致；
 *              2. 谓词按 rootNodes 压到最浅覆盖集：命中深层必然命中祖先 ⇒ 并集不变而 IN 列表
 *                 大幅下降（temp/probe102：四个真实用户命中数完全相等，耗时降 3~5 倍）；
 *              3. 打分侧不压：深层落点权重更高，压掉就是改排序信号。
 *                 另：读侧禁用 COUNT(DISTINCT 列) 数候选 —— 它会把优化器带上
 *                 「index for group-by (scanning)」选错索引（实测 9.3s vs 同语句 FORCE INDEX 3.2s，
 *                 探针108），计数改成 GROUP BY 子查询外面再数。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeDocumentRows } from "../../utils/normalize";
import { ACTIVE_NOTICE_WHERE, DEADLINE_SEC_EXPR } from "../../utils/notice-expired";
import { columns } from "../../utils/sql-columns";
// N7 收敛（2026-08-20）：normalizeNoticeType 直连 utils/notice-type 权威端口
import { normalizeNoticeType } from "../../utils/notice-type";
import { enrichAgencyI18n } from "../search-orchestrator/format";
import { getBackboneIndex } from "../commodity/backbone-cache";
import { backboneNodeLevel, effectivePrefixOf, rootNodes } from "../commodity/backbone-path";
import { NOTICE_NODES_TABLE } from "../search-sync/notice-nodes";

/** 一个兴趣码在骨架树上的落点（node = 最深落点节点码，precision = 该码有效位数） */
export interface RecallNode {
  node: string;
  /** 有效位数 2/4/6/8：深度档与「L4 命中」标注都按它算（与旧实现的 significantPrefix 长度口径一致） */
  precision: number;
  weighted: number;
}

export interface RecallClauses {
  /**
   * 挂在公告主表别名 n 上的候选 JOIN 片段（倒排表别名固定为 cand）。
   * 空串 = 没有任何可用落点，调用方走截止时间降级。
   * 为什么是 JOIN 而不是 WHERE 片段：行化之后「按节点码找公告」就是一次索引 range，
   * 把它放在 JOIN 上优化器才会先收窄候选集（实测计划 cand:range → n:eq_ref）；
   * 写成 `notice_id IN (子查询)` 会被当成半连接扫回主表，不划算。
   */
  join: string;
  /** JOIN 里 IN 列表的绑定参数（与 join 中的 ? 个数一致） */
  params: string[];
}

/** 一个兴趣码节点集（已按权重降序）+ 谓词 */
export interface RecallOutput {
  scoredNodes: RecallNode[];
  clauses: RecallClauses;
  interestTotal: number;
  /** 换不出落点的兴趣码（调用方负责报出来，不静默丢） */
  misses: string[];
}

/**
 * 解析兴趣码行，生成加权落点节点列表 + 召回 SQL 子句。
 * 需要骨架索引（码→节点码的唯一口径），因此是 async。
 */
export async function processInterestCodes(
  pool: Pool,
  interestRows: RowDataPacket[],
  depthFactor: Record<number, number>,
): Promise<RecallOutput> {
  const empty: RecallOutput = { scoredNodes: [], clauses: { join: "", params: [] }, interestTotal: 0, misses: [] };
  if (interestRows.length === 0) return empty;
  const index = await getBackboneIndex(pool);
  if (!index) {
    // 索引从未载入成功：不给“全量召回”也不猜，交给调用方走截止时间降级
    console.warn("[recommend] 骨架索引不可用，本轮不做兴趣码召回");
    return empty;
  }

  const byNode = new Map<string, RecallNode>();
  const landable: string[] = [];
  const misses: string[] = [];
  let interestTotal = 0;

  for (const row of interestRows) {
    const code = String(row.code ?? "").trim();
    if (!code) continue;
    const res = index.pathOf([code]);
    if (res.codes.length === 0) {
      misses.push(code);
      continue;
    }
    // pathOf 给的是「最深落点 + 全部祖先」，按码长取最深就是该码自己的落点
    let deepest = res.codes[0];
    for (const c of res.codes) if (backboneNodeLevel(c) > backboneNodeLevel(deepest)) deepest = c;
    landable.push(deepest);

    const decayed = Number(row.decayed_weight || 0);
    if (decayed <= 0) continue; // 零权重照常召回（与旧实现一致），但不进打分与归一分母
    interestTotal += decayed;
    const precision = (effectivePrefixOf(code) ?? "").length;
    const depth = Math.min(4, Math.max(1, precision / 2));
    const weighted = decayed * (depthFactor[depth] ?? 1.0);
    const prev = byNode.get(deepest);
    // 多条兴趣码落在同一个节点：只留最大权重一份（表达式不重复拼）
    if (!prev || weighted > prev.weighted) {
      byNode.set(deepest, { node: deepest, precision: Math.max(precision, prev?.precision ?? 0), weighted });
    }
  }

  const scoredNodes = [...byNode.values()].sort((a, b) => b.weighted - a.weighted || (a.node < b.node ? -1 : 1));
  // 谓词：只看 L2 以上的落点，并压到最浅覆盖集
  const params = rootNodes(landable.filter((n) => backboneNodeLevel(n) >= 2));
  const join = params.length === 0
    ? ""
    : `INNER JOIN ${NOTICE_NODES_TABLE} cand ON cand.notice_id = n.id AND cand.node IN (${params.map(() => "?").join(",")})`;
  return { scoredNodes, clauses: { join, params }, interestTotal, misses };
}

/**
 * 截止时间降级：无兴趣信号或召回为空时，按截止时间排序返回。
 * 列表译文仅从已有缓存读取（trJoin），不触发任何翻译请求。
 */
export async function deadlineFallback(
  pool: Pool, page: number, pageSize: number, offset: number,
  locale?: string,
): Promise<{ items: Array<Record<string, unknown>>; total: number; page: number; pageSize: number; fallback: string }> {
  const [cntRows] = await pool.query(`SELECT COUNT(*) AS total FROM crm_bid_notices n WHERE ${ACTIVE_NOTICE_WHERE}`);
  const cntRow = (cntRows as RowDataPacket[])[0];
  const trJoin = locale ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?" : "";
  const trParams = locale ? [locale] : [];
  const treJoin = "LEFT JOIN crm_notice_translations tre ON tre.notice_id = n.id AND tre.lang = 'en'";
  const oppSubPrefix = "(SELECT opp.";
  const oppSubWhere = " FROM crm_bid_opportunities opp WHERE opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1) LIMIT 1)";
  const descCnSub = `${oppSubPrefix}description_cn${oppSubWhere} AS description_cn`;
  const descSub = `LEFT(${oppSubPrefix}description${oppSubWhere}, 300) AS description`;
  const descTruncSub = `CASE WHEN LENGTH(${oppSubPrefix}description${oppSubWhere}) > 300 THEN 1 ELSE 0 END AS description_truncated`;
  const bidOverviewSub = `${oppSubPrefix}bid_overview${oppSubWhere} AS bid_overview`;
  const beneficiarySub = `${oppSubPrefix}beneficiary_countries${oppSubWhere} AS beneficiary_countries`;
  // 列清单由 columns() 拼（分隔符单一出处）；条件列不启用传 falsy，不留空尾逗号的坑。
  const selectList = columns(
    "DISTINCT n.id, n.notice_id, n.reference, n.title, n.notice_type, n.country",
    "n.deadline, n.deadline_ts, n.deadline_sec, n.estimated_value, n.agency, n.is_featured",
    descSub,
    descTruncSub,
    "n.documents, n.procurement_files",
    locale && "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n",
    "tre.title_tr AS title_en, tre.description_tr AS description_en",
    descCnSub,
    bidOverviewSub,
    beneficiarySub,
  );
  const [fallbackRows] = await pool.query(
    `SELECT ${selectList}
     FROM crm_bid_notices n ${trJoin} ${treJoin} WHERE ${ACTIVE_NOTICE_WHERE} ORDER BY ${DEADLINE_SEC_EXPR} DESC LIMIT ? OFFSET ?`, [...trParams, pageSize, offset]);
  const fallbackItems = (fallbackRows as RowDataPacket[]).map(row => ({
    // Suministros BUG 修复：同推荐主查询，notice_type 归一化对齐宽表口径
    ...row, notice_type: normalizeNoticeType(row.notice_type),
    match_score: 0, reco_score: 0, organization: null, source_url: null,
    unspsc_codes: [], core_locked: true,
    breakdown_file_count: normalizeDocumentRows(row.documents, row.procurement_files).length,
    documents: undefined, procurement_files: undefined,
  }));
  // 买家名与搜索主管道同口径（2026-10-12）：兜底路径同样补机构翻译
  if (locale) enrichAgencyI18n(fallbackItems, locale);

  // 列表译文仅从已有缓存读取（trJoin），不触发任何翻译请求。
  // 译文生产统一收敛到定时任务（auto.ts）与详情页按需翻译两条路径。

  return {
    items: fallbackItems,
    total: Number((cntRow as RowDataPacket).total), page, pageSize, fallback: "deadline",
  };
}
