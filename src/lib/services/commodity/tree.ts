/**
 * 品目骨架树读层 — 五级级联选项与旧偏好路径换算
 * Commodity Backbone Tree Read Layer — five-level cascade options & legacy path resolution
 *
 * @module lib/services/commodity/tree
 * @description 商机页五级下拉的取数口：大类(L1) → 中类(L2) → 小类(L3) → 子类(L4) → 品目(L5)，
 *              全部读 `crm_commodity_backbone`（一张表，83,033 行，门禁 BB1~BB15 守着）。
 *              本层不再读 `crm_commodity_nodes`（旧树）——公告归属已由
 *              `lib/services/commodity/backbone-path` 换算进宽表 `backbone_path`。
 *
 *              四条形制规则（2026-10-11 实测，temp/probe64）：
 *              1. **筛选键就是节点码 `UGT-…`**（码长即层级：2/4/6/8/10 位）。公告侧
 *                 `crm_notice_search.backbone_path` 存的是同一套码（含全部祖先），两边同口径
 *                 ⇒ 选到哪一层就等值命中哪一层。
 *              2. **大类身份 = L1 树码本身**（2026-10-15 G 码退役）：旧的 UGT-G-xx 独立编号
 *                 随 G 码体系删除，任意节点的所属大类就是它祖先链的第一位（`l1CodeOfNode`，
 *                 BB1 把「父码 = 自身码去掉末两位」钉成不变量，纯切片、零查库）。
 *              3. 父节点定位走 `code`（`uk_code` 等值），子级走 `parent_code`（`idx_parent`），
 *                 都是索引等值；不写 `LEFT(code, n) = ?` —— 函数包裹会让索引失效。
 *              4. 名称缺失不编造：实测 L1~L3 的 `name_en` **全空**（32 / 212 / 1,175 行），
 *                 L4/L5 双语全量非空。本层只如实透传空串，展示侧按 nameZh → nameEn 兜底
 *                 （所以非中文界面这三层会落到中文名，补译名是独立工作，不在这里造）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { BACKBONE_NODE_PREFIX } from "./backbone-path";
// 码形制纯函数已下沉 shared/constants/commodity-code（唯一实现，2026-10 分层治理：
// features 客户端按红线 3 直引 shared，本模块只再导出，不得长出第二份判定）
import {
  isCommodityNodeKey,
  commodityNodeLevel,
  commodityNodeChain,
  l1CodeOfNode,
} from "@/shared/constants/commodity-code";

export { isCommodityNodeKey, commodityNodeLevel, commodityNodeChain, l1CodeOfNode };

/** 一条级联选项 */
export interface CommodityTreeOption {
  /** 筛选键 = 骨架节点码（UGT-…，码长即层级）；与公告侧 backbone_path 同口径 */
  key: string;
  /** 中文名（L1~L5 实测全量非空） */
  nameZh: string;
  /** 英文名（L1~L3 实测全空，L4/L5 非空；空串就交展示侧兜底） */
  nameEn: string;
}

/** 骨架节点码前缀（与 crm_commodity_backbone.code 形制一致；定义已下沉 shared，这里保留历史导出面） */
export const COMMODITY_NODE_PREFIX = BACKBONE_NODE_PREFIX;

function toOption(row: RowDataPacket): CommodityTreeOption {
  return {
    key: String(row.code ?? ""),
    nameZh: String(row.name_zh ?? ""),
    nameEn: String(row.name_en ?? ""),
  };
}

/** 取某个父节点码的全部子级：走 idx_parent 等值，按码序（=建树时的公告量序）返回 */
async function childrenOf(pool: Pool, parentCode: string): Promise<CommodityTreeOption[]> {
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en FROM crm_commodity_backbone
      WHERE parent_code = ? AND status = 1 ORDER BY code`,
    [parentCode],
  );
  return (rows as RowDataPacket[]).map(toOption);
}

/** 取某个节点的下一级（大类→中类、中类→小类、小类→子类、子类→品目）。
 *  品目层（10 位）无下级；非法长度同样返回空，不给界面假选项。 */
export async function listChildrenOfNode(pool: Pool, code: string): Promise<CommodityTreeOption[]> {
  return commodityNodeLevel(code) >= 5 ? [] : childrenOf(pool, code);
}

/**
 * 级联入口：parent 为空返回 32 个 L1 大类（下拉第一级），是节点码取下一级。
 * 大类行本身就是 L1 节点（key=UGT-xx），前端不再需要独立的大类常量。
 */
export async function listCommodityTreeOptions(pool: Pool, parent: string): Promise<CommodityTreeOption[]> {
  const p = String(parent ?? "").trim();
  if (!p) {
    const [rows] = await pool.query(
      `SELECT code, name_zh, name_en FROM crm_commodity_backbone
        WHERE level = 1 AND status = 1 ORDER BY code`,
    );
    return (rows as RowDataPacket[]).map(toOption);
  }
  if (isCommodityNodeKey(p)) return listChildrenOfNode(pool, p);
  return [];
}

/** 旧偏好路径换算结果：所属大类（L1 树码）+ 各级节点选项（options 可能为空，代表偏好落在树外） */
export interface ResolvedCommodityPath {
  l1Code: string | null;
  options: CommodityTreeOption[];
}

/**
 * 账号行业偏好（UGT 最深节点码）→ 骨架节点路径（各级名称 + 所在大类码）。
 *
 * 偏好表现在直接存 `commodity_code`（最深已选 UGT 节点码），祖先链由码长纯切片
 * （`commodityNodeChain`，BB1 不变量）得出，各级名称一条 `code IN` 点查补齐；
 * 大类码 = 链第一位（`l1CodeOfNode`），零额外查库。
 * 码非法或树里查无此码时返回空 options（调用方按缺口处理，不编造选项）。
 */
export async function resolveCommodityCodeToPath(
  pool: Pool,
  code: string | null | undefined,
): Promise<ResolvedCommodityPath> {
  const key = String(code ?? "").trim();
  if (!isCommodityNodeKey(key)) return { l1Code: null, options: [] };
  const chain = commodityNodeChain(key);
  const keys = chain.filter(Boolean);
  if (keys.length === 0) return { l1Code: null, options: [] };
  const [rows] = await pool.query(
    `SELECT code, name_zh, name_en FROM crm_commodity_backbone
      WHERE code IN (${keys.map(() => "?").join(",")}) AND status = 1`,
    keys,
  );
  const byCode = new Map<string, RowDataPacket>();
  for (const r of rows as RowDataPacket[]) byCode.set(String(r.code ?? ""), r);
  const options = keys
    .map((k) => byCode.get(k))
    .filter((r): r is RowDataPacket => Boolean(r))
    .map(toOption);
  return { l1Code: chain[0] || null, options };
}
