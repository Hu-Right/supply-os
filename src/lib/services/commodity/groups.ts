/**
 * 品目大类（32 类）单一事实源 — 权益墙与商机筛选共用的顶层单位
 * Commodity Groups (32) — single source of truth
 *
 * 定位： 旧品类码 太细（58 段 / 559 族 / 8,004 类 / 15 万品目），旧十大类太粗且口径混用。
 * 32 个大类按「品目语义 + 真实公告体量」重切，作为权益墙的行业单位与商机筛选的顶层单位。
 * 大类是纯维表（本表 + 段归属表两张小表），不进公告主表、不进 FT、不进 Meili。
 *
 * 为什么不写进品目面树（约束不变）：
 *  1. 加一层会破「码长即层级」公理（板块2/族4/类6/品目8/自研10）；
 *  2. 段行也进白名单会让 58 个段码变成合法公告码，污染桥表白名单校验；
 *  3. 大类归属是业务口径，改它不该触发 15.8 万行重排。
 *
 * 为什么是 32 类、为什么键仍取「前 2 位（段级）」（2026-10-11 重切，实测依据 temp/probe33~36）：
 *  - 15 类太粗的病根是「把语义无关的段并成一个抽屉」：旧 G08 一类塞了 41 仪器(11,394)、
 *    42 器械(26,848)、51 药品(5,439)、85 医疗服务(6,477) 四个完全不同的采购主体；
 *    旧 G03 一类塞了 10 个段。用户视角要的是「工程 / 医药 / 器械 各自一类」。
 *  - 键只能到段级：全库有码公告 353,761 条里 **132,729 条（37.5%）只打到段级粗码**
 *    （该公告一切码都是 `xx000000`；另按码行口径粗码占 23.0%），族级有数据的族只有 80 个
 *    且多数 < 300 公告；把归属键下沉到族（前 4 位）会让这 13.3 万条公告挂不到任何类。
 *  - 段级重切即可达成目标：医疗器械(42)、药品(51)、医疗服务(85)、仪器(41) 本来就是
 *    四个独立段，拆开不需要动树、不需要动粗码。
 *  - 代价（如实）：类间均衡度从 15 类的 5.0 倍降到 15.0 倍（实测 建施 49,236 vs 代工 3,293）。
 *    头部段 72/80/43 是单段巨类，段级键下无法再拆，只能靠族级下钻（M4 后的二期）。
 *
 * 约束（由 validateCommodityGroups + check-commodity-groups CG1~CG5 强制）：
 *  - 32 类；58 个 旧品类段前缀每个出现且仅出现一次（归属唯一）；
 *  - 码格式 `^UGT-G-[0-9]{2}$`、sort 1~32 不重复（chip 顺序稳定不随每日量漂移）；
 *  - 本模块不得连接数据库或读写文件（保持纯逻辑，可被门禁与单测直接 import）。
 *
 * 口径变更纪律：改这里 = 改大类划分，必须同步 ① 两张维表（重跑灌入/迁移脚本）
 * ② 宽表 group_codes 重灌（回填脚本幂等）③ 旧偏好已迁移的 group_code（重跑映射脚本出对照表）
 * ④ locale 展示名 ⑤ 设计稿 §3.2。只改常量会让门禁 CG5 与运行时装配双向不一致。
 */

/** 大类码前缀（码域命名空间，与行业面 `UGT-I-*`、品目面 `UGT-C-*` 互不相交） */
export const COMMODITY_GROUP_CODE_PREFIX = "UGT-G-";

/** 大类目标数（口径变更时同步 CG1 与设计稿） */
export const EXPECTED_COMMODITY_GROUP_COUNT = 32;

export interface CommodityGroupDef {
  /** 大类码，对外唯一身份 */
  code: string;
  /** 中文名（运维导出与人工对账；界面展示走 locale） */
  nameZh: string;
  /** 认领的 旧品类段前缀（2 位数字） */
  prefixes: readonly string[];
}

export interface CommodityGroup extends CommodityGroupDef {
  /** 1 起，等于 DEFS 下标 + 1 */
  sort: number;
}

/**
 * 定义顺序即 sort（1 起）：按公告量降序固化，不随每日量漂移。
 * 码号编排纪律：旧 15 类里「主体不变」的那一类保住它原来的码（如 72 段仍为 UGT-G-11），
 * 真正新增的分身才用 UGT-G-16…32。目的是把「同一码换含义」的隐式漂移压到最小，
 * 让段归属变更只发生在业务上真的挪动的段上（影响面报告可逐段核）。
 */
