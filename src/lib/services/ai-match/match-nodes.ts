/**
 * AI 匹配粗筛数据加载器（骨架节点码口径）
 * @module lib/services/ai-match/match-nodes
 * @description 两条只读查询为 pre-filter 准备层级匹配数据，两侧都归一到骨架节点码 `UGT-*`：
 *              公告侧 = 宽表 `crm_notice_search.backbone_path` 按主键点查（挂靠结果已在同步链路
 *              算好，运行期不再碰桥表）；
 *              供应商侧 = `crm_supplier_unspsc_interests.code`（兴趣表自带的 8 位码）交骨架索引
 *              换算成节点码集合。
 *
 *              2026-10-11 换口径（为什么不能用桥表旧键）：公告侧原本读桥表 `level1_id..level5_id`
 *              —— 那是旧字典 `crm_unspsc_codes` 的行 id 空间，而字典只镜像了 UNSPSC 的一部分
 *              （品目层 10,661 行 vs 骨架树 150,006 行）；供应商侧原本 INNER JOIN 字典再自 JOIN
 *              四级父链，只为把一条码摊成各级祖先 id。公告归属现在已由 backbone_path 表达，
 *              两套键并存就是分叉温床（与检索侧同一理由）。
 *
 *              为什么公告侧走宽表而不是继续读桥表：桥表按 `notice_id`（平台外部编号）存储，
 *              按它 JOIN 要中转一次主键，而那个编号实测有撞号（相似公告与行业墙都因此改成
 *              `ns.id` 主键点查）。实测代价（temp/probe95、probe95b 生产库）：桥表有码的公告
 *              353,878 条里，有 3 条在宽表根本没有行 —— 它们在检索里本来也不可见，
 *              粗筛与检索同一数据源才是自洽的（这 3 条退化为纯词项竞争）。
 *
 *              换算口径不在这里重写：码→节点码只走 `commodity/backbone-cache` 的同一份索引
 *              （内部调 `backbone-path.ts`，含祖先、含未命中清单）。索引首次载入实测 15.5s /
 *              常驻 70MB 左右，之后进程内缓存 60 分钟；916 个供应商 1,838 条码换算 7,061 个
 *              节点码只要 7ms，未命中 0 条。
 *              fail-safe：任一查询失败 / 索引不可用 / 无数据 → 空集合，粗筛整体退化为纯词项
 *              重叠，绝不打断 AI 匹配主流程（排序优化信号缺失不致命）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getBackboneIndex } from "../commodity/backbone-cache";
import { fromBackbonePathColumn } from "../commodity/backbone-path";
import type { PreFilterMatchData } from "./pre-filter";

/** 给不出数据时的出口：每次新建，不共享常量对象（下游一旦改写就把全局脏了） */
const emptyData = (): PreFilterMatchData => ({ noticeNodes: new Set(), supplierNodes: new Map() });

/** 一次查询把候选供应商的兴趣码取回来（兴趣表自带 8 位码，不需要回字典取键） */
async function loadInterestCodes(pool: Pool, supplierIds: number[]): Promise<Map<number, string[]>> {
  const placeholders = supplierIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT supplier_id, code
     FROM crm_supplier_unspsc_interests
     WHERE supplier_id IN (${placeholders}) AND code <> ''`,
    supplierIds,
  );
  const bySupplier = new Map<number, string[]>();
  for (const row of rows as RowDataPacket[]) {
    const sid = Number(row.supplier_id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    const code = String(row.code ?? "").trim();
    if (!code) continue; // 脏空值不送换算，也不给该供应商建空键
    const list = bySupplier.get(sid);
    if (list) list.push(code);
    else bySupplier.set(sid, [code]);
  }
  return bySupplier;
}

/**
 * 加载粗筛所需的骨架节点码数据。
 * @param noticeId 公告主表自增 id（宽表主键与它同号）
 * @param supplierIds 本轮参与粗筛的候选平台供应商 id（self 不参与粗筛，无需传入）
 */
export async function loadMatchNodeData(
  pool: Pool,
  noticeId: number,
  supplierIds: number[],
): Promise<PreFilterMatchData> {
  const validIds = supplierIds.filter((id) => Number.isFinite(id) && id > 0);
  if (validIds.length === 0) return emptyData();
  try {
    // 公告侧：宽表主键点查，列值拆只走 fromBackbonePathColumn（脏 token 进不了集合）
    const [noticeRows] = await pool.query(
      `SELECT backbone_path AS p FROM crm_notice_search WHERE id = ? LIMIT 1`,
      [noticeId],
    );
    const noticeNodes = new Set(fromBackbonePathColumn((noticeRows as RowDataPacket[])[0]?.p));
    // 公告无归属：所有供应商必然零档，不必再查兴趣表，更不值得为它载入整棵树
    if (noticeNodes.size === 0) return { noticeNodes, supplierNodes: new Map() };

    const bySupplier = await loadInterestCodes(pool, validIds);
    const index = await getBackboneIndex(pool);
    if (!index) {
      // 索引从未载入成功：供应商侧只能空着（退化纯词项），但公告侧照旧给出，不假装成功
      console.warn("[ai-match] 骨架索引不可用，本轮粗筛只按词项重叠排序");
      return { noticeNodes, supplierNodes: new Map() };
    }

    const supplierNodes = new Map<number, Set<string>>();
    const misses: string[] = [];
    for (const [sid, codes] of bySupplier) {
      const res = index.pathOf(codes);
      if (res.misses.length > 0) misses.push(...res.misses.map((m) => String(m)));
      if (res.codes.length === 0) continue; // 一条都没换出：不给该供应商建空键
      supplierNodes.set(sid, new Set(res.codes));
    }
    if (misses.length > 0) {
      // 换不出的码不静默丢：点名报出来（该供应商仍拿到已算出的那部分归属）
      console.warn(
        `[ai-match] ${misses.length} 个兴趣码在骨架树上换不出归属，样本 ${misses.slice(0, 3).join("、")}`,
      );
    }
    return { noticeNodes, supplierNodes };
  } catch (err) {
    console.warn("[ai-match] 粗筛节点码数据加载失败，退化为纯词项粗筛:", err instanceof Error ? err.message : err);
    return emptyData();
  }
}
