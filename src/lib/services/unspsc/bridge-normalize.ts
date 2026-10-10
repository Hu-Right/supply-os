/**
 * UNSPSC 桥表入库路径归一（纯函数，无 DB 依赖）
 * UNSPSC bridge-table path normalization (pure functions)
 *
 * @module lib/services/unspsc/bridge-normalize
 * @description 爬虫库写入的 crm_bid_notice_unspsc_codes / crm_bid_opportunity_unspsc_codes，
 *              其 level1_id~level5_id 历史上同时存在三种形态：
 *              1. 空值两套写法——NULL（应用侧写入器）与 0 / 空串（爬虫）；
 *              2. 值本身两套口径——旧字典 crm_unspsc_codes.id（消费点实际比对的那套）
 *                 与 8 位码前缀（如 43 / 4322 / 432215 / 43221500）；
 *              3. 少量行指向字典里已不存在的悬空 id。
 *              后果：按 levelN_id 等值筛选的类目筛选、推荐召回、行业墙、相似公告会漏掉这些行。
 *              本模块把「入库前归一」定义为纯函数，供 crawler-sync 在写目标库之前调用。
 *
 *              归一口径：**只补缺、只修坏，绝不动已可信的值**。
 *              - 可信 = 非空、可解析为数字、该数字在字典中存在、且其 level 恰为对应层级；
 *              - 不可信（0 / 空串 / 悬空 id / 层级错配 / 码前缀）替换为按字典父链派生的值，
 *                派生不出则按目标表的空值写法收敛（公告 NULL、商机空串）。
 *
 *              旧字典存在重复码（同码多节点的孪生节点，实测 17 个）：行内已挂哪个节点就
 *              从哪个节点上溯；只有 code 能定位到「同分支上更深」的节点时才下移起点去补更深的列，
 *              避免把本来有效的路径改写到孪生节点上。
 *
 *              最后一道闸：**code 不在旧字典时整行不动**。字典 id 与码前缀共用十进制数字空间，
 *              二者会撞车（实测 id=102510 是 level3 节点，与 10 位脏码 1025101500 的第 3 段切片
 *              同号同层）。若允许仅凭行内值派生，就会把脏码所在行改写到毫不相干的节点上。
 *              code 才是这一行的身份，身份不认识时宁可保留原值，绝不猜。
 */

/** 桥表五级路径列名（数组顺序即层级 1..5） */
export const BRIDGE_PATH_COLUMNS = [
  "level1_id",
  "level2_id",
  "level3_id",
  "level4_id",
  "level5_id",
] as const;

export type BridgePathColumn = (typeof BRIDGE_PATH_COLUMNS)[number];

/** 字典行的最小结构（crm_unspsc_codes 的 id/code/level/parent_id） */
export interface UnspscDictRow {
  id: number | string;
  code: string;
  level: number | string;
  parent_id?: number | string | null;
}

/** 归一目标口径：列值类型 + 空值写法 */
export interface BridgeNormalizePolicy {
  /** 写入值的类型：公告桥表为整型列，商机桥表为 varchar 列 */
  idKind: "number" | "string";
  /** 该表的空值写法：公告桥表 NULL，商机桥表空串（列 NOT NULL） */
  emptyValue: number | string | null;
}

/** 按表名声明归一口径；未在此表内的表不做归一 */
export const BRIDGE_NORMALIZE_POLICIES: Record<string, BridgeNormalizePolicy> = {
  crm_bid_notice_unspsc_codes: { idKind: "number", emptyValue: null },
  crm_bid_opportunity_unspsc_codes: { idKind: "string", emptyValue: "" },
};

/** 把列值解析成字典 id：空串 / null / undefined / 非数字 / 0 一律归为 null */
export function toDictIdOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
}

interface DictNode {
  id: number;
  level: number;
  parentId: number | null;
}

export interface UnspscDictIndex {
  /** 列值是否可信：非空、字典中存在、且自身 level 就是该列层级 */
  isTrustedValue(value: unknown, expectLevel: number): boolean;
  /** 沿 parent 链回溯五级路径（与 tree-cache.getPathFromCache 同口径） */
  tracePath(startId: number): Array<number | null>;
  /** 计算本行应有的五级路径；null 表示无法派生，调用方须原样保留该行 */
  resolvePath(code: unknown, rawValues: unknown[]): Array<number | null> | null;
}

/**
 * 用字典行建索引。
 * @param dictRows 必须按 id 升序传入：同码多节点（孪生节点）时首个（最小 id）作为缺省派生起点
 */