const DEFS: readonly CommodityGroupDef[] = [
  // 下列顺序 = 实测去重公告量降序（2026-10-11 桥表全扫，temp/runtime 影响面报告）
  { code: "UGT-G-11", nameZh: "建筑施工与运维服务", prefixes: ["72"] }, // 49,236（旧 G11 原段沿用）
  { code: "UGT-G-16", nameZh: "工商管理与行政服务", prefixes: ["80"] }, // 38,832（旧 G13 拆出）
  { code: "UGT-G-07", nameZh: "信息与通信技术", prefixes: ["43"] }, // 31,237（旧 G07 主体沿用）
  { code: "UGT-G-14", nameZh: "工程技术与设计研究服务", prefixes: ["81", "82"] }, // 26,985（旧 G14 沿用 + 82）
  { code: "UGT-G-08", nameZh: "医疗器械与耗材", prefixes: ["42"] }, // 26,848（旧 G08 最大段沿用）
  { code: "UGT-G-05", nameZh: "建材与建筑构配件", prefixes: ["30"] }, // 22,018（旧 G05 主体沿用）
  { code: "UGT-G-06", nameZh: "车辆与零部件", prefixes: ["25"] }, // 16,432（旧 G06 原段沿用）
  { code: "UGT-G-12", nameZh: "清洁环境与设施维护", prefixes: ["47", "76", "77"] }, // 13,680（旧 G12 沿用 + 47）
  { code: "UGT-G-17", nameZh: "教育与培训服务", prefixes: ["86"] }, // 12,949（旧 G14 拆出）
  { code: "UGT-G-13", nameZh: "公共行政与社会治理", prefixes: ["83", "93", "94"] }, // 12,729（旧 G13 沿用，80 已拆为 G16）
  { code: "UGT-G-03", nameZh: "工业制造与加工装备", prefixes: ["23", "24", "27", "40", "48"] }, // 12,298（旧 G03 收窄）
  { code: "UGT-G-18", nameZh: "测量测试与实验室仪器", prefixes: ["41"] }, // 11,394（旧 G08 拆出）
  { code: "UGT-G-09", nameZh: "公共安全与应急救援", prefixes: ["46", "57", "92"] }, // 10,072（旧 G09 沿用）
  { code: "UGT-G-19", nameZh: "运输仓储与邮政服务", prefixes: ["78"] }, // 8,960（旧 G15 拆出）
  { code: "UGT-G-21", nameZh: "发电配电与电网设备", prefixes: ["26"] }, // 8,740（旧 G04 拆出）
  { code: "UGT-G-20", nameZh: "办公与印刷影像设备", prefixes: ["44", "45"] }, // 8,725（旧 G07 拆出）
  { code: "UGT-G-01", nameZh: "农林牧渔与农业服务", prefixes: ["10", "70"] }, // 8,571（旧 G01 沿用）
  { code: "UGT-G-22", nameZh: "不动产与市政构筑物", prefixes: ["95"] }, // 7,926（旧 G05 拆出）
  { code: "UGT-G-23", nameZh: "旅游住宿与个人服务", prefixes: ["90", "91"] }, // 7,270（旧 G01 拆出）
  { code: "UGT-G-15", nameZh: "金融与保险", prefixes: ["64", "84"] }, // 6,914（旧 G15 沿用，78 已拆出）
  { code: "UGT-G-02", nameZh: "矿产化工原料与燃料", prefixes: ["11", "12", "13", "15"] }, // 6,884（旧 G02 沿用；14/71 已拆出）
  { code: "UGT-G-24", nameZh: "食品饮料与烟草", prefixes: ["50"] }, // 6,533（旧 G01 拆出）
  { code: "UGT-G-25", nameZh: "医疗与卫生服务", prefixes: ["85"] }, // 6,477（旧 G08 拆出）
  { code: "UGT-G-04", nameZh: "电气照明与家用电器", prefixes: ["39", "52"] }, // 6,242（旧 G04 沿用）
  { code: "UGT-G-28", nameZh: "采矿建筑与农林装备及服务", prefixes: ["20", "21", "22", "71"] }, // 5,579（机械段 + 采掘服务段同属一个供给群体）
  { code: "UGT-G-26", nameZh: "药品与医药制剂", prefixes: ["51"] }, // 5,439（旧 G08 拆出）
  { code: "UGT-G-10", nameZh: "家具与陈设", prefixes: ["56"] }, // 5,396（旧 G10 沿用）
  { code: "UGT-G-27", nameZh: "制造业零部件与电子元器件", prefixes: ["31", "32"] }, // 5,305
  { code: "UGT-G-29", nameZh: "纸品印刷与出版物", prefixes: ["14", "55"] }, // 4,904
  { code: "UGT-G-30", nameZh: "文体娱乐与教育器材", prefixes: ["49", "60"] }, // 4,795（旧 G10 拆出）
  { code: "UGT-G-31", nameZh: "服装纺织与钟表珠宝", prefixes: ["53", "54"] }, // 3,587
  { code: "UGT-G-32", nameZh: "工业生产与代工服务", prefixes: ["73"] }, // 3,293（旧 G03 拆出）
];

/** 派生：带稳定 sort（1 起，等于定义顺序）的 32 个大类 */
export const COMMODITY_GROUPS: readonly CommodityGroup[] = DEFS.map((d, i) => ({ ...d, sort: i + 1 }));

/** 段前缀 → 大类码（每个前缀唯一，故可安全建 Map） */
const GROUP_BY_PREFIX = new Map<string, string>(
  COMMODITY_GROUPS.flatMap((g) => g.prefixes.map((p) => [p, g.code] as const)),
);

/** 派生：全部 58 个段前缀（按码排序，供门禁与灌入脚本使用） */
export const COMMODITY_SEGMENT_PREFIXES: readonly string[] = [
  ...GROUP_BY_PREFIX.keys(),
].sort();

/** 段前缀（两位数字）→ 大类码；形制不符或未认领返回 null（调用方过滤，不兜底） */
export function groupCodeOfSegmentPrefix(prefix: string | null | undefined): string | null {
  const p = String(prefix ?? "");
  return /^[0-9]{2}$/.test(p) ? GROUP_BY_PREFIX.get(p) ?? null : null;
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
  if (groups.length !== EXPECTED_COMMODITY_GROUP_COUNT)
    problems.push(`CG1 大类数应为 ${EXPECTED_COMMODITY_GROUP_COUNT}，实际 ${groups.length}`);

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
