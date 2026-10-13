/**
 * 落点表契约（纯函数，依赖叶子）— 「落点 ⊇ 列值」与 source 分档的唯一判据面
 * Attribution landing-table contract (pure functions) — the single definition of "broken"
 *
 * @module lib/services/commodity/attribution-contract
 * @description 判据只写一份：门禁（全量对拍）、ops 脚本（写前普查 / DROP 硬闸）、增量镜像
 *              （该补哪些公告）三处都要用同一套「什么算破口」。任何一处自己拼一遍判据，
 *              就会长出第二套口径 —— 那正是 BB10 / NC1 当年抓过的同类事故。
 *
 *              四条规则（ADR-0014 结论 4~6 的机器化）：
 *                AS1 混源   同一公告的落点行只允许一种 source ⇒ 红。
 *                          「唯一键不含 source」这个决定全靠它兜，缺它契约就是口头约定。
 *                AS2 快照   纯 legacy_tag 的公告：派生列值必须逐条等于现列值 ⇒ 红。
 *                          差异 = 灌入落后于列（2026-10-13 实测整表缺 5 行就是这么抓出来的）。
 *                AS3 半写   有 legacy 落点却没有列值 ⇒ 红（事实源写了、派生列没跟上）。
 *                AS4 断供   有列值却没有任何落点 ⇒ 红（切读那一刻这条会被清成 NULL）。
 *
 *              AI 侧不参与 AS2：野码分类的目的就是让列值从无到有，拿「不改归属」要求它
 *              等于把成果判成事故；它只进 stats.aiNotices 单独计数。
 *
 * @limits 纯函数：不连库、不查树（形制判定走 attribution 那份，不在此重拆列形制）。
 *         违规文本上限 40 条，但 stats 恒为全量计数 —— 刷屏会掩盖规模，只报数字会掩盖样本。
 * @see docs/adr/0014-attribution-landing-table-two-writers.md
 */
import { closureOfPathColumn, leafNodesOfPathColumn, pathOfLandingNodes } from "./attribution";
import { fromBackbonePathColumn, toBackbonePathColumn } from "./backbone-path";

/** 存量快照的 source 字面量：与 scripts/ops/notice-attribution-backfill.ts 写入的同一份 */
export const ATTR_SOURCE_LEGACY = "legacy_tag";

/** 一条落点行（只取判据需要的三列） */
export type LandingRow = { pk: number; code: string; source: string };
/** 一条宽表列值（`col` 为 NULL 时传空串，不传 null —— 判据里「无列值」就是空串） */
export type ColumnRow = { pk: number; col: string };

export type ContractStats = {
  noticesWithLanding: number;
  /** **非空**列值的公告数（NULL/空串不计）：要与 noticesWithLanding 同口径才能直接对拍 */
  noticesWithColumn: number;
  /** 纯 legacy 且派生逐条等于列值的公告数（健康主体） */
  legacyNotices: number;
  /** 含非 legacy source 的公告数：只计数，不判红 */
  aiNotices: number;
  /** AS1 命中数 */
  mixedSourceNotices: number;
  /** AS2 + AS3 命中数（legacy 侧破口） */
  legacyDriftNotices: number;
  landingRows: number;
};

export type ContractReport = { violations: string[]; stats: ContractStats };

/** 违规文本上限：超过就只留样本，规模看 stats（门禁刷屏会掩盖真因） */
const MAX_REPORT = 40;

type Bucket = { legacy: string[]; other: string[]; otherSources: Set<string> };

function groupLandings(landings: Iterable<LandingRow>): Map<number, Bucket> {
  const byPk = new Map<number, Bucket>();
  for (const l of landings) {
    const pk = Number(l.pk);
    let b = byPk.get(pk);
    if (!b) {
      b = { legacy: [], other: [], otherSources: new Set<string>() };
      byPk.set(pk, b);
    }
    if (l.source === ATTR_SOURCE_LEGACY) b.legacy.push(l.code);
    else {
      b.other.push(l.code);
      b.otherSources.add(String(l.source));
    }
  }
  return byPk;
}

/**
 * 「列隐含落点 − 现有落点」：补灌/镜像该写的具体对，而不是整条公告。
 * 闭包不成立的脏列不产候选 —— 宁可交人工，也不能顺手把现网归属改掉（与灌入脚本闸口 1 同纪律）。
 */
export function missingLandingPairs(
  landings: Iterable<LandingRow>,
  columns: Iterable<ColumnRow>,
): Array<{ pk: number; code: string }> {
  const present = new Map<number, Set<string>>();
  for (const l of landings) {
    const pk = Number(l.pk);
    const set = present.get(pk);
    if (set) set.add(l.code);
    else present.set(pk, new Set<string>([l.code]));
  }
  const out: Array<{ pk: number; code: string }> = [];
  for (const c of columns) {
    const pk = Number(c.pk);
    const col = String(c.col ?? "");
    if (!col || closureOfPathColumn(col) !== col) continue;
    const have = present.get(pk) ?? new Set<string>();
    for (const leaf of leafNodesOfPathColumn(col)) if (!have.has(leaf)) out.push({ pk, code: leaf });
  }
  return out;
}