export function buildUnspscDictIndex(dictRows: UnspscDictRow[]): UnspscDictIndex {
  const byId = new Map<number, DictNode>();
  const codeToIds = new Map<string, number[]>();

  for (const row of dictRows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    byId.set(id, {
      id,
      level: Number(row.level),
      parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    });
    const code = String(row.code);
    const bucket = codeToIds.get(code);
    if (bucket) bucket.push(id);
    else codeToIds.set(code, [id]);
  }

  const tracePath = (startId: number): Array<number | null> => {
    const path: Array<number | null> = [null, null, null, null, null];
    let currentId: number | null = startId;
    // 上溯跳数上限 6：容纳字典里 level 6/7 的异常深层节点，防父链成环死循环
    for (let hop = 0; hop < 6 && currentId; hop += 1) {
      const node = byId.get(currentId);
      if (!node) break;
      if (node.level >= 1 && node.level <= 5) path[node.level - 1] = node.id;
      currentId = node.parentId;
    }
    return path;
  };

  const isTrustedValue = (value: unknown, expectLevel: number): boolean => {
    const num = toDictIdOrNull(value);
    if (num === null) return false;
    const node = byId.get(num);
    return !!node && node.level === expectLevel;
  };

  const resolvePath = (code: unknown, rawValues: unknown[]): Array<number | null> | null => {
    const candidates = codeToIds.get(String(code)) ?? [];
    // 身份闸口：code 在字典里查无此码 → 无权威可派生，整行原样返回
    // （此时行内值即便能按数字撞上某个字典 id 也不可信，理由见文件头注释）
    if (candidates.length === 0) return null;

    // 本行最深层可信节点：优先以它为起点，保住已被证实的分支
    let deepestLevel = 0;
    let deepestId: number | null = null;
    for (let i = BRIDGE_PATH_COLUMNS.length - 1; i >= 0; i -= 1) {
      if (isTrustedValue(rawValues[i], i + 1)) {
        deepestLevel = i + 1;
        deepestId = toDictIdOrNull(rawValues[i]);
        break;
      }
    }

    if (deepestId !== null) {
      const base = tracePath(deepestId);
      // code 若能定位到「更深且父链经过 deepestId」的节点，则下移起点，把更深的列也补齐
      for (const candidateId of candidates) {
        const node = byId.get(candidateId);
        if (!node || node.level <= deepestLevel) continue;
        const probe = tracePath(candidateId);
        if (probe[deepestLevel - 1] === deepestId) return probe;
      }
      return base;
    }

    // 第二道兜底（与顶部闸口语义重叠，但故意保留）：candidates 为空时 tracePath(undefined)
    // 会返回全 null 路径，下游会把它当成「该层级应为空」而清空五个列，属于毁数据。
    return candidates.length > 0 ? tracePath(candidates[0]) : null;
  };

  return { isTrustedValue, tracePath, resolvePath };
}

export interface BridgeNormalizeResult {
  /** false 表示整行无需改写 */
  changed: boolean;
  /** 需要覆盖写入的列（仅包含确需改动的列） */
  values: Partial<Record<BridgePathColumn, number | string | null>>;
}

/**
 * 归一单行桥表数据的五级路径列。
 * @param row 源行（须含 code 与五个 levelN_id 列）
 * @param dict 字典索引
 * @param policy 目标表口径（列值类型 + 空值写法）
 */
export function normalizeBridgePathRow(
  row: Record<string, unknown>,
  dict: UnspscDictIndex,
  policy: BridgeNormalizePolicy,
): BridgeNormalizeResult {
  const rawValues = BRIDGE_PATH_COLUMNS.map((col) => (col in row ? row[col] : null));
  const derived = dict.resolvePath(row.code, rawValues);
  if (!derived) return { changed: false, values: {} }; // 无法派生：整行原样保留

  const values: Partial<Record<BridgePathColumn, number | string | null>> = {};
  let changed = false;

  for (let i = 0; i < BRIDGE_PATH_COLUMNS.length; i += 1) {
    const col = BRIDGE_PATH_COLUMNS[i];
    if (dict.isTrustedValue(rawValues[i], i + 1)) continue; // 可信值一律不动

    const want = derived[i];
    const current = rawValues[i];
    if (want === null) {
      // 目标为空：已是规范空写法则不动，否则统一空表示（0 → NULL / "0" → 空串）
      if (current === null || current === undefined || current === "" || current === policy.emptyValue) continue;
      values[col] = policy.emptyValue;
      changed = true;
      continue;
    }
    values[col] = policy.idKind === "string" ? String(want) : want;
    changed = true;
  }

  return { changed, values };
}

/**
 * 供同步管道使用：需要改写时返回浅拷贝后的新行，否则原样返回（零拷贝）。
 */
export function applyBridgeNormalize(
  row: Record<string, unknown>,
  dict: UnspscDictIndex,
  policy: BridgeNormalizePolicy,
): Record<string, unknown> {
  const { changed, values } = normalizeBridgePathRow(row, dict, policy);
  return changed ? { ...row, ...values } : row;
}
