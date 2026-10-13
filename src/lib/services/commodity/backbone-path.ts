/**
 * 骨架路径换算器 — 把公告身上的 UNSPSC 码换成品目骨架节点码（`UGT-…`）
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
 *                   L3，再往上中类/大类逐层唯一则落该层（2026-10-13 起树按业务语义重挂，一个 UNSPSC
 *                   族的类行可以合法分属多个小类/中类——「最深可证实唯一祖先」自然延伸到 L1）；
 *                   跨大类属数据冲突，直接抛错。映射全部由新树自己的祖先链推导，不需要额外字典；
 *                4. 有效位只剩 2 位（段级粗码）⇒ 用「段前缀 → 大类」映射命中大类。映射源是
 *                   crm_commodity_group_segments（我们自己的 32 类归属，不是旧树）。
 *              命中后连同**全部祖先码**一起输出：筛选时任意一层等值命中即可，运行期不做递归。
 *
 *              入参形制（2026-10-11 放宽）：除 8 位定长码外，**成对的 2/4/6 位前缀也接受**
 *              （右补零到 8 位再走同一套规则）。理由：兴趣码表实测有 357/830 条存的是截断前缀
 *              （如 `72`、`2510`），它们在 UNSPSC 里就是段/族/类级粗码的简写；补零是唯一的
 *              无损还原写法，不补就只能让这批兴趣信号在读侧永远换不出落点（实测静默召不回）。
 *              仍拒：奇数位（`251`，凑不出合法的两位一级）、超过 8 位、含非数字 —— 那些不是截断
 *              而是脏数据，一律进 misses 交调用方计数，不猜。公告桥表实测 767,271 行全是 8 位
 *              ⇒ 放宽不改动任何已回填的公告归属（BB10/BB11 重算对拍可证）。
 *
 * @rules 换算口径只在这里实现一份；回填脚本与任何线上链路都调它，不允许出现第二份实现。
 *        粗码档位由**码自身的有效位**决定，不由「树里恰好查到哪层」决定 —— 后者会让同一批
 *        数据在不同时点落不同层，门禁 BB10 的逐条重算对拍就是用来抓这个的。
 * @limits 纯函数，不写库、不猜名：换不出的码进 misses 交调用方处理（记账或拒写），
 *         绝不静默丢弃——静默丢会让公告在新树上"看起来不存在"。唯一允许的兜底是**段级**
 *         （树没推出那段时，拿 `COMMODITY_GROUPS` 的段→大类口径指到树上真实的 L1 行，见 deriveSegmentRows）；
 *         族/类/品目级的深码一律不上浮——那是「精度换覆盖」的另一个口径决定，不跟在这里默认掉。
 * @see scripts/ops/commodity-backbone-path-backfill.ts
 * @see docs/superpowers/specs/2026-10-12-unspsc-full-retirement-design.md（UNSPSC 全面退役的批次划分）
 * @see scripts/gates/check-commodity-backbone.ts（BB7 挂靠闭合）
 */

import { COMMODITY_GROUPS } from "./groups";

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
 * UNSPSC 码入参归一：8 位定长原样返回；成对的 2/4/6 位前缀右补零到 8 位（UNSPSC 的层级
 * 就是成对的两位，截断写法补零回去是无损的）。其余形制一律 null：奇数位凑不出合法的
 * 两位一级、超过 8 位（含 9~13 位脏值）、含非数字、空值 —— 都不是「截断」而是坏数据，
 * 交给调用方进 misses 计数，不猜一个看起来合理的码出来。
 */
export function padUnspscCode(code: unknown): string | null {
  const c = String(code ?? "").trim();
  if (!/^\d{2,8}$/.test(c) || c.length % 2 !== 0) return null;
  return c.padEnd(8, "0");
}

/**
 * UNSPSC 码 → 有效前缀（先归一到 8 位，再从右往左去掉成对的 `00`）。
 * 粗码靠尾零表达层级：`10100000` 只说到族、`10000000` 只说到段。
 * 不归一就会拿粗码去等值查品目键（必然查不到 ⇒ 假 miss），这正是 probe57「段/族/类命中 0」的真因。
 * 形制不符（奇数位/超 8 位/含非数字）或整码全零 ⇒ 返回 null 交调用方进 misses，不猜。
 */
export function effectivePrefixOf(code: unknown): string | null {
  const c = padUnspscCode(code);
  if (!c) return null;
  for (let len = 8; len >= 2; len -= 2) if (c.slice(len - 2, len) !== "00") return c.slice(0, len);
  return null; // 全零不是合法码
}

/** 骨架节点码前缀：`crm_commodity_backbone.code` 的形制；tree.ts 复用这一份，不再各自写字面量 */
export const BACKBONE_NODE_PREFIX = "UGT-";

