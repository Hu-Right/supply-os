/**
 * 行业（industry）归一 — 受控词表口径
 * Industry normalization — controlled vocabulary
 *
 * @module server/services/notice-normalize/industry
 * @description 服务表 industry 列的受控词表口径（2026-10-30 用户拍板，与国家线同构）：
 *              ① canonical 全集 = 数据实况头部 34 个规范英文值（覆盖 98.7% 行）；
 *              ② 中文同义/英文变体映射到 canonical（车辆→vehicles、healthcare→medical...）；
 *              ③ 词表外（UNSPSC 残码、字母残片、未知新值）一律 NULL——宁缺勿滥，
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
 * 行业归一：canonical 全集内原样返回；别名映射到 canonical；词表外（UNSPSC 残码、
 * 字母残片、未知新值）返回 NULL。输入不区分大小写。
 */
export function normalizeIndustry(raw: unknown): IndustryCanonical | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (CANONICAL_SET.has(s)) return s as IndustryCanonical;
  return ALIAS_MAP.get(s) ?? null;
}

/**
 * 公告行业值 → 自建行业树 UGT-I 门类码（L1）。
 * 只做能确定的门类挂靠；不按关键词猜细分，避免假精度。
 */
const INDUSTRY_TREE_SECTION: Record<IndustryCanonical, string | null> = {
  agriculture: "UGT-I-01",
  mining: "UGT-I-02",
  manufacturing: "UGT-I-03",
  engineering: "UGT-I-03",
  electrical: "UGT-I-03",
  machinery: "UGT-I-03",
  furniture: "UGT-I-03",
  printing: "UGT-I-03",
  textile: "UGT-I-03",
  chemicals: "UGT-I-03",
  food: "UGT-I-03",
  energy: "UGT-I-04",
  building: "UGT-I-05",
  shelter: "UGT-I-05",
  vehicles: "UGT-I-06",
  supplies: "UGT-I-06",
  logistics: "UGT-I-07",
  travel: "UGT-I-08",
  it: "UGT-I-09",
  telecom: "UGT-I-09",
  finance: "UGT-I-10",
  consulting: "UGT-I-13",
  laboratory: "UGT-I-13",
  water: "UGT-I-14",
  environmental: "UGT-I-14",
  services: "UGT-I-15",
  education: "UGT-I-16",
  medical: "UGT-I-17",
  sports: "UGT-I-18",
  safety: "UGT-I-19",
  government: "UGT-I-19",
  general: null,
  other: null,
};

export function industryTreeSection(raw: unknown): string | null {
  const canonical = normalizeIndustry(raw);
  return canonical ? INDUSTRY_TREE_SECTION[canonical] : null;
}
