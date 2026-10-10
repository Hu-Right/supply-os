/**
 * 从主表码文本派生桥表新行（纯函数，无 DB 依赖）
 * Bridge-row derivation from main-table code text (pure functions)
 *
 * @module lib/services/unspsc/bridge-derive
 * @description 商机桥表 crm_bid_opportunity_unspsc_codes 的原始灌数路径（爬虫程序直写主库）已于
 *              2026-09-22 断掉，仓库内不存在任何写入方；本模块把「按主表能拿到的码补出桥表行」
 *              定义为纯函数，供 unspsc/opp-bridge 在同步链路里调用，运维脚本复用同一份实现
 *              —— 同一逻辑禁止脚本与 src 各写一份（见 bridge-normalize 同注释的教训）。
 *
 *              取数现实：主表只有 product_code（单值主码）与 unspsc_codes（JSON，实测常存文字描述），
 *              派生出的行比原桥表（平均 8.5 码/商机）要少。类目筛选与行业墙只看 level1，
 *              因此「补主码」对这两条链路是准确的；原多码面貌不可复原，不做任何猜测性补码。
 *
 *              两条闸口与入库归一完全一致：
 *              1. **码不在旧字典 → 不写**（身份闸口，字典 id 与码切片会撞车，见 bridge-normalize 头注释）；
 *              2. **派生不出 level1 → 不写**（连行业墙比对的这一列都空，写了就是死角数据）。
 */
import {
  BRIDGE_PATH_COLUMNS,
  type BridgeNormalizePolicy,
  type BridgePathColumn,
  type UnspscDictIndex,
} from "./bridge-normalize";

/** UNSPSC 全码形态：8 位数字串（段/族/类在数据里均以尾部补零的 8 位出现） */
const FULL_CODE_RE = /\b\d{8}\b/g;

/**
 * 从若干段文本里抽出全部 8 位码并去重（保持首次出现顺序）。
 * 入参接受任意形态：字符串列、JSON 原文/对象/数组、null。
 */
export function extractFullCodes(...texts: unknown[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const raw = typeof text === "string" ? text : JSON.stringify(text ?? "");
    for (const hit of raw.match(FULL_CODE_RE) ?? []) found.add(hit);
  }
  return Array.from(found);
}

/** 派生出的一条桥表行（列值已按目标表口径成形，可直接入 INSERT） */
export interface DerivedBridgeRow {
  code: string;
  /** 旧字典节点 id，写入 code_id 列 */
  codeId: number;
  /** 该码在旧字典的层级，写入 level 列 */
  level: number;
  /** 五级路径列值，按 policy 决定是 number/string 与空值写法 */
  path: Record<BridgePathColumn, string | number | null>;
}

export interface DeriveResult {
  rows: DerivedBridgeRow[];
  /** 被闸口 1 挡掉的码数（不在旧字典） */
  skippedNotInDict: number;
  /** 被闸口 2 挡掉的码数（路径派生不出 / 无 level1） */
  skippedNoPath: number;
}

/**
 * 按「码 → 字典节点 → 父链」派生桥表行。
 * @param codes 已去重的候选码（来自 extractFullCodes）
 * @param dict  旧字典索引（unspsc/bridge-normalize.buildUnspscDictIndex）
 * @param policy 目标表口径（商机桥表 idKind=string、空值=空串）
 */
export function deriveBridgeRows(
  codes: readonly string[],
  dict: UnspscDictIndex,
  policy: BridgeNormalizePolicy,
): DeriveResult {
  const rows: DerivedBridgeRow[] = [];
  let skippedNotInDict = 0;
  let skippedNoPath = 0;

  for (const code of codes) {
    const ids = dict.idsForCode(code);
    if (ids.length === 0) {
      skippedNotInDict += 1;
      continue;
    }
    const codeId = ids[0]; // 孪生节点取最小 id，与入库归一的缺省起点一致
    const level = dict.levelOf(codeId);
    // rawValues 传空数组：新行没有已证实的节点，路径完全由 code 在字典里的位置决定
    const path = dict.resolvePath(code, []);
    if (level === null || !path || path[0] === null) {
      skippedNoPath += 1;
      continue;
    }

    const shaped = Object.fromEntries(
      BRIDGE_PATH_COLUMNS.map((col, i) => {
        const value = path[i];
        if (value === null || value === undefined) return [col, policy.emptyValue];
        return [col, policy.idKind === "string" ? String(value) : value];
      }),
    ) as Record<BridgePathColumn, string | number | null>;

    rows.push({ code, codeId, level, path: shaped });
  }

  return { rows, skippedNotInDict, skippedNoPath };
}
