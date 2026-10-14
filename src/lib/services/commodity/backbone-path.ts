/**
 * 骨架节点访问器 — 把 UGT 节点码反查成行 + 祖先链（旧品类码 全面退役 R4'）
 *
 * @module lib/services/commodity/backbone-path
 * @description 本模块从“把 旧品类码换成 UGT 节点”收敛为“在 UGT 节点上直接检索”。
 *              小表剥离上线日迁移（scripts/ops/user-interest-ugt-migrate.ts）+ 遗留清理（scripts/ops/interest-tables-purge-legacy.ts）
 *              完成后，`crm_user_interest_codes` / `crm_supplier_backbone_interests`（原 `旧供应商兴趣表`，§7 RENAME）已全部重写成 `UGT-*`，
 *              运行期再无数字码入口⇒ match/pathOf 只保留 UGT 节点直认一条分支。
 *
 *              历史四条换算规则（品目/类/族/段）与 crm_commodity_backbone.旧前缀映射列 列读取均随 R4' 剥开；
 *              列物理 DROP 后下一轮重导 baseline 就不带它了（门禁那边同步剥 BB2/BB3/BB4 旧品类码 分支/BB9）。
 *
 *              树形不变量（仍然成立、仍进门禁）：
 *                码长即层级（L1..L5 对应 2/4/6/8/10 位数字体），父码=自身去末两级；
 *                祖先全存：命中一个节点 ⇒ 命中它链上每层，筛选可等值命中任意一层。
 *              入参形制：只接合法 UGT 节点码（`^UGT-\d{2}(\d{2}){0,4}$`）；形制不合法或树上无此码 ⇒ 进 misses
 *              交调用方计数，不猜一个看起来合理的节点出来。
 *
 * @rules 换算口径只在这里实现一份；运行期与回填/镜像同一入口（loadBackboneIndex），不允许第二份实现。
 * @limits 纯函数，不写库、不猜名：换不出进 misses，不静默丢。
 * @see scripts/ops/user-interest-ugt-migrate.ts
 * @see scripts/gates/check-commodity-backbone.ts
 */

import { COMMODITY_GROUPS as _COMMODITY_GROUPS_UNUSED } from "./groups";
void _COMMODITY_GROUPS_UNUSED; // R4' 后 deriveSegmentRows 不再回退常量；列物理 DROP 与历史常量一起下一轮删。

/** 骨架节点行的最小字段集（够访问就行，不必载整行） */
export type BackboneRow = {
  code: string;
  parentCode: string;
  level: number;
};

/**
 * 历史保留：旧版从树反推段→大类时行入参需带 旧前缀映射列；R4' 后匹配仅走 UGT 直认，
 * 不再需要这段推导。行入参不再要求 旧前缀映射列 列，仅当无射向内行直读。
 * 新代码一律直接传 `BackboneRow` 即可。
 */
export type GroupSegmentRow = { segmentPrefix: string; nodeCode: string };

/** 命中档位，供覆盖率报表用 */
export type BackboneTier = "品目级" | "类级" | "族级" | "段级";

/** 节点码层级 → 归属档（UGT 节点键直认时用；L1/L2 都归段级，档位只作计数口径不作判据） */
const NODE_LEVEL_TIER: Record<number, BackboneTier> = {
  5: "品目级", 4: "类级", 3: "族级", 2: "段级", 1: "段级",
};

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
  /** 单个 旧品类码 → 最深命中节点 */
  match(code: string): BackboneMatch | null;
  /** 一条公告的码集合 → 骨架节点码集合 */
  pathOf(codes: Iterable<string>): BackbonePathResult;
};

const EMPTY_TIERS = (): Record<BackboneTier, number> => ({ 品目级: 0, 类级: 0, 族级: 0, 段级: 0 });

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
 * 构索引：一次载入全树，内存里建一张行内码→行查找表 + 一棵祖先链推导。
 * 纯计算，不做任何校验以外的判断。
 *
 * R4' 后 match/pathOf 只保留 UGT 直认一条分支：数字码入口（byPrefix / famToDeepest / segToL1）
 * 全剥——上线日迁移件把两张兴趣小表写成 UGT 后，运行期再无数字码入口。`segments` 入参保留
 * 但不再消费（历史形制向后兼容）；下一轮可同列 DROP 一起清掉。
 */
export function buildBackboneIndex(rows: BackboneRow[], segments: GroupSegmentRow[] = []): BackboneIndex {
  const byCode = new Map<string, BackboneRow>();
  for (const r of rows) byCode.set(r.code, r);
  void segments; // R4' 后无消费方；保留入参入口只为向后兼容。

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

  const match = (code: string): BackboneMatch | null => {
    // UGT 节点码直认：形制合法且 byCode 等值命中即返回，层级档按码长现算。
    // R4' 后不再回退到数字码⇒任何非 UGT 形制都直接进 misses，不猜。
    const lvl = backboneNodeLevel(code);
    if (lvl === 0) return null;
    const row = byCode.get(code);
    if (!row) return null;
    return { row, tier: NODE_LEVEL_TIER[lvl] ?? "段级" };
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
/**
 * 【已失效】R4' 剥开数字码入口后本函数不再被调用；`buildBackboneIndex` 也不再消费 `segments`。
 * 保留一个空实现，为历史行为向后兼容（tests 与 ops 探针仍可引 它，不会拿到旧形制的行 列）；
 * 下一轮 baseline 重导后可连根删除。
 */
export function deriveSegmentRows(
  rows: Array<{ code: string; level: number; group_code?: string }>,
): GroupSegmentRow[] {
  void rows;
  return [];
}

/**
 * 从库构索引：只读新树（crm_commodity_backbone）一张表，不回读 crm_commodity_nodes，
 * 也不再回读大类段归属表（crm_commodity_group_segments 已按 ADR-0009 退役）。
 * 树是 159,429 行量级，一次载入内存（回填要跑几十万条公告，逐条查库会把生产拖死）。
 *
 * R4' 后列域已缩到 code/parent_code/level：旧前缀映射列 列不再读（行入参形制与 BackboneRow 同步），
 * group_code 列也不再读（新事实源下 UGT 直认不需要段→大类映射）。列物理 DROP 属下一轮。
 *
 * 需要同口径的调用方（运行期 backbone-cache、ops 回填、镜像）一律调本函数，不要自己拼行集。
 */
export async function loadBackboneIndex(
  query: <T = Record<string, unknown>>(sql: string) => Promise<T[]>,
): Promise<BackboneIndex> {
  const rows = await query<{
    code: string;
    parent_code: string;
    level: number;
  }>(`SELECT code, parent_code, level FROM crm_commodity_backbone WHERE status = 1`);
  return buildBackboneIndex(
    rows.map((r) => ({ code: r.code, parentCode: r.parent_code, level: Number(r.level) })),
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
 * - `commodity/attribution.ts`：拆列取最深落点（旧品类码退役后归属事实源 ↔ 派生列的唯一换算面）；
 * - `commodity/attribution-contract.ts`：落点表契约的 AS4 token 计数与差异文本的合法集
 *   （用本函数而不是 `split(",")`，脏 token 不计入“有多少个落点”；
 *   契约内部的**脏 token 体检**段则故意走 split，它要看的就是被本函数过滤掉的那批）。
 * 待切（旧品类码 全面退役的二批，均应改调本函数而不是自己拆）：`旧品类码/*` 类目工具、三个 repo、
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