/** 节点码形制：前缀 + 2/4/6/8/10 位数字（奇数位一律不认） */
const NODE_RE = new RegExp(`^${BACKBONE_NODE_PREFIX}\\d{2}(\\d{2}){0,4}$`);

/**
 * 骨架节点码 → 层级（1~5）；形制不符返回 0（调用方据此拒收，不猜层级）。
 * 全库只这一份形制判定：`chainOfNode` / `fromBackbonePathColumn` / `tree.ts` 的
 * `isCommodityNodeKey` 均走它。曾经有过只判 `startsWith` 的写法，那会把 `UGT-XY` 这种
 * 脏 token 当成合法层级使 —— 两个同样的脏码直接得高分，就能出一条不存在的相似公告。
 * 故意不 trim：脏入参（URL 参数带空格、列里混进空白）宁可判非法 —— `tree.ts` 的原契约
 * 就是「形制不符不点亮」，这里多一次 trim 就会把脏键放进来。
 */
export function backboneNodeLevel(node: unknown): number {
  const v = typeof node === "string" ? node : "";
  if (!NODE_RE.test(v)) return 0;
  return (v.length - BACKBONE_NODE_PREFIX.length) / 2;
}

/**
 * 旧码制兼容归一（仅入口层用）：2026-10-13 前品目树码带面别字（`UGT-B-…`），存量外链
 * （`?commodity=` / `?code=` / `?parent=`）可能仍带旧形，入口归一成现行码再走形制判定。
 * 库列解析（`fromBackbonePathColumn`）**不走这里**——列形制已随数据迁移只有一种，
 * 宽解析反会把脏 token 放进来（见 backboneNodeLevel 的不 trim 理由）。
 */
export function normalizeBackboneNodeKey(v: unknown): string {
  const s = String(v ?? "");
  return s.startsWith("UGT-B-") ? BACKBONE_NODE_PREFIX + s.slice(6) : s;
}

/**
 * 骨架节点码 → 自身 + 全部祖先，浅→深。
 * 为什么能纯切片不回表：门禁 BB1 把「父码 = 自身码去掉末两位」钉成不变量。
 * 形制不符返回空数组（调用方据此拒写），不返回半条链。
 */
