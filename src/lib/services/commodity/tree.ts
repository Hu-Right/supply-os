/**
 * 品目骨架树读层 — 五级级联选项与旧偏好路径换算
 * Commodity Backbone Tree Read Layer — five-level cascade options & legacy path resolution
 *
 * @module lib/services/commodity/tree
 * @description 商机页五级下拉的取数口：大类(L1) → 中类(L2) → 小类(L3) → 子类(L4) → 品目(L5)，
 *              全部读 `crm_commodity_backbone`（一张表，实测 159,429 行，门禁 BB1~BB7 守着）。
 *              本层不再读 `crm_commodity_nodes`（旧树）——公告归属已由
 *              `lib/services/commodity/backbone-path` 换算进宽表 `backbone_path`。
 *
 *              四条形制规则（2026-10-11 实测，temp/probe64）：
 *              1. **筛选键就是节点码 `UGT-B-…`**（码长即层级：2/4/6/8/10 位）。公告侧
 *                 `crm_notice_search.backbone_path` 存的是同一套码（含全部祖先），两边同口径
 *                 ⇒ 选到哪一层就等值命中哪一层。旧的 UNSPSC 数字前缀不再当筛选键：
 *                 业务层（L1~L3）故意不存 UNSPSC 编号，拿段/族前缀落不到中类/小类这一层。
 *              2. **大类码不能由节点码切片推出**：32 个 L1 行里只有 5 个的码序号等于大类码序号
 *                 （`UGT-B-01` 的 `group_code` 是 `UGT-G-11`）⇒ 需要大类时必须按 `code` 点查 L1 行。
 *              3. 父节点定位走 `code`（`uk_code` 等值），子级走 `parent_code`（`idx_parent`），
 *                 都是索引等值；不写 `LEFT(code, n) = ?` —— 函数包裹会让索引失效。
 *              4. 名称缺失不编造：实测 L1~L3 的 `name_en` **全空**（32 / 212 / 1,175 行），
 *                 L4/L5 双语全量非空。本层只如实透传空串，展示侧按 nameZh → nameEn → key 兜底
 *                 （所以非中文界面这三层会落到中文名，补译名是独立工作，不在这里造）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { COMMODITY_GROUPS, isCommodityGroupCode } from "./groups";
import { BACKBONE_NODE_PREFIX, backboneNodeLevel, chainOfNode } from "./backbone-path";

/** 一条级联选项 */
export interface CommodityTreeOption {
  /** 筛选键 = 骨架节点码（UGT-B-…，码长即层级）；与公告侧 backbone_path 同口径 */
  key: string;
  /** 中文名（L1~L5 实测全量非空） */
  nameZh: string;
  /** 英文名（L1~L3 实测全空，L4/L5 非空；空串就交展示侧兜底） */
  nameEn: string;
}

/** 骨架节点码前缀（与 crm_commodity_backbone.code 形制一致，门禁 BB1 钉住「码长即层级」） */
export const COMMODITY_NODE_PREFIX = BACKBONE_NODE_PREFIX;

/**
 * 是否为合法骨架节点筛选键（`UGT-B-` + 2/4/6/8/10 位数字，奇数位一律不认）。
 * 形制判定不在这重写：全库只 `backbone-path` 一份（层级就藏在码长里，两处写就会分开错）。
 */
export function isCommodityNodeKey(value: unknown): value is string {
  return typeof value === "string" && backboneNodeLevel(value) > 0;
}

/** 节点码 → 层级（1~5）；非法键返回 0（调用方据此拒绝下钻，不猜层级） */
export function commodityNodeLevel(code: string): number {
  return backboneNodeLevel(code);
}

/**
 * 节点码 → 它的整条祖先链 [L1, L2, L3, L4, L5]（未选到的层为空串）。
 *
 * 为什么不需要查库：门禁 BB1 把「父码 = 自身码去掉末两位」钉成不变量，所以祖先就是它的更短前缀，
 * 逐两位截断即得。五级下拉的深链（`?commodity=UGT-B-010101`）靠它一次算出该点亮哪几层、
 * 各层该向哪个父节点要选项，不依赖接口往返。形制不符（奇数位、非数字、前缀不对）返回全空
 * ⇒ 宁可不点亮，也不拿一个错键去筛。
 *
 * 截断本身不在这重写：直接用 `backbone-path` 的 `chainOfNode`（浅→深紧凑数组），这里只补成
 * 五级定长形状。换算规则只能有一份实现 —— 两份就会分开错，而公告侧列值也按那一份算。
 */
export function commodityNodeChain(value: string | null | undefined): [string, string, string, string, string] {
  const chain = chainOfNode(value);
  const out: [string, string, string, string, string] = ["", "", "", "", ""];
  for (let i = 0; i < chain.length; i++) out[i] = chain[i];
  return out;
}

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

/**
 * 取某一大类所辖的中类（第二级）。
 * 大类界面仍由常量 + locale 渲染（chip 与下拉第一级同源同序同名），这里只是把
 * `UGT-G-xx` 翻译成骨架 L1 节点码再取子级 —— 翻译必须回表，因为 L1 码序号不等于大类码序号。
 */
export async function listL2OfGroup(pool: Pool, groupCode: string): Promise<CommodityTreeOption[]> {
  if (!COMMODITY_GROUPS.some((g) => g.code === groupCode)) return [];
  const [l1] = await pool.query(
    `SELECT code FROM crm_commodity_backbone WHERE level = 1 AND group_code = ? AND status = 1 LIMIT 1`,
    [groupCode],
  );
  const code = String((l1 as RowDataPacket[])[0]?.code ?? "");
  return code ? childrenOf(pool, code) : [];
}

