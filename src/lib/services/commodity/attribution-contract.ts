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
 *                AS5 换源   公告只有非 legacy 行、但列值声明的叶子在表内没承载 ⇒ 红。
 *                          这是 AS1/AS4 之间的黑洞：撞 uk 把 legacy 行吞了、那一行
 *                          的 source 变成别人的 —— 三条规则全绿，而归属事实已被替换。
 *
 *              「有效落点」（2026-10-19 新增，不是 AS 破口而是**待办队列的选人口径**）：
 *                落点行里存在 L2+ 节点 ⇒ 有效；只有 L1 大类码（码长 6）⇒ 粗落点，
 *                与「零落点」同等对待。依据是 2026-10-19 生产实测：14.3 万条公告的
 *                全部落点只是一个 L1 码，宽表 backbone_path 里它就是一串大类码——
 *                品目撮合、行业墙、定向邀请都吃不到它，但旧口径把它算成「已有归属」，
 *                于是 AI 管道的「只锚零落点」纪律永远跳过这批，覆盖率指标却把它们算成已覆盖。
 *                判据只吃 node_code 码长，绝不吃落点表 level 冗余列（该列注释明令不作判据）。
 *
 *              AI 侧不参与 AS2：野码分类的目的就是让列值从无到有，拿「不改归属」要求它
 *              等于把成果判成事故；它只进 stats.aiNotices 单独计数。
 *
 * @limits 纯函数：不连库、不查树（形制判定走 attribution 那份，不在此重拆列形制）。
 *         SQL 片段只做**字符串拼装**，不执行；表名仍过 assertTableName（反引号不转义）。
 *         违规文本上限 40 条，但 stats 恒为全量计数 —— 刷屏会掩盖规模，只报数字会掩盖样本。
 * @see docs/adr/0014-attribution-landing-table-two-writers.md
 */
import { closureOfPathColumn, leafNodesOfPathColumn, pathOfLandingNodes } from "./attribution";
import { fromBackbonePathColumn, toBackbonePathColumn } from "./backbone-path";
import { BACKBONE_NODE_PREFIX, backboneNodeLevel } from "@/shared/constants/commodity-code";

/** 存量快照的 source 字面量：与 scripts/tools/notice-attribution-backfill.ts 写入的同一份 */
export const ATTR_SOURCE_LEGACY = "legacy_tag";

/** 落点表表名：契约侧唯一登记处，需要拼 SQL 的调用方从这里取，不再各写一遍字面量 */
export const ATTR_LANDING_TABLE = "notice_attribution_nodes";

/**
 * 有效落点的最浅层级：L2 起。
 * L1 大类码只有 32 个值（实测），一条公告「归属到 UGT-22」等于没归属——
 * 它既不能喂品目撮合，也不能过行业墙，所以队列选人与覆盖率都按 L2+ 算。
 * 与 AI 管道的 `MIN_LEVEL`（默认 2）是同一条下限的两侧：那里挡写入，这里选待办。
 */
export const ATTR_VALID_MIN_LEVEL = 2;

/** L2 节点码的码长（前缀 + 2 层 × 2 位）；SQL 侧判据用它，不用 level 冗余列 */
export const ATTR_VALID_MIN_CODE_LEN = BACKBONE_NODE_PREFIX.length + ATTR_VALID_MIN_LEVEL * 2;

/**
 * 「正文够打标」下限（**字符数**）：归类靠正文里的标的物描述，短于这个数只能猜标题，不算证据。
 * 本常量是队列选人的唯一口径：AI 生产者脚本、规则上限工具、门禁 Q5 都从这里取。
 * 2026-10-19 前的现状是生产脚本里写死字节口径 `LENGTH(...) > 40`（CJK 下约等于 13 字），
 * 与任何报表口径都对不上 ⇒ 统一成字符口径，字节/字符不再混用。
 */
