/**
 * 品目大类（15 类）单一事实源 — 权益墙与商机筛选共用的顶层单位
 * Commodity Groups — single source of truth
 *
 * @module lib/services/commodity/groups
 * @description 大类是「UNSPSC 段前缀 → 业务大类」的映射，**不写入品目面树**
 *              （加一层会破「码长即层级」、污染白名单、被迫重排 15.8 万行顺排码）。
 *              硬约束：一段只属一类。段→类 1:1 由库内
 *              `crm_commodity_group_segments.uk_segment/uk_prefix` 与本模块的
 *              `validateCommodityGroups()` 双重保证。
 *              族/类/品目不在此映射：由 UNSPSC 码前缀自动落段，永远与树一致。
 *
 *              名称只存 name_zh（运维导出与人工对账用）；界面展示走 locale
 *              `commodityGroup."UGT-G-01"`（六语言），避免 DB 与 locale 双写。
 *
 *              依据：docs/superpowers/specs/2026-10-10-commodity-facet-15-groups-design.md §4
 *              注释里的公告量是 2026-10-10 实测（桥表并集去重），仅作 sort 的依据。
 */

/** 大类码前缀 */
export const COMMODITY_GROUP_CODE_PREFIX = "UGT-G-";

export interface CommodityGroupDef {
  code: string;
  nameZh: string;
  prefixes: readonly string[];
}

/** 定义顺序 = chip 展示顺序（按公告量降序固化，不随日量波动） */
const DEFS: readonly CommodityGroupDef[] = [
  { code: "UGT-G-13", nameZh: "公共行政与社会治理", prefixes: ["80", "83", "93", "94"] }, // 50,411
  { code: "UGT-G-11", nameZh: "建筑施工服务", prefixes: ["72"] }, // 49,096
  { code: "UGT-G-08", nameZh: "医疗健康与实验室", prefixes: ["41", "42", "51", "85"] }, // 48,694
  { code: "UGT-G-07", nameZh: "信息通信与办公设备", prefixes: ["43", "44", "45", "55"] }, // 40,798
  { code: "UGT-G-14", nameZh: "工程技术与教育信息服务", prefixes: ["81", "82", "86"] }, // 38,232
  { code: "UGT-G-05", nameZh: "结构构件与不动产", prefixes: ["30", "31", "95"] }, // 33,357
  { code: "UGT-G-03", nameZh: "装备与制造服务", prefixes: ["20", "21", "22", "23", "24", "27", "40", "47", "48", "73"] }, // 22,271
  { code: "UGT-G-01", nameZh: "农业与食品餐旅", prefixes: ["10", "50", "70", "90", "91"] }, // 22,089
  { code: "UGT-G-06", nameZh: "车辆与运输装备", prefixes: ["25"] }, // 16,396
  { code: "UGT-G-04", nameZh: "电气电子与家电", prefixes: ["26", "32", "39", "52"] }, // 15,832
  { code: "UGT-G-15", nameZh: "金融保险与商务服务", prefixes: ["64", "78", "84"] }, // 15,701
  { code: "UGT-G-10", nameZh: "轻工消费与文体", prefixes: ["49", "53", "54", "56", "60"] }, // 13,495
  { code: "UGT-G-12", nameZh: "环境环卫与设施维护", prefixes: ["76", "77"] }, // 11,356
  { code: "UGT-G-02", nameZh: "矿产与基础材料", prefixes: ["11", "12", "13", "14", "15", "71"] }, // 10,909
  { code: "UGT-G-09", nameZh: "国防执法与应急救援", prefixes: ["46", "57", "92"] }, // 10,036
];

export interface CommodityGroup extends CommodityGroupDef {
  /** 1 起，等于 DEFS 下标 + 1 */
  sort: number;
}

export const COMMODITY_GROUPS: readonly CommodityGroup[] = DEFS.map((d, i) => ({ ...d, sort: i + 1 }));

/** 全部段前缀（升序，58 项） */
export const COMMODITY_SEGMENT_PREFIXES: readonly string[] = COMMODITY_GROUPS.flatMap((g) => [...g.prefixes]).sort();

const GROUP_BY_PREFIX = new Map<string, string>();
for (const g of COMMODITY_GROUPS) {
  for (const p of g.prefixes) {
    // 重复挂载不在构造期 throw（会让整个应用起不来），由 validateCommodityGroups() 报告
    if (!GROUP_BY_PREFIX.has(p)) GROUP_BY_PREFIX.set(p, g.code);
  }
}

/** 段前缀（UNSPSC 2 位）→ 大类码；未知/非法返回 null，不做任何兜底 */
export function groupCodeOfUnspscPrefix(prefix: string | null | undefined): string | null {
  const p = String(prefix ?? "");
  return /^[0-9]{2}$/.test(p) ? GROUP_BY_PREFIX.get(p) ?? null : null;
}

/** 完整 UNSPSC 8 位码 → 大类码（取前 2 位落段） */
export function groupCodeOfUnspscCode(code: string | null | undefined): string | null {
  const c = String(code ?? "");
  return /^[0-9]{8}$/.test(c) ? groupCodeOfUnspscPrefix(c.slice(0, 2)) : null;
}

/** 是否为合法大类码 */
export function isCommodityGroupCode(value: unknown): value is string {
  return typeof value === "string" && COMMODITY_GROUPS.some((g) => g.code === value);
}

/**
 * 静态自检（CG1~CG4）。入参可注入破坏样本，默认检查本模块常量；返回违规清单，空即通过。
 * 纯函数、不碰数据库 ⇒ 可在无 MySQL 的 CI 里跑（quality-gate job 没有库）。
 */
export function validateCommodityGroups(groups: readonly CommodityGroupDef[] = COMMODITY_GROUPS): string[] {
  const problems: string[] = [];
  if (groups.length !== 15) problems.push(`CG1 大类数应为 15，实际 ${groups.length}`);

  const seen = new Map<string, string>();
  for (const g of groups) {
    if (!/^UGT-G-[0-9]{2}$/.test(g.code)) problems.push(`CG1 大类码形制非法：${g.code}`);
    if (!String(g.nameZh ?? "").trim()) problems.push(`CG4 ${g.code} 的 name_zh 为空`);
    for (const p of g.prefixes ?? []) {
      if (!/^[0-9]{2}$/.test(p)) {
        problems.push(`CG2 ${g.code} 段前缀形制非法：${p}`);
        continue;
      }
      const prev = seen.get(p);
      if (prev) problems.push(`CG3 段 ${p} 重复归属：${prev} vs ${g.code}`);
      else seen.set(p, g.code);
    }
  }

  // CG2 的「58 段全覆盖」需要品目面清单，属库内侧 ⇒ 静态只验自洽
  if (groups === COMMODITY_GROUPS && seen.size !== COMMODITY_SEGMENT_PREFIXES.length) {
    problems.push(`CG3 去重段数 ${seen.size} 与展开段数 ${COMMODITY_SEGMENT_PREFIXES.length} 不一致`);
  }
  return problems;
}
