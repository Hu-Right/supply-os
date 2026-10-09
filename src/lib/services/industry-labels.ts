/**
 * 供应商行业标签装配 — 把行业码翻成门户可展示的双语标签
 * Supplier Industry Label Assembly
 *
 * @module lib/services/industry-labels
 * @description 门户要消费行业面，缺的不是 SQL 而是「一次页面请求里把 N 家供应商的码
 *              换成 M 个节点名」这一步。这里把它收成一个纯读装配：
 *                - 主行业标签（`supplier.industry_code` → 节点中英文名）；
 *                - 标准口径路径（门类 / 大类 / 中类 …，详情与悬浮说明用）；
 *                - 多行业标签（`crm_supplier_industry_rel`，主码排第一，去重后截断）。
 *
 *              两条口径写死在此：
 *              1. **码查不到就不显示，绝不把 UGT-I-xxxx 透给用户**。孤儿码由
 *                 check:taxonomy 的 X2/X4 钉为 0，运行期真查不到只可能是中间态，
 *                 此时回落自由文本比展示半成品更可信。
 *              2. **祖先链靠码长推导**（见 industry-code），一次 IN 查询把
 *                 「本页所有码 + 它们的全部祖先」取回来，避免逐家供应商往返。
 */
import { industryAncestorCodes } from "./industry-code";
import type { IndustryNodeRepo } from "../repos/industry-node.repo";

/** 单个行业标签（双语名 + 码） */
export interface IndustryTag {
  code: string;
  nameZh: string;
  nameEn: string;
}

/** 一家供应商的行业面视图 */
export interface SupplierIndustryInfo {
  /** 主行业标签；无主码或码查不到 → null（调用方回落自由文本） */
  primary: IndustryTag | null;
  /** 标准口径路径名（门类 → 主码所在层），中英各一条 */
  pathZh: string[];
  pathEn: string[];
  /** 多行业标签（含主码，主码在前；上限见 MAX_TAGS） */
  tags: IndustryTag[];
}

/** 卡片上一行放得下的标签数；再多就是把版面让给装饰 */
const MAX_TAGS = 3;

type NodeRowLike = { code: string; name_zh: string | null; name_en: string | null };

function toTag(node: NodeRowLike): IndustryTag | null {
  const nameZh = String(node.name_zh ?? "").trim();
  const nameEn = String(node.name_en ?? "").trim();
  if (!nameZh && !nameEn) return null;
  return { code: node.code, nameZh: nameZh || nameEn, nameEn: nameEn || nameZh };
}

/**
 * 相邻同名折叠。ISIC 比国标粗：2026-10-09 实测有 568/2,060 行的 `name_en` 与父节点完全
 * 相同（如 0102 林业 = 父 01 均为 “Agriculture, forestry and fishing”），原样拼路径会得到
 * “Manufacturing > Manufacturing > …” 这种看着像坏掉的界面。只相邻重名才折叠，
 * 不同名的层一律保留；中文路径不受影响（国标各层名互不相同）。
 */
function collapseAdjacent(names: string[]): string[] {
  return names.filter((n, i) => n !== names[i - 1]);
}

/**
 * 批量装配：入参是本页供应商行（需要 id 与 industry_code），返回 id → 行业视图。
 * 没有任何一家有主码时只发一条 SQL（取 rel），全空则一条都不发。
 */
export async function loadSupplierIndustryInfo(
  repo: IndustryNodeRepo,
  rows: ReadonlyArray<{ id: number; industry_code?: string | null }>,
): Promise<Map<number, SupplierIndustryInfo>> {
  const out = new Map<number, SupplierIndustryInfo>();
  if (rows.length === 0) return out;

  const ids = rows.map((r) => Number(r.id)).filter((v) => Number.isInteger(v) && v > 0);
  const primaryBySupplier = new Map<number, string>();
  for (const r of rows) {
    const code = String(r.industry_code ?? "").trim();
    if (code) primaryBySupplier.set(Number(r.id), code);
  }

  const links = await repo.listLinksBySupplierIds(ids);
  const codesBySupplier = new Map<number, string[]>();
  for (const link of links) {
    const sid = Number(link.supplier_id);
    const list = codesBySupplier.get(sid) ?? [];
    if (!list.includes(link.industry_code)) list.push(link.industry_code);
    codesBySupplier.set(sid, list);
  }

  // 需要解析的码 = 主码 ∪ 挂靠码 ∪ 它们各自的祖先（祖先只为路径名服务）
  const needCodes = new Set<string>(primaryBySupplier.values());
  for (const list of codesBySupplier.values()) for (const c of list) needCodes.add(c);
  for (const c of [...needCodes]) for (const a of industryAncestorCodes(c)) needCodes.add(a);

  const nodes = await repo.findNodesByCodes([...needCodes]);
  const nodeByCode = new Map<string, NodeRowLike>();
  for (const n of nodes) nodeByCode.set(n.code, n);

  for (const id of ids) {
    const primaryCode = primaryBySupplier.get(id) ?? null;
    const primaryNode = primaryCode ? nodeByCode.get(primaryCode) : undefined;
    const primary = primaryNode ? toTag(primaryNode) : null;

    let pathZh: string[] = [];
    let pathEn: string[] = [];
    if (primaryCode && primary) {
      const chain = industryAncestorCodes(primaryCode);
      pathZh = collapseAdjacent(chain.map((c) => nodeByCode.get(c)?.name_zh || nodeByCode.get(c)?.name_en || "").filter(Boolean));
      pathEn = collapseAdjacent(chain.map((c) => nodeByCode.get(c)?.name_en || nodeByCode.get(c)?.name_zh || "").filter(Boolean));
    }

    // 主码在前，其余按挂靠表返回顺序补齐，最后按上限截断
    const orderedCodes: string[] = [];
    if (primaryCode) orderedCodes.push(primaryCode);
    for (const c of codesBySupplier.get(id) ?? []) if (!orderedCodes.includes(c)) orderedCodes.push(c);
    const tags: IndustryTag[] = [];
    for (const c of orderedCodes) {
      const tag = nodeByCode.get(c) ? toTag(nodeByCode.get(c)!) : null;
      if (tag) tags.push(tag);
      if (tags.length >= MAX_TAGS) break;
    }

    out.set(id, { primary, pathZh, pathEn, tags });
  }
  return out;
}