export const ATTR_MIN_CONTENT_CHARS = 41;

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
  /** AS4 命中数（有列值、零落点）：没有这个字段，门禁就只会把断供印成文本而不会变红 */
  orphanColumnNotices: number;
  /** AS5 命中数：公告只剩非 legacy 行、而列值声明的叶子无处承载（= 归属被换源） */
  sourceReplacedNotices: number;
  /** 有非 legacy 行但无 legacy 行、且列闭包不成立：不判红（形制问题不是归属问题），但必须报出来。
   *  没这个计数的话，“脏列交人工”那句注释就是没人接的一句话。 */
  dirtyColumnNotices: number;
  /** 只有粗落点（全行都 < L2）的公告数：不算 AS 破口，但必须报数 ——
   *  它决定 AI/规则管道的待办队列有多大（旧口径把这批算成「已有归属」，队列因此几乎为空）。 */
  coarseOnlyNotices: number;
  landingRows: number;
};

export type ContractReport = { violations: string[]; stats: ContractStats };

/** 违规文本上限：超过就只留样本，规模看 stats（门禁刷屏会掩盖真因） */
const MAX_REPORT = 40;

/**
 * 表名形制校验（唯一一份）：三个入口（门禁 CLI、灌入、DDL）都要把表名拼进反引号，
 * 而**反引号不转义**。判据只写一份的纪律同样适用于危接口。
 * 只挡形制不挡身份：“扫哪张表”由调用方自己拿主意（正名表的身份线在 DROP 侧单独卡）。
 */
export function assertTableName(name: string): void {
  if (!/^crm_[a-z0-9_]{1,60}$/.test(name)) {
    throw new Error(`表名形制非法（只允许 crm_ 开头、小写下划线、长度 ≤60）：${name}`);
  }
}

/**
 * 单条落点码是否算「有效归属」：只看码长层级，脏码一律无效（不猜层级）。
 * 形制解析只走 `backboneNodeLevel` 那一份，本函数不重拆码。
 */
export function isValidLandingCode(code: unknown): boolean {
  return backboneNodeLevel(code) >= ATTR_VALID_MIN_LEVEL;
}

/** 一批落点码里是否存在有效落点（调用方手上只有码集时用它，不查库） */
export function hasValidLanding(codes: Iterable<unknown>): boolean {
  for (const c of codes) if (isValidLandingCode(c)) return true;
  return false;
}

/**
 * 「粗落点」判定：有行、但没有一行能到 L2。
 * 脏 token（形制非法）算「有行但无效」⇒ 一并归入粗落点：它们同样接不住撮合，
 * 需要重推；与「零落点」的区别只在写入侧要不要先删旧行（防 AS1 混源），那是调用方的事。
 */
export function coarseOnlyLanding(codes: Iterable<unknown>): boolean {
  let any = false;
  for (const c of codes) {
    any = true;
    if (isValidLandingCode(c)) return false;
  }
  return any;
}

/**
 * 「该公告无有效落点」的 SQL 片段（与 @see coarseOnlyLanding 同一条下限，只允许这一份实现）：
 * 零落点与粗落点都命中它 ⇒ 同时把「从未归过位」与「只挂到大类」的两批公告收进同一条待办队列。
 * @param table 落点表名（演练表 __drill 也要走这里，不另拼一份 SQL）
 * @param alias 主表别名；片段假定连接键是 `<alias>.id = 落点表.notice_pk`
 */
export function withoutValidLandingWhere(table: string = ATTR_LANDING_TABLE, alias = "n"): string {
  assertTableName(table);
  return `NOT EXISTS (SELECT 1 FROM \`${table}\` a WHERE a.notice_pk = ${alias}.id AND LENGTH(a.node_code) >= ${ATTR_VALID_MIN_CODE_LEN})`;
}

/**
 * 「正文够打标」的 SQL 片段（与 @see ATTR_MIN_CONTENT_CHARS 同一份下限）：
 * 队列选人用它，门禁用它拆「能直接打标」与「必须先重采正文」两批——两个数必须能相加。
 */
