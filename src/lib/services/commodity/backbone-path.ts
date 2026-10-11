/**
 * 骨架路径换算器 — 把公告身上的 UNSPSC 码换成品目骨架节点码（`UGT-B-…`）
 *
 * @module lib/services/commodity/backbone-path
 * @description 为什么要这么换：公告的码全是 8 位，但里面大量是"粗码"（后几位为 0，只说到类/族/段）。
 *              新树故意不给业务层（大类/中类/小类）挂 UNSPSC 编号，否则树的骨架又变成旧树的编号体系。
 *              所以翻译结果只能存到公告那一侧：每条公告算出它属于哪些骨架节点，节点码写进宽表列。
 *
 *              四条换算规则（按优先级）：
 *                1. 8 位码等于某个 L5 行的键 ⇒ 命中品目节点；
 *                2. 后两位是 00 且前 6 位等于某个 L4 行的键 ⇒ 命中子类节点（类级粗码）；
 *                3. 后四位是 00 ⇒ 用「族前缀 → 中类」映射命中中类。该映射由新树自己的祖先链推导，
 *                   族→中类唯一由门禁 BB3 断言，所以不需要额外字典；
 *                4. 后六位是 00 ⇒ 用「段前缀 → 大类」映射命中大类。映射源是 crm_commodity_group_segments
 *                   （我们自己的 32 类归属，不是旧树）。
 *              命中后连同**全部祖先码**一起输出：筛选时任意一层等值命中即可，运行期不做递归。
 *
 * @rules 换算口径只在这里实现一份；回填脚本与任何线上链路都调它，不允许出现第二份实现。
 * @limits 纯函数，不写库、不猜名、不兜底：换不出的码进 misses 交调用方处理（记账或拒写），
 *         绝不静默丢弃——静默丢会让公告在新树上"看起来不存在"。
 * @see scripts/ops/commodity-backbone-path-backfill.ts
 * @see scripts/gates/check-commodity-backbone.ts（BB8 断言覆盖率）
 */

/** 骨架节点行的最小字段集（够换算就行，不必载整行） */
export type BackboneRow = {
  code: string;
  parentCode: string;
  level: number;
  unspscPrefix: string | null;
};

/** 段前缀 → 大类节点码（来源 crm_commodity_group_segments 关联 backbone L1 行） */
export type GroupSegmentRow = { segmentPrefix: string; nodeCode: string };

/** 命中档位，供覆盖率报表用 */
export type BackboneTier = "品目级" | "类级" | "族级" | "段级";

export type BackboneMatch = { row: BackboneRow; tier: BackboneTier };

export type BackbonePathResult = {
  /** 去重排序后的节点码，含全部祖先 */
  codes: string[];
  /** 每个码命中的最深节点（不含祖先），供"最深落点"统计 */
  deepest: string[];
  /** 换不出归属的码 */
  misses: string[];
  /** 档位计数 */
  tiers: Record<BackboneTier, number>;
};

export type BackboneIndex = {
  /** 骨架行数（校验用） */
  size: number;
  /** 按节点码取行 */
  nodeOf(code: string): BackboneRow | null;
  /** 自身 + 全部祖先，浅→深 */
  ancestorsOf(code: string): BackboneRow[];
  /** 单个 UNSPSC 码 → 最深命中节点 */
  match(code: string): BackboneMatch | null;
  /** 一条公告的码集合 → 骨架节点码集合 */
  pathOf(codes: Iterable<string>): BackbonePathResult;
};

const EMPTY_TIERS = (): Record<BackboneTier, number> => ({ 品目级: 0, 类级: 0, 族级: 0, 段级: 0 });

/**
 * 构索引：一次载入全树，内存里建三张查找表（码键、族→中类、段→大类）。
 * 纯计算，不做任何校验以外的判断。
 */
