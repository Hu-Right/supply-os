/**
 * 品目分类树读层 — 五级级联选项与旧偏好路径换算
 * Commodity Tree Read Layer — five-level cascade options & legacy path resolution
 *
 * @module lib/services/commodity/tree
 * @description 商机页五级下拉的取数口：大类 → 段 → 族 → 类 → 品目（`crm_commodity_nodes`）。
 *              层级规模（2026-10-11 实测生产库）：大类 32 / 段 58 / 族 559 / 类 8,004 /
 *              品目 150,006（+ 自研延伸层 80，属第六级，本读层不返回）。
 *
 *              三条不可违反的形制规则（依据见 path.ts 与本轮实测 temp/probe52、probe54）：
 *              1. **筛选键是 UNSPSC 数字前缀，不是 `UGT-C-*` 顺排码的尾巴**：实测 58/58 段
 *                 两者全部不同序（`UGT-C-01` 的 unspsc_code 是 10000000，`UGT-C-56` 是 93000000），
 *                 而宽表 code_path 的 token 抽样 200/200 全是 UNSPSC 前缀 ⇒ 用码尾巴当筛选值
 *                 会筛出完全不相干的一批公告。`code` 只作节点身份回显，不参与筛选。
 *              2. 父子关系用 `parent_code` 走（实测 150,006/150,006 与 UNSPSC 前缀完全自洽），
 *                 父节点定位用 `unspsc_code` 等值（前缀补零到 8 位），两者都命中索引；
 *                 不写 `LEFT(unspsc_code, n) = ?` —— 函数包裹会让 idx_unspsc 失效。
 *              3. 名称缺失不编造：品目层实测 63,422/150,006 无中文名（英文名 100% 全），
 *                 展示侧按 nameZh → nameEn → key 兜底，本层只如实透传空串。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { COMMODITY_GROUPS, groupCodeOfUnspscPrefix, isCommodityGroupCode } from "./groups";

/** 一条级联选项 */
export interface CommodityTreeOption {
  /** 筛选键：段/族/类/品目 = UNSPSC 数字前缀（2/4/6/8 位） */
  key: string;
  /** 树节点码（UGT-C-*），仅作身份与调试回显，不参与筛选 */
  code: string;
  /** 中文名（可能为空串） */
  nameZh: string;
  /** 英文名（实测全量非空） */
  nameEn: string;
}

/** 前缀长度 → 该前缀所在的层级（段 2 / 族 4 / 类 6 / 品目 8） */
const LEVEL_BY_PREFIX_LEN: Record<number, string> = {
  2: "segment",
  4: "family",
  6: "class",
  8: "commodity",
};

/** 前缀长度 → 子层级（品目层无子：延伸层是第六级，不在本读层暴露） */
const CHILD_LEVEL_BY_PREFIX_LEN: Record<number, string> = {
  2: "family",
  4: "class",
  6: "commodity",
};

/** 是否为合法品目筛选键（2/4/6/8 位数字 UNSPSC 前缀） */
export function isCommodityPathKey(value: unknown): value is string {
  const v = String(value ?? "");
  return /^\d{2}$/.test(v) || /^\d{4}$/.test(v) || /^\d{6}$/.test(v) || /^\d{8}$/.test(v);
}

/**
 * 筛选键 → 它的整条祖先链 [段, 族, 类, 品目]（未选到的层为空串）。
 *
 * 为什么不需要查库反推：键本身就是 UNSPSC 数字前缀，祖先就是它的更短前缀（两位一级，
 * 与写入端 unspscAncestorPrefixes 同一形制）。五级下拉的深层链接（`?commodity=721015`）
 * 靠它一次算出该点亮哪几层、各层该向哪个父节点要选项，不依赖任何接口往返。
 * 形制不符（奇数位、非数字、超长）返回全空 ⇒ 宁可不点亮，也不拿一个错键去筛。
 */
export function commodityPathChain(value: string | null | undefined): [string, string, string, string] {
  const v = String(value ?? "");
  const valid = isCommodityPathKey(v) ? v : "";
  const out: string[] = ["", "", "", ""];
  for (let len = 2; len <= 8; len += 2) {
    if (valid.length >= len) out[len / 2 - 1] = valid.slice(0, len);
  }
  return out as [string, string, string, string];
}

/** 前缀 → 该层节点的完整 8 位 unspsc_code（不足位补零） */
function unspscCodeOfPrefix(prefix: string): string {
  return prefix.padEnd(8, "0");
}

function toOption(row: RowDataPacket, keyLen: number): CommodityTreeOption {
  const unspsc = String(row.unspsc_code ?? "");
  return {
    key: unspsc.slice(0, keyLen),
    code: String(row.code ?? ""),
    nameZh: String(row.name_zh ?? ""),
    nameEn: String(row.name_en ?? ""),
  };
}

