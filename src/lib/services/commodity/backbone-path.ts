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
 *                2. 有效位只剩 6 位（类级粗码）⇒ 前 6 位等值命中 L4 子类；
 *                3. 有效位只剩 4 位（族级粗码）⇒ 用「族前缀 → 最深可证实唯一节点」映射：该族在树里
 *                   只有一个子类就落 L4（族 ≡ 子类，是结构事实不是推断），多个子类同属一个小类就落
 *                   L3，再往上一层唯一才落 L2；跨中类属数据冲突，直接抛错。映射全部由新树自己的
 *                   祖先链推导，不需要额外字典；
 *                4. 有效位只剩 2 位（段级粗码）⇒ 用「段前缀 → 大类」映射命中大类。映射源是
 *                   crm_commodity_group_segments（我们自己的 32 类归属，不是旧树）。
 *              命中后连同**全部祖先码**一起输出：筛选时任意一层等值命中即可，运行期不做递归。
 *
 * @rules 换算口径只在这里实现一份；回填脚本与任何线上链路都调它，不允许出现第二份实现。
 *        粗码档位由**码自身的有效位**决定，不由「树里恰好查到哪层」决定 —— 后者会让同一批
 *        数据在不同时点落不同层，门禁 BB7 的逐条重算对拍就是用来抓这个的。
 * @limits 纯函数，不写库、不猜名、不兜底：换不出的码进 misses 交调用方处理（记账或拒写），
 *         绝不静默丢弃——静默丢会让公告在新树上"看起来不存在"。
 * @see scripts/ops/commodity-backbone-path-backfill.ts
 * @see scripts/gates/check-commodity-backbone.ts（BB7 挂靠闭合）
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
 * UNSPSC 8 位码 → 有效前缀（从右往左去掉成对的 `00`）。
 * 公告侧的码全是 8 位定长，粗码靠尾零表达层级：`10100000` 只说到族、`10000000` 只说到段。
 * 不归一就会拿粗码去等值查品目键（必然查不到 ⇒ 假 miss），这正是 probe57「段/族/类命中 0」的真因。
 * 形制不符（非 8 位纯数字）或整码全零 ⇒ 返回 null 交调用方进 misses，不猜。
 */
export function effectivePrefixOf(code: unknown): string | null {
  const c = String(code ?? "").trim();
  if (!/^\d{8}$/.test(c)) return null;
  for (let len = 8; len >= 2; len -= 2) if (c.slice(len - 2, len) !== "00") return c.slice(0, len);
  return null; // 全零不是合法码
}

/** 骨架节点码前缀：`crm_commodity_backbone.code` 的形制；tree.ts 复用这一份，不再各自写字面量 */
export const BACKBONE_NODE_PREFIX = "UGT-B-";

/** 节点码形制：前缀 + 2/4/6/8/10 位数字（奇数位一律不认） */
const NODE_RE = new RegExp(`^${BACKBONE_NODE_PREFIX}\\d{2}(\\d{2}){0,4}$`);

/**
 * 骨架节点码 → 自身 + 全部祖先，浅→深。
 * 为什么能纯切片不回表：门禁 BB1 把「父码 = 自身码去掉末两位」钉成不变量。
 * 形制不符返回空数组（调用方据此拒写），不返回半条链。
 */
export function chainOfNode(node: unknown): string[] {
  const v = String(node ?? "").trim();
  if (!NODE_RE.test(v)) return [];
  const body = v.slice(BACKBONE_NODE_PREFIX.length);
  const out: string[] = [];
  for (let len = 2; len <= body.length; len += 2) out.push(BACKBONE_NODE_PREFIX + body.slice(0, len));
  return out;
}

/**
 * 构索引：一次载入全树，内存里建三张查找表（码键、族→最深落点、段→大类）。
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

  // 族前缀(4 位) → 最深可证实唯一节点。一个族的成员 = 该前缀下的全部 L4 类行（uk_prefix 全局唯一，
  // 成员集合无歧义），然后从最深往浅找第一个「唯一」的分层：
  //   成员只有一个      → 落 L4：族 ≡ 那个子类，是树的结构事实，不是推断
  //   父小类唯一        → 落 L3
  //   再往上中类唯一    → 落 L2
  //   跨中类            → 数据冲突，抛错而不是挑一个
  const famMembers = new Map<string, BackboneRow[]>();
  for (const r of rows) {
    if (r.level !== 4 || !r.unspscPrefix) continue;
    const fam = r.unspscPrefix.slice(0, 4);
    const list = famMembers.get(fam);
    if (list) list.push(r);
    else famMembers.set(fam, [r]);
  }
  const famToDeepest = new Map<string, string>();
  for (const [fam, members] of famMembers) {
    const l2s = new Set<string>();
    for (const m of members) {
      const l2 = ancestorsOf(m.code).find((x) => x.level === 2)?.code;
      if (l2) l2s.add(l2);
    }
    if (l2s.size > 1) {
      const [a, b] = [...l2s];
      throw new Error(`族 ${fam} 的中类归属不唯一：${a} vs ${b}`);
    }
    const l3s = new Set(members.map((m) => m.parentCode).filter(Boolean));
    const only = (set: Set<string>): string | undefined => (set.size === 1 ? [...set][0] : undefined);
    const deepest = members.length === 1 ? members[0].code : only(l3s) ?? (l2s.size === 1 ? [...l2s][0] : undefined);
    if (deepest) famToDeepest.set(fam, deepest);
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
    // 先等值再归一：万一树里真存在以 `00` 结尾的 8 位品目键，等值优先，不能被尾零规则悄悄降一档
    const byFull = byPrefix.get(cs);
    if (byFull) return { row: byFull, tier: "品目级" };
    const eff = effectivePrefixOf(cs);
    if (!eff) return null;
    // 8 位全有效却查无品目 ⇒ 树里没这个品目。不擅自上浮到类级：上浮就是拿公告硬挂一个更宽的节点
    if (eff.length === 8) return null;
    if (eff.length === 6) {
      const row = byPrefix.get(eff);
      return row ? { row, tier: "类级" } : null;
    }
    const node = eff.length === 4 ? famToDeepest.get(eff) : segToL1.get(eff);
    const row = node ? byCode.get(node) : undefined;
    if (row) return { row, tier: eff.length === 4 ? "族级" : "段级" };
    // 尾零不在合法位置（如 10109900 的类段有效但 L4 行不存在），或前缀在树里没有对应行
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