export function buildBackboneIndex(rows: BackboneRow[], segments: GroupSegmentRow[]): BackboneIndex {
  const byCode = new Map<string, BackboneRow>();
  for (const r of rows) byCode.set(r.code, r);

  // 码键：L4 存 6 位类前缀、L5 存 8 位品目码；业务层无键不参与
  const byPrefix = new Map<string, BackboneRow>();
  for (const r of rows) if (r.unspscPrefix) byPrefix.set(r.unspscPrefix, r);

  const ancestorsOf = (code: string): BackboneRow[] => {
    const chain: BackboneRow[] = [];
    const seen = new Set<string>();
    let cur = byCode.get(code) ?? null;
    while (cur && !seen.has(cur.code)) {
      seen.add(cur.code);
      chain.push(cur);
      cur = cur.parentCode ? (byCode.get(cur.parentCode) ?? null) : null;
    }
    return chain.reverse(); // 浅→深
  };

  // 族前缀(4 位) → 中类：从该族的类行往上找 L2；出现两个不同中类视为数据冲突，直接抛错而不是选一个
  const famToL2 = new Map<string, string>();
  for (const r of rows) {
    if (r.level !== 4 || !r.unspscPrefix) continue;
    const fam = r.unspscPrefix.slice(0, 4);
    const l2 = ancestorsOf(r.code).find((x) => x.level === 2)?.code;
    if (!l2) continue;
    const prev = famToL2.get(fam);
    if (prev && prev !== l2) throw new Error(`族 ${fam} 的中类归属不唯一：${prev} vs ${l2}`);
    famToL2.set(fam, l2);
  }

  const segToL1 = new Map<string, string>();
  for (const s of segments) {
    const prev = segToL1.get(s.segmentPrefix);
    if (prev && prev !== s.nodeCode) throw new Error(`段 ${s.segmentPrefix} 的大类归属不唯一：${prev} vs ${s.nodeCode}`);
    segToL1.set(s.segmentPrefix, s.nodeCode);
  }

  const match = (code: string): BackboneMatch | null => {
    const cs = String(code ?? "").trim();
    if (!/^\d{8}$/.test(cs)) return null;
    const byFull = byPrefix.get(cs);
    if (byFull) return { row: byFull, tier: "品目级" };
    if (cs.endsWith("00")) {
      const byClass = byPrefix.get(cs.slice(0, 6));
      if (byClass) return { row: byClass, tier: "类级" };
    }
    if (cs.endsWith("0000")) {
      const l2 = famToL2.get(cs.slice(0, 4));
      if (l2) { const row = byCode.get(l2); if (row) return { row, tier: "族级" }; }
    }
    if (cs.endsWith("000000")) {
      const l1 = segToL1.get(cs.slice(0, 2));
      if (l1) { const row = byCode.get(l1); if (row) return { row, tier: "段级" }; }
    }
    // 尾零不在合法位置（如 10100500 的类段非零但后两位为零却查不到类），或前缀在树里没有对应行
    return null;
  };

  const pathOf = (codes: Iterable<string>): BackbonePathResult => {
    const set = new Set<string>();
    const deepest = new Set<string>();
    const misses: string[] = [];
    const tiers = EMPTY_TIERS();
    for (const raw of codes) {
      const hit = match(raw);
      if (!hit) { misses.push(String(raw)); continue; }
      tiers[hit.tier]++;
      deepest.add(hit.row.code);
      for (const a of ancestorsOf(hit.row.code)) set.add(a.code);
    }
    return {
      codes: [...set].sort(),
      deepest: [...deepest].sort(),
      misses,
      tiers,
    };
  };

  return { size: rows.length, nodeOf: (c) => byCode.get(c) ?? null, ancestorsOf, match, pathOf };
}

/**
 * 从库构索引：只读新树与自己的 32 类归属表，不回读 crm_commodity_nodes。
 * 树是 159,429 行量级，一次载入内存（回填要跑几十万条公告，逐条查库会把生产拖死）。
 */
export async function loadBackboneIndex(
  query: <T = Record<string, unknown>>(sql: string) => Promise<T[]>,
): Promise<BackboneIndex> {
  const rows = await query<{ code: string; parent_code: string; level: number; unspsc_prefix: string | null }>(
    `SELECT code, parent_code, level, unspsc_prefix FROM crm_commodity_backbone WHERE status = 1`,
  );
  const segs = await query<{ seg: string; node_code: string }>(
    `SELECT s.unspsc_prefix seg, b.code node_code
       FROM crm_commodity_group_segments s
       JOIN crm_commodity_backbone b ON b.level = 1 AND b.group_code = s.group_code AND b.status = 1`,
  );
  return buildBackboneIndex(
    rows.map((r) => ({ code: r.code, parentCode: r.parent_code, level: Number(r.level), unspscPrefix: r.unspsc_prefix })),
    segs.map((s) => ({ segmentPrefix: String(s.seg).slice(0, 2), nodeCode: s.node_code })),
  );
}

/** 节点码拼接成列值：ASCII 逗号分隔，无空格；空集返回空串（调用方据此写 NULL） */
export function toBackbonePathColumn(codes: string[]): string {
  return codes.join(",");
}

/**
 * 列宽上限：MEDIUMTEXT 容量 16,777,215 字节。
 * 2026-10-11 全库实测（祖先全存）：p50 19 / p99 285 / p99.99 17,982 / 最大 87,498 字符，
 * 内容只有 ASCII ⇒ 1 字符 = 1 字节。取 1,000,000 留 11 倍余量，应用层拒写永远先于静默截断。
 */
export const BACKBONE_PATH_LIMIT = 1_000_000;

/** 超上限直接抛，绝不截断：截断等于把公告的归属悄悄改掉 */
export function assertBackbonePathLength(value: string, noticeId: string | number): string {
  if (value.length > BACKBONE_PATH_LIMIT) {
    throw new Error(`骨架路径超长：公告 ${noticeId} ${value.length} 字符 > ${BACKBONE_PATH_LIMIT}`);
  }
  return value;
}