export function withMinContentWhere(alias = "n"): string {
  return `CHAR_LENGTH(TRIM(${alias}.description)) >= ${ATTR_MIN_CONTENT_CHARS}`;
}

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
    orphanColumnNotices: 0,
    sourceReplacedNotices: 0,
    dirtyColumnNotices: 0,
    coarseOnlyNotices: 0,
    landingRows: 0,
  };
  const push = (msg: string) => {
    if (violations.length < MAX_REPORT) violations.push(msg);
  };

  for (const [pk, b] of byPk) {
    stats.landingRows += b.legacy.length + b.other.length;
    const col = colByPk.get(pk) ?? "";

    // 粗落点计数必须在任何 continue 之前：AS1 混源、AI 侧早退都会把公告跳过，
    // 而「只有 L1」与这些形态并不互斥——放在后面就会漏计，队列规模又会变回说不清的那个数。
    if (coarseOnlyLanding([...b.legacy, ...b.other])) stats.coarseOnlyNotices++;

    // AS1 的谓词 = 公告的 source 去重数 > 1，与 ADR-0014 写的 `HAVING COUNT(DISTINCT source) > 1` 逐字等价。
    // 不能只判「legacy 与非 legacy 共在」：那会漏掉两种非 legacy source 共存（`ai_content` + `manual`，
    // DDL 的列注释就声明了这个取值域），而末行还会打印「AS1 无混源」—— 那叫报平安，不叫没红。
    const sourceCount = (b.legacy.length ? 1 : 0) + b.otherSources.size;
    if (sourceCount > 1) {
      stats.mixedSourceNotices++;
      const srcs = [...(b.legacy.length ? [ATTR_SOURCE_LEGACY] : []), ...b.otherSources];
      push(
        `AS1 混源：公告 ${pk} 的落点行有 ${sourceCount} 种 source（${srcs.join("/")}）⇒ 契约破口，必须人工定（ADR-0014 结论 4）`,
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
    // 脏 token 单独报：colSet 已经把它过滤了，不补这一句就可能出现「报红了但三段全空」。
    // 这里故意用 split 而不是 fromBackbonePathColumn：要看的恰恰是官方解析器丢掉的那批 token。
    const dirty = String(col)
      .split(",")
      .filter((x) => x !== "" && !colSet.has(x));
    push(
      `AS2 快照落后：公告 pk=${pk} 派生 ${dSet.size} 个 / 列内 ${colSet.size} 个；派生有列无 ${onlyDerived.slice(0, 6).join(" ") || "—"}；列有派生无 ${onlyCol.slice(0, 6).join(" ") || "—"}；该补的落点 ${pairs.slice(0, 6).join(" ") || "—"}${dirty.length ? `；列内非节点码 token ${dirty.slice(0, 3).join(" ")}` : ""}`,
    );
  }

  for (const [pk, col] of colByPk) {
    if (!col) continue;
    const b = byPk.get(pk);
    if (b?.legacy.length) continue; // legacy 侧的差由 AS2/AS3 报，不在这里重复
    if (!b) {
      stats.orphanColumnNotices++;
      push(`AS4 断供：公告 pk=${pk} 有列值（${fromBackbonePathColumn(col).length} 个合法 token）但落点表零行 ⇒ 切读那一刻会被清成 NULL`);
      continue;
    }
    // AS5：只剩「有非 legacy 行、没有 legacy 行」这一种形状 —— AS1 要混源才红、AS4 要零落点才红，
    // 两个都不抱这种。而它恰恰是最贵的一种：legacy 行被 INSERT IGNORE 撞 uk 吞掉，表里那一行
    // 的 source 是别人的 ⇒ 列值声明的归属在事实源里没承载，四规则全绿而归属已被换源。
    if (closureOfPathColumn(col) !== col) {
      // 不判红（形制坏了不等于归属被换），也不静默吞：legacy 侧的同类脏列会被 AS2 抓到，
      // 而无 legacy 行的公告以前什么都不报 —— 那就是“交人工”这句话没人接。
      stats.dirtyColumnNotices++;
      push(`AS5·脏列（不判红，只报数）：公告 pk=${pk} 只有非 legacy 行，且列值闭包不成立 ⇒ 无法核归属，需人工看形制`);
      continue;
    }
    const backed = new Set(b.other);
    const uncovered = leafNodesOfPathColumn(col).filter((x) => !backed.has(x));
    if (uncovered.length) {
      stats.sourceReplacedNotices++;
      push(
        `AS5 换源：公告 pk=${pk} 表内只有 ${[...b.otherSources].join("/")} 行，而列值声明的 ${leafNodesOfPathColumn(col).length} 个叶子有 ${uncovered.length} 个无承载（样本 ${uncovered.slice(0, 6).join(" ")}）⇒ legacy 快照疑似被撞键吞掉，必须人工定（ADR-0014 结论 4）`,
      );
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