/**
 * 取某一大类所辖的段（第二级）。
 * 段前缀取自 COMMODITY_GROUPS 常量（CG5 门禁逐段比对库内归属，两者必须一致），
 * 名称按 unspsc_code 等值回库里取 ⇒ 代码只持有标准，不持有名称。
 */
export async function listSegmentsOfGroup(pool: Pool, groupCode: string): Promise<CommodityTreeOption[]> {
  const def = COMMODITY_GROUPS.find((g) => g.code === groupCode);
  if (!def) return [];
  const codes = def.prefixes.map(unspscCodeOfPrefix);
  const [rows] = await pool.query(
    `SELECT code, unspsc_code, name_zh, name_en
       FROM crm_commodity_nodes
      WHERE level = 'segment' AND status = 1 AND unspsc_code IN (${codes.map(() => "?").join(",")})
      ORDER BY unspsc_code`,
    codes,
  );
  return (rows as RowDataPacket[]).map((r) => toOption(r, 2));
}

/**
 * 取某个前缀的下一级选项（族 / 类 / 品目）。
 * 父节点用 unspsc_code 等值定位，子节点走 idx_parent ⇒ 两次索引命中，无函数包裹。
 */
export async function listChildrenOfPrefix(pool: Pool, prefix: string): Promise<CommodityTreeOption[]> {
  const parentLevel = LEVEL_BY_PREFIX_LEN[prefix.length];
  const childLevel = CHILD_LEVEL_BY_PREFIX_LEN[prefix.length];
  if (!parentLevel || !childLevel) return []; // 8 位（品目）无下级；非法长度同样空
  const [rows] = await pool.query(
    `SELECT ch.code, ch.unspsc_code, ch.name_zh, ch.name_en
       FROM crm_commodity_nodes p
       JOIN crm_commodity_nodes ch ON ch.parent_code = p.code AND ch.status = 1
      WHERE p.unspsc_code = ? AND p.level = ?
      ORDER BY ch.unspsc_code`,
    [unspscCodeOfPrefix(prefix), parentLevel],
  );
  const keyLen = prefix.length + 2;
  return (rows as RowDataPacket[]).map((r) => toOption(r, keyLen));
}

/**
 * 级联入口：parent 为大类的取段，为数字前缀的取下一级。
 * 大类层不经此口 —— 界面用常量 + locale 直接渲染，保证 chip 与下拉第一级同源同序同名。
 */
export async function listCommodityTreeOptions(pool: Pool, parent: string): Promise<CommodityTreeOption[]> {
  const p = String(parent ?? "").trim();
  if (isCommodityGroupCode(p)) return listSegmentsOfGroup(pool, p);
  if (isCommodityPathKey(p)) return listChildrenOfPrefix(pool, p);
  return [];
}

/** 旧偏好路径换算结果：大类码 + 各级前缀键（可能为空，代表偏好落在无法映射的层） */
export interface ResolvedCommodityPath {
  groupCode: string | null;
  options: CommodityTreeOption[];
}

/**
 * 把账号行业偏好（旧字典 `crm_unspsc_codes` 的 level1~3 行 id）换算成品目树路径。
 *
 * 为什么要换算：偏好存的是旧字典 id，而旧字典的 level=1 是 10 个字母容器（A..J），
 * 在新分类里根本没有对应层（新第一级是 32 个大类，一个容器横跨多个大类）。
 * 因此这里只认 level>=2 的行 —— 段/族/类的 8 位 code 去掉尾零就是新树的筛选键，
 * 大类由段前缀反查常量得到；level=1 直接忽略，不做「容器 → 大类」的臆测映射。
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
  const prefixes: string[] = [];
  const dictRows = (rows as RowDataPacket[]).filter((r) => Number(r.level) >= 2 && Number(r.level) <= 5);
  for (const r of dictRows) {
    const code = String(r.code ?? "");
    if (!/^\d{8}$/.test(code)) continue;
    prefixes.push(code.slice(0, (Number(r.level) - 1) * 2));
  }
  if (prefixes.length > 0) {
    // 名称回库里取（同一 8 位码在树里唯一）；字典有而树里没有的码不显示为选项，交上层按缺口处理
    const [nodes] = await pool.query(
      `SELECT code, unspsc_code, name_zh, name_en FROM crm_commodity_nodes
        WHERE status = 1 AND unspsc_code IN (${prefixes.map(() => "?").join(",")})`,
      prefixes.map(unspscCodeOfPrefix),
    );
    const byCode = new Map<string, RowDataPacket>(
      (nodes as RowDataPacket[]).map((n) => [String(n.unspsc_code), n]),
    );
    for (const prefix of prefixes) {
      const hit = byCode.get(unspscCodeOfPrefix(prefix));
      if (!hit) continue;
      options.push(toOption(hit, prefix.length));
    }
  }
  const firstSeg = prefixes.find((p) => p.length >= 2);
  return { groupCode: firstSeg ? groupCodeOfUnspscPrefix(firstSeg.slice(0, 2)) : null, options };
}