/**
 * 取某个节点的下一级（中类→小类、小类→子类、子类→品目）。
 * 品目层（10 位）无下级；非法长度同样返回空，不给界面假选项。
 */
export async function listChildrenOfNode(pool: Pool, code: string): Promise<CommodityTreeOption[]> {
  return commodityNodeLevel(code) >= 5 ? [] : childrenOf(pool, code);
}

/**
 * 级联入口：parent 是大类码（UGT-G-xx）取所辖中类，是节点码（UGT-B-…）取下一级。
 */
export async function listCommodityTreeOptions(pool: Pool, parent: string): Promise<CommodityTreeOption[]> {
  const p = String(parent ?? "").trim();
  if (isCommodityGroupCode(p)) return listL2OfGroup(pool, p);
  if (isCommodityNodeKey(p)) return listChildrenOfNode(pool, p);
  return [];
}

/**
 * 节点码 → 所属大类码（外链只给 `?commodity=` 时点亮第一级用）。
 * 一条 `uk_code` 点查，不做批量：它只在深链落地时调一次。
 */
export async function resolveGroupCodeOfNode(pool: Pool, code: string): Promise<string | null> {
  const chain = commodityNodeChain(code);
  const l1 = chain[0];
  if (!l1) return null;
  const [rows] = await pool.query(
    `SELECT group_code FROM crm_commodity_backbone WHERE code = ? AND level = 1 LIMIT 1`,
    [l1],
  );
  const g = String((rows as RowDataPacket[])[0]?.group_code ?? "");
  return g || null;
}

/** 旧偏好路径换算结果：大类码 + 各级节点选项（options 可能为空，代表偏好落在映射不到的层） */
export interface ResolvedCommodityPath {
  groupCode: string | null;
  options: CommodityTreeOption[];
}

/**
 * 把账号行业偏好（旧字典 `crm_unspsc_codes` 的行 id）换算成骨架节点路径。
 *
 * 映射四条，全部只用新树自己的数据（不读旧树）：
 *   字典 level=2（段，8 位码后 6 位为 0）→ 大类 L1：经 `crm_commodity_group_segments`（我们自己的 32 类归属）
 *   字典 level=3（族，后 4 位为 0）  → 中类 L2：由该族的类行往上取，族→中类唯一由门禁 BB3 断言
 *   字典 level=4（类，后 2 位为 0）  → 子类 L4：`unspsc_prefix` = 前 6 位等值
 *   字典 level=5（品目）            → 品目 L5：`unspsc_prefix` = 8 位码等值
 * 字典 level=1 是 10 个字母容器（A..J），新分类里没有对应层 ⇒ 直接忽略，不做臆测映射。
 * 换不出节点的码不编造选项，交上层按缺口处理。
 */
export async function resolveUnspscIdsToCommodityPath(
  pool: Pool,
  ids: Array<number | null | undefined>,
): Promise<ResolvedCommodityPath> {
  const numeric = ids.map((v) => Number(v) || 0).filter((v) => v > 0);
  if (numeric.length === 0) return { groupCode: null, options: [] };
  const [rows] = await pool.query(
    `SELECT id, code, level FROM crm_unspsc_codes
      WHERE id IN (${numeric.map(() => "?").join(",")}) ORDER BY level`,
    numeric,
  );
  const options: CommodityTreeOption[] = [];
  let groupCode: string | null = null;
  for (const r of rows as RowDataPacket[]) {
    const lv = Number(r.level);
    const code = String(r.code ?? "");
    if (lv < 2 || lv > 5 || !/^\d{8}$/.test(code)) continue;
    let hit: RowDataPacket | undefined;
    if (lv === 5 || lv === 4) {
      // 品目：8 位码等值；类：字典存 8 位（后两位 00），树里 L4 的键是 6 位
      const want = lv === 5 ? code : code.slice(0, 6);
      const [found] = await pool.query(
        `SELECT code, name_zh, name_en FROM crm_commodity_backbone
          WHERE level = ? AND unspsc_prefix = ? AND status = 1 LIMIT 1`,
        [lv === 5 ? 5 : 4, want],
      );
      hit = (found as RowDataPacket[])[0];
    } else if (lv === 3) {
      // 族 → 中类：从该族的类行往上两级取；前缀 LIKE 走 uk_prefix 范围，命中行数 ≤ 该族的类数
      const [found] = await pool.query(
        `SELECT b2.code, b2.name_zh, b2.name_en
           FROM crm_commodity_backbone b4
           JOIN crm_commodity_backbone b3 ON b3.code = b4.parent_code
           JOIN crm_commodity_backbone b2 ON b2.code = b3.parent_code
          WHERE b4.level = 4 AND b4.status = 1 AND b4.unspsc_prefix LIKE ?
          ORDER BY b4.unspsc_prefix LIMIT 1`,
        [`${code.slice(0, 4)}%`],
      );
      hit = (found as RowDataPacket[])[0];
    } else {
      // 段 → 大类：经自己的 32 类归属表，不回读旧树
      const [found] = await pool.query(
        `SELECT b.code, b.name_zh, b.name_en, b.group_code
           FROM crm_commodity_group_segments s
           JOIN crm_commodity_backbone b ON b.level = 1 AND b.group_code = s.group_code AND b.status = 1
          WHERE LEFT(s.unspsc_prefix, 2) = ? LIMIT 1`,
        [code.slice(0, 2)],
      );
      hit = (found as RowDataPacket[])[0];
      if (hit) groupCode = String(hit.group_code ?? "") || groupCode;
    }
    if (!hit) continue;
    const opt = toOption(hit);
    if (!options.some((o) => o.key === opt.key)) options.push(opt);
  }
  return { groupCode, options };
}
