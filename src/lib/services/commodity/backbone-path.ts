/**
 * 骨架节点访问器 — 把 UGT 节点码反查成行 + 祖先链（旧品类码全面退役 R4'）
 *
 * @module lib/services/commodity/backbone-path
 * @description 本模块从“把旧品类码换成 UGT 节点”收敛为“在 UGT 节点上直接检索”。
 *              小表剥离上线日迁移（一次性迁移件 user-interest-ugt-migrate）+ 遗留清理（同批件 interest-tables-purge-legacy）
 *              ——两件均属一次性，当时放 ops 不入库、现已删除；最终形制以 db/schema/baseline.sql 为准。
 *              完成后，`user_interest_codes` / `supplier_backbone_interests`（原 `旧供应商兴趣表`，§7 RENAME）已全部重写成 `UGT-*`，
 *              运行期再无数字码入口⇒ match/pathOf 只保留 UGT 节点直认一条分支。
 *
 *              历史四条换算规则（品目/类/族/段）与 commodity_backbone 的旧前缀映射列读取均随 R4' 剥开；
 *              列物理 DROP 后下一轮重导 baseline 就不带它了（门禁那边同步剥 BB2/BB3/BB4 旧品类码分支/BB9）。
 *
 *              树形不变量（仍然成立、仍进门禁）：
 *                码长即层级（L1..L5 对应 2/4/6/8/10 位数字体），父码=自身去末两级；
 *                祖先全存：命中一个节点 ⇒ 命中它链上每层，筛选可等值命中任意一层。
 *              入参形制：只接合法 UGT 节点码（`^UGT-\d{2}(\d{2}){0,4}$`）；形制不合法或树上无此码 ⇒ 进 misses
 *              交调用方计数，不猜一个看起来合理的节点出来。
 *
 * @rules 换算口径只在这里实现一份；运行期与回填/镜像同一入口（loadBackboneIndex），不允许第二份实现。
 * @limits 纯函数，不写库、不猜名：换不出进 misses，不静默丢。
 * @see db/schema/baseline.sql（兴趣两表最终形制；上线日迁移件属一次性、已删除不入库）
 * @see scripts/gates/check-commodity-backbone.ts
 */

/** 骨架节点行的最小字段集（够访问就行，不必载整行） */
export type BackboneRow = {
  code: string;
  parentCode: string;
  level: number;
};

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
  /** 单个旧品类码 → 最深命中节点 */
  match(code: string): BackboneMatch | null;
  /** 一条公告的码集合 → 骨架节点码集合 */
  pathOf(codes: Iterable<string>): BackbonePathResult;
};

const EMPTY_TIERS = (): Record<BackboneTier, number> => ({ 品目级: 0, 类级: 0, 族级: 0, 段级: 0 });

// ── 码形制层已下沉 shared/constants/commodity-code（唯一实现，2026-10 分层治理）──
// 本模块改为直引 + 再导出：既有 lib/scripts 消费方的 `./backbone-path` 入口不变，
// 实现只有 shared 一份；features 侧按红线 3 直引 shared，不得进到这里。
import { BACKBONE_NODE_PREFIX, backboneNodeLevel, chainOfNode, normalizeBackboneNodeKey } from "@/shared/constants/commodity-code";

export { BACKBONE_NODE_PREFIX, backboneNodeLevel, chainOfNode, normalizeBackboneNodeKey };

/**
 * 构索引：一次载入全树，内存里建一张行内码→行查找表 + 一棵祖先链推导。
 * 纯计算，不做任何校验以外的判断。
 *
 * R4' 后 match/pathOf 只保留 UGT 直认一条分支：数字码入口（byPrefix / famToDeepest / segToL1）
 * 全剥——上线日迁移件把两张兴趣小表写成 UGT 后，运行期再无数字码入口。
 * 2026-10-15 G 码退役：segments 入参与 GroupSegmentRow 一并拆除（无消费方）。
 */
export function buildBackboneIndex(rows: BackboneRow[]): BackboneIndex {
  const byCode = new Map<string, BackboneRow>();
  for (const r of rows) byCode.set(r.code, r);

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
 * 从库构索引：只读新树（commodity_backbone）一张表，不回读 crm_commodity_nodes，
 * 也不再回读大类段归属表（crm_commodity_group_segments 已按 ADR-0009 退役）。
 * 树是 159,429 行量级，一次载入内存（回填要跑几十万条公告，逐条查库会把生产拖死）。
 *
 * R4' 后列域已缩到 code/parent_code/level：旧前缀映射列不再读（行入参形制与 BackboneRow 同步），
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
  }>(`SELECT code, parent_code, level FROM commodity_backbone WHERE status = 1`);
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
 * 待切（旧品类码全面退役的二批，均应改调本函数而不是自己拆）：旧字典版类目工具目录、三个 repo、
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