export function chainOfNode(node: unknown): string[] {
  const v = String(node ?? "").trim();
  if (backboneNodeLevel(v) === 0) return [];
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
  //   再往上大类唯一    → 落 L1（2026-10-13 起：树已按业务语义重挂，一个 UNSPSC 族的类行
  //                        可以合法地分属多个小类/中类——现树 14 个族跨中类、0 个族跨大类；
  //                        「最深可证实唯一祖先」规则自然延伸到 L1）
  //   跨大类            → 数据冲突，抛错而不是挑一个
  const famMembers = new Map<string, BackboneRow[]>();
  for (const r of rows) {
    if (r.level !== 4 || !r.unspscPrefix) continue;
    const fam = r.unspscPrefix.slice(0, 4);
    const list = famMembers.get(fam);
    if (list) list.push(r);
    else famMembers.set(fam, [r]);
  }
  const famToDeepest = new Map<string, string>();
  const only = (set: Set<string>): string | undefined => (set.size === 1 ? [...set][0] : undefined);
  for (const [fam, members] of famMembers) {
    const chains = members.map((m) => ancestorsOf(m.code));
    const l3s = new Set(members.map((m) => m.parentCode).filter(Boolean));
    const l2s = new Set<string>();
    const l1s = new Set<string>();
    for (const ch of chains) {
      const l2 = ch.find((x) => x.level === 2)?.code;
      const l1 = ch.find((x) => x.level === 1)?.code;
      if (l2) l2s.add(l2);
      if (l1) l1s.add(l1);
    }
    if (l1s.size > 1) {
      const [a, b] = [...l1s];
      throw new Error(`族 ${fam} 的大类归属不唯一：${a} vs ${b}`);
    }
    const deepest =
      members.length === 1
        ? members[0].code
        : only(l3s) ?? only(l2s) ?? only(l1s);
    if (deepest) famToDeepest.set(fam, deepest);
  }

  const segToL1 = new Map<string, string>();
  for (const s of segments) {
    const prev = segToL1.get(s.segmentPrefix);
    if (prev && prev !== s.nodeCode) throw new Error(`段 ${s.segmentPrefix} 的大类归属不唯一：${prev} vs ${s.nodeCode}`);
    segToL1.set(s.segmentPrefix, s.nodeCode);
  }

  const match = (code: string): BackboneMatch | null => {
    // 先归一（成对的 2/4/6 位前缀补零）再比：不补零的话兴趣侧那批截断码会全数假 miss
    const cs = padUnspscCode(code);
    if (!cs) return null;
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
 * 段（2 位）→ 大类 L1 节点：**从骨架上内存推导**，不再查 crm_commodity_group_segments（已按 ADR-0009 退役）。
 *
 * 口径依据：`group_code` 是骨架上逐行冗余的列（DDL 原注：冗余到每一层，筛选与权益墙免递归查父），
 * 而门禁 BB4 断言「类行的段所属大类 == 自身 group_code == 祖先 L1 的 group_code」。于是
 * 「一个段的全部 L4 行指向同一个 L1」是**受门禁保护的不变量**，不是猜测：
 *  - 段级键的落点 = 该段任一 L4 行的 group_code 所对应的 L1 行码；
 *  - 同一段推出两个不同 L1 ⇒ 抛错，不挑一个（BB4 与门禁 CG5 双守这条）；
 *  - 同一个大类码出现两个 L1 行同样抛错：`listL2OfGroup` 那类「取第一行」的读法会静默漏掉一整个大类；
 *  - L1 行被停用/缺席 ⇒ 该段不落点（与退役前那条 SQL 的 `b.status = 1` 同效）。
 * 实测（scripts/forensics/probe-seg-derivable.ts）：58 段三方逐段全等、0 段跨多大类，与退役前的归属表逐段一致。
 *
 * 【常量兜底】树重建可以把某一段的 L4 行整段裁掉（2026-10-12 现网实到：85 段没了，
 * `85000000` 这类段级粗码以「只从树反推」就换不出归属，连带 1,159 条公告（活跃 272）丢分类）。
 * 而段→大类本身的口径在 `COMMODITY_GROUPS` 常量里（ADR-0008/0009：大类维表退役后口径只剩常量），
 * 所以树没推出那段时，用常量指到该大类那个**真实存在的 L1 行** —— 指的是树上的节点，不是造码。
 * 两条约束：树反推优先（常量不得覆盖树已有结论）；大类在树里没有 L1 行就不落点（不抛错，
 * 与上面那条「L1 缺席 ⇒ 不落点」保持同一语义，不给 loadBackboneIndex 新增崩溃面）。
 */
export function deriveSegmentRows(
  rows: Array<{ code: string; level: number; unspsc_prefix: string | null; group_code: string }>,
): GroupSegmentRow[] {
  const l1OfGroup = new Map<string, string>();
  for (const r of rows) {
    if (Number(r.level) !== 1 || !r.group_code) continue;
    const prev = l1OfGroup.get(r.group_code);
    if (prev && prev !== r.code) {
      throw new Error(`大类 ${r.group_code} 在骨架里有两个 L1 行：${prev} vs ${r.code}`);
    }
    l1OfGroup.set(r.group_code, r.code);
  }
  const out: GroupSegmentRow[] = [];
  const covered = new Set<string>();
  for (const r of rows) {
    if (Number(r.level) !== 4) continue;
    const p = String(r.unspsc_prefix ?? "");
    if (!/^\d{6}$/.test(p)) continue; // L4 存 6 位类前缀；形制不符不参与推理
    const nodeCode = l1OfGroup.get(r.group_code);
    if (nodeCode) {
      out.push({ segmentPrefix: p.slice(0, 2), nodeCode });
      covered.add(p.slice(0, 2));
    }
  }
  // 兜底只补树没推出来的段；两边对同一段说法不一时留树的那条，后续冲突由 buildBackboneIndex 抛错
  for (const g of COMMODITY_GROUPS) {
    const nodeCode = l1OfGroup.get(g.code);
    if (!nodeCode) continue;
    for (const p of g.prefixes) {
      if (covered.has(p)) continue;
      out.push({ segmentPrefix: p, nodeCode });
      covered.add(p);
    }
  }
  return out;
}

/**
 * 从库构索引：只读新树（crm_commodity_backbone）一张表，不回读 crm_commodity_nodes，
 * 也不再回读大类段归属表（crm_commodity_group_segments 已按 ADR-0009 退役）。
 * 树是 159,429 行量级，一次载入内存（回填要跑几十万条公告，逐条查库会把生产拖死）。
 *
 * 需要同口径的调用方（运行期 backbone-cache、ops 回填、门禁 BB9/BB10）一律调本函数，
 * 不要自己拼行集 —— 两边行集不同时的 BB10 报红分不清是「第二份实现」还是「取数不同」。
 *
 * 【未决口径】这里只取 `status = 1` 的行：族级落点靠「该族有几个子类」这类成员计数定档，
 * 所以停用一族里的一个子类会让该族粗码从 L3 跳到 L4 —— 一次运营侧启停会改掉已有公告的归属。
 * 本次不改（改了必须全量重跑回填才一致），但它是已知风险：要改就连带把三个调用方的
 * 行集一起改，并先确认「归属该不该跟启停走」。详见 spec 的开放项。
 * 同一口径也决定了段级：某段的 L4 行**全部**被停用时该段不再落点（退役前的归属表不带 status、
 * 会照样落点）——当前库 159,429 行全为 status=1，两种写法实际无差异。
 */
export async function loadBackboneIndex(
  query: <T = Record<string, unknown>>(sql: string) => Promise<T[]>,
): Promise<BackboneIndex> {
  const rows = await query<{
    code: string;
    parent_code: string;
    level: number;
    unspsc_prefix: string | null;
    group_code: string;
  }>(`SELECT code, parent_code, level, unspsc_prefix, group_code FROM crm_commodity_backbone WHERE status = 1`);
  return buildBackboneIndex(
    rows.map((r) => ({ code: r.code, parentCode: r.parent_code, level: Number(r.level), unspscPrefix: r.unspsc_prefix })),
    deriveSegmentRows(rows),
  );
}

/** 节点码拼接成列值：ASCII 逗号分隔，无空格；空集返回空串（调用方据此写 NULL） */
export function toBackbonePathColumn(codes: string[]): string {
  return codes.join(",");
}

/**
 * 节点码集合的**最浅覆盖集**：去掉集合里「已有祖先也在集合中」的那些节点。
 * 为什么可以去掉：列值祖先全存 ⇒ 命中深层节点的公告必然也命中它的每个祖先
 * ⇒ match(浅) ⊇ match(深)，并集 = match(浅) ⇒ 谓词块数降下来而结果一字不变。
 * 给「多值 OR 谓词」用（推荐召回一个用户几十上百个落点节点，实测压集后耗时降 3~5 倍）。
 * 与 `notices/similar-scoring.ts` 的 `leafNodes`（取叶子）互为镜像：那两个都是纯切片，不查库。
 */
export function rootNodes(nodes: Iterable<string>): string[] {
  const set = new Set([...nodes].filter((n) => backboneNodeLevel(n) > 0));
  const out: string[] = [];
  for (const x of set) {
    let covered = false;
    for (let lv = backboneNodeLevel(x) - 1; lv >= 1; lv -= 1) {
      if (set.has(x.slice(0, BACKBONE_NODE_PREFIX.length + lv * 2))) {
        covered = true;
        break;
      }
    }
    if (!covered) out.push(x);
  }
  return out.sort();
}

/**
 * 列值 → 节点码数组（`toBackbonePathColumn` 的逆操作）：NULL/空串 → 空数组，去重，只留 `UGT-` 形制的 token。
 * 读取端拆列**只走这里**：手写 `split(",")` 的地方一多，列形制改了就会逐处静默失效。
 * 已登记消费方（新增一个就回这里点名，别让它默默长出第二份）：
 * - `notices/similar.ts`：从宽表列值取当前公告与候选公告的节点码；
 * - `meilisearch/sync.ts`：拆成 `backbone_node` 数组属性（precise_backbone_node 已随 candidates 表退役）；
 * - `industry-scope.ts`：行业墙的单公告执法点，拆宽表 `backbone_path` 与大类的 L1 节点码集比对；
 * - `search-orchestrator/format.ts`：匹配分标签拆 `backbone_path`（与检索谓词同源）；
 * - `ai-match/match-nodes.ts`：粗筛公告侧拆宽表 `backbone_path`（供应商侧不拆列，
 *   兴趣码走 `getBackboneIndex().pathOf` 换算，与本函数同一口径）；
 * - `commodity/attribution.ts`：拆列取最深落点（UNSPSC 退役后归属事实源 ↔ 派生列的唯一换算面）；
 * - `commodity/attribution-contract.ts`：落点表契约的差异文本与 AS4 token 计数（此处**必须**用本函数
 *   而不是 `split(",")`：脏 token 不算落点，否则门禁会把形制问题报成归属缺口）。
 * 待切（UNSPSC 全面退役的二批，均应改调本函数而不是自己拆）：`unspsc/*` 类目工具、三个 repo、
 * `recommend`。`hot-topics` 已收：它的计数留在 SQL 里按包含关系聚合
 * （`FIND_IN_SET` 与检索谓词同一条关系），不在应用侧拆列 ⇒ 不进本名单。
 */
export function fromBackbonePathColumn(value: unknown): string[] {
  const s = String(value ?? "").trim();
  if (!s) return [];
  return [...new Set(s.split(",").filter((x) => backboneNodeLevel(x) > 0))];
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
