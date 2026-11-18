/**
 * 行业（industry）归一 — 受控词表口径（shared 纯函数层）
 * Industry normalization — controlled vocabulary
 *
 * @module shared/utils/industry-section
 * @description 2026-11 自 lib/services/notice-normalize/industry 下沉到 shared：
 *              前端详情页需要把 industry 码/slug 翻译成可读行业名，但 features 不允许
 *              import @/lib 服务端模块；纯词表与映射逻辑放 shared，服务端原模块 re-export 兼容。
 *
 *              服务表 industry 列的受控词表口径（2026-10-30 用户拍板，与国家线同构）：
 *              ① canonical 全集 = 数据实况头部 34 个规范英文值（覆盖 98.7% 行）；
 *              ② 中文同义/英文变体映射到 canonical（车辆→vehicles、healthcare→medical...）；
 *              ③ 词表外（旧字典残码、字母残片、未知新值）一律 NULL——宁缺勿滥，
 *                 新合法标签经巡检清单补词表后自然生效。
 *              消费面：notice_public.industry（无前端直读；行业筛选/画像走行业树 L1 码，
 *              与本列解耦）。巡检：runtime/industry-coverage.sql。
 */

/** canonical 全集（小写）。词表扩展只改这里 + CANONICAL_ALIASES。 */
export const INDUSTRY_CANONICALS = [
  "engineering", "building", "it", "medical", "vehicles", "education", "water",
  "food", "safety", "electrical", "logistics", "furniture", "energy", "printing",
  "laboratory", "general", "agriculture", "telecom", "supplies", "textile",
  "chemicals", "consulting", "machinery", "mining", "environmental", "finance",
  "shelter", "manufacturing", "services", "government", "travel", "sports",
  "other",
] as const;

export type IndustryCanonical = (typeof INDUSTRY_CANONICALS)[number];

const CANONICAL_SET: ReadonlySet<string> = new Set(INDUSTRY_CANONICALS);

/** raw（lower 后）→ canonical。未列出的词表外值由 normalizeIndustry 落 NULL。 */
const CANONICAL_ALIASES: Record<string, IndustryCanonical> = {
  // 中文同义标签（源门户直给中文）
  工程制造: "engineering",
  车辆: "vehicles",
  电气: "electrical",
  实验室: "laboratory",
  建筑: "building",
  未分类: "other",
  化工: "chemicals",
  通信: "telecom",
  物流: "logistics",
  医疗: "medical",
  信息技术: "it",
  食品: "food",
  纺织: "textile",
  农业: "agriculture",
  教育: "education",
  水务: "water",
  家具: "furniture",
  能源: "energy",
  安全: "safety",
  印刷: "printing",
  // 英文变体/同义合并
  automotive: "vehicles",
  security: "safety",
  transport: "logistics",
  utility: "energy",
  healthcare: "medical",
};

const ALIAS_MAP: ReadonlyMap<string, IndustryCanonical> = new Map(
  Object.entries(CANONICAL_ALIASES),
);

/**
 * 行业归一：canonical 全集内原样返回；别名映射到 canonical；词表外（旧字典残码、
 * 字母残片、未知新值）返回 NULL。输入不区分大小写。
 */
export function normalizeIndustry(raw: unknown): IndustryCanonical | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (CANONICAL_SET.has(s)) return s as IndustryCanonical;
  return ALIAS_MAP.get(s) ?? null;
}

/**
 * ── 展示标签（2026-11-18 决策：剔除「采购主题 slug → GB/T 行业门类」桥接）──
 *
 * 背景：`bid_notices.industry` 的 34 个 canonical 值是**采购主题/品类**语义
 * （工程/技术、医疗/卫生、电气/电子…），与 industry_nodes 的 GB/T 行业门类
 * 不是同一套体系；此前 build 用固定表把 slug 硬映射到 UGT-I-xx 门类，
 * 造成「工程咨询→制造业」「医疗设备→卫生和社会工作」等系统性错标，
 * 现彻底移除该桥接：服务表 industry 只存 canonical slug（或 NULL），
 * 展示层按下面的采购类别标签渲染。
 */
export const INDUSTRY_LABELS_ZH: Record<IndustryCanonical, string> = {
  agriculture: "农业/粮食",
  building: "建筑/基础设施",
  chemicals: "化工/材料",
  education: "教育/培训",
  electrical: "电气/电子",
  engineering: "工程/技术",
  food: "食品/营养",
  furniture: "家具/办公",
  it: "信息技术",
  laboratory: "实验室/检测",
  logistics: "物流/仓储",
  medical: "医疗/卫生",
  printing: "印刷/出版",
  safety: "安全/防护",
  shelter: "庇护所/住房",
  textile: "纺织/服装",
  vehicles: "车辆/运输",
  water: "水务/环境",
  other: "其他",
  energy: "能源",
  general: "通用",
  machinery: "机械/设备",
  mining: "采矿/冶金",
  environmental: "环保",
  finance: "金融",
  government: "政府/公共",
  manufacturing: "制造/加工",
  services: "服务",
  supplies: "供应/物资",
  travel: "旅游",
  sports: "体育",
  telecom: "电信",
  consulting: "咨询",
};

export const INDUSTRY_LABELS_EN: Record<IndustryCanonical, string> = {
  agriculture: "Agriculture / Food",
  building: "Building / Infrastructure",
  chemicals: "Chemicals / Materials",
  education: "Education / Training",
  electrical: "Electrical / Electronics",
  engineering: "Engineering / Technical services",
  food: "Food / Nutrition",
  furniture: "Furniture / Office",
  it: "Information technology",
  laboratory: "Laboratory / Testing",
  logistics: "Logistics / Warehousing",
  medical: "Medical / Health",
  printing: "Printing / Publishing",
  safety: "Safety / Protection",
  shelter: "Shelter / Housing",
  textile: "Textile / Apparel",
  vehicles: "Vehicles / Transport",
  water: "Water / Environment",
  other: "Other",
  energy: "Energy",
  general: "General",
  machinery: "Machinery / Equipment",
  mining: "Mining / Metallurgy",
  environmental: "Environmental",
  finance: "Finance",
  government: "Government / Public",
  manufacturing: "Manufacturing",
  services: "Services",
  supplies: "Supplies / Materials",
  travel: "Travel",
  sports: "Sports",
  telecom: "Telecom",
  consulting: "Consulting",
};

/**
 * 行业值 → 展示标签（locale 感知）。
 *
 * - 输入是 canonical slug（服务表新口径）→ 中/英标签；
 * - 历史值（中文同义、英文变体）先 normalize 再取标签；
 * - 词表外/空值 → null（调用方隐藏该行，绝不回退原始编码/乱值）。
 */
export function industryDisplayName(raw: unknown, locale: string): string | null {
  const canonical = normalizeIndustry(raw);
  if (!canonical) return null;
  return locale.toLowerCase().startsWith("zh")
    ? INDUSTRY_LABELS_ZH[canonical]
    : INDUSTRY_LABELS_EN[canonical];
}