/**
 * 四条规则一次算完。
 * @param landings 与 @param columns 必须来自**同一完整范围**（全表，或同一批公告的 pk 交集），
 *        否则分批会把「本批没取到列值」假报成 AS4 断供 —— 门禁分批跑时 AS4 走 SQL 反连接，
 *        只把该批的落点与该批的列值喂进来判 AS1~AS3。
 */
export function auditLanding(landings: Iterable<LandingRow>, columns: Iterable<ColumnRow>): ContractReport {
  const byPk = groupLandings(landings);
  const colByPk = new Map<number, string>();
  for (const c of columns) colByPk.set(Number(c.pk), String(c.col ?? ""));
  let filledCols = 0;
  for (const v of colByPk.values()) if (v !== "") filledCols++;

  const violations: string[] = [];
  const stats: ContractStats = {
    noticesWithLanding: byPk.size,
    noticesWithColumn: filledCols,
    legacyNotices: 0,
    aiNotices: 0,
    mixedSourceNotices: 0,
    legacyDriftNotices: 0,
    landingRows: 0,
  };
  const push = (msg: string) => {
    if (violations.length < MAX_REPORT) violations.push(msg);
  };

  for (const [pk, b] of byPk) {
    stats.landingRows += b.legacy.length + b.other.length;
    const col = colByPk.get(pk) ?? "";

    if (b.legacy.length && b.other.length) {
      stats.mixedSourceNotices++;
      push(
        `AS1 混源：公告 ${pk} 同时有 legacy_tag(${b.legacy.length}) 与 ${[...b.otherSources].join("/")}(${b.other.length}) 落点 ⇒ 契约破口，必须人工定（ADR-0014 结论 4）`,
      );
      continue; // 混源公告的派生归属未定，不再判 AS2（一条破口只报一次）
    }
    if (b.other.length) {
      stats.aiNotices++;
      continue; // AI 侧允许补/改列值，只计数
    }

    // 到这里只剩「纯 legacy_tag」一种形状
    if (!col) {
      stats.legacyDriftNotices++;
      push(`AS3 半写：公告 pk=${pk} 有 ${b.legacy.length} 条 legacy 落点，宽表列值却为空 ⇒ 事实源写了、派生列没跟上`);
      continue;
    }
    const derivedNodes = pathOfLandingNodes(b.legacy);
    const derived = toBackbonePathColumn(derivedNodes);
    if (derived === col) {
      stats.legacyNotices++;
      continue;
    }
    stats.legacyDriftNotices++;
    // 两侧都按「节点码集合」比。绝不 `new Set(derived)`：derived 是 join(",") 后的**字符串**，
    // 那样会退化成字符集，差异文本会变成「派生 9 个 / 列有派生无 整列码」这种误导人的噪声。
    const colSet = new Set(fromBackbonePathColumn(col));
    const dSet = new Set(derivedNodes);
    const onlyDerived = [...dSet].filter((x) => !colSet.has(x));
    const onlyCol = [...colSet].filter((x) => !dSet.has(x));
    const pairs = missingLandingPairs(
      b.legacy.map((code) => ({ pk, code, source: ATTR_SOURCE_LEGACY })),
      [{ pk, col }],
    ).map((p) => p.code);
    push(
      `AS2 快照落后：公告 pk=${pk} 派生 ${dSet.size} 个 / 列内 ${colSet.size} 个；派生有列无 ${onlyDerived.slice(0, 6).join(" ") || "—"}；列有派生无 ${onlyCol.slice(0, 6).join(" ") || "—"}；该补的落点 ${pairs.slice(0, 6).join(" ") || "—"}`,
    );
  }

  for (const [pk, col] of colByPk) {
    if (col && !byPk.has(pk)) {
      push(`AS4 断供：公告 pk=${pk} 有列值（${fromBackbonePathColumn(col).length} 个合法 token）但落点表零行 ⇒ 切读那一刻会被清成 NULL`);
    }
  }
  return { violations, stats };
}

/**
 * 正名表 DROP 的硬闸（ADR-0014 纪律 1）：一旦有非 legacy 行，DROP 就是销毁换不回来的事实。
 * 故意不接受"绕过"开关 —— 派生数据可以重灌，判定事实不行，这条线必须由代码而不是记性守住。
 */
export function assertDroppable(census: Record<string, number>): void {
  const foreign = Object.entries(census).filter(([src, n]) => src !== ATTR_SOURCE_LEGACY && Number(n) > 0);
  if (!foreign.length) return;
  const detail = foreign.map(([s, n]) => `${s}=${n}`).join(" ");
  throw new Error(
    `落点表含非 legacy_tag 行（${detail}）：这些是不可重算的判定事实，禁止 DROP 正名表或在正名表上演练回滚。` +
      `要回滚请先人工导出留底并经需求方确认；只是想看回滚通道是否可用 —— 改在影子表上做（--table=<name>__drill）。`,
  );
}
