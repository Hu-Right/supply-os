/**
 * 产品 / 行业适用桶（V3 资质裁剪的唯一出处）
 * Product / industry applicability buckets for qualification scoping
 *
 * @module shared/constants/product-scopes
 * @description 认证字典里同一条证书不是所有企业都需要（医疗器械的 MDR 对建筑工程毫无意义），
 *              但字典原本只有「性质 category + 地区 scope」两维，没有「适用产品」这一维，
 *              于是按市场一筛就把该市场所有准入证书全列进应备清单（2026-11-23 实际缺陷）。
 *
 *              这里定义统一的桶：认证挂一个或多个桶，供应商档案推导出自己所属的桶，
 *              两者有交集（或认证挂 `all`）才进应备清单。桶故意保持粗粒度——再细就要靠
 *              行业分类码逐条维护，维护成本会超过收益。
 */
export type ProductScopeCode =
  | "all"
  | "eee"
  | "machinery"
  | "medical"
  | "toys"
  | "food_contact"
  | "chemical"
  | "construction"
  | "textile"
  | "auto"
  | "energy"
  | "oil_gas"
  | "lab"
  | "security"
  | "services";

export interface ProductScopeDef {
  code: ProductScopeCode;
  zh: string;
  en: string;
}

export const PRODUCT_SCOPES: readonly ProductScopeDef[] = [
  { code: "all", zh: "跨行业通用", en: "Cross-industry" },
  { code: "eee", zh: "电气电子与无线", en: "Electrical, electronic & wireless" },
  { code: "machinery", zh: "机械设备与成套装备", en: "Machinery & equipment" },
  { code: "medical", zh: "医疗器械与药品", en: "Medical devices & pharma" },
  { code: "toys", zh: "玩具与儿童用品", en: "Toys & children's products" },
  { code: "food_contact", zh: "食品与食品接触材料", en: "Food & food-contact materials" },
  { code: "chemical", zh: "化学品与危险品", en: "Chemicals & hazardous goods" },
  { code: "construction", zh: "建筑工程与钢结构", en: "Construction & steel structures" },
  { code: "textile", zh: "纺织服装与鞋类", en: "Textiles, apparel & footwear" },
  { code: "auto", zh: "汽车与交通装备", en: "Automotive & transport equipment" },
  { code: "energy", zh: "光伏储能与电力", en: "Solar, storage & power" },
  { code: "oil_gas", zh: "石油天然气", en: "Oil & gas" },
  { code: "lab", zh: "检测校准与实验室", en: "Testing, calibration & labs" },
  { code: "security", zh: "安保与安防", en: "Security & guarding" },
  { code: "services", zh: "服务与贸易", en: "Services & trading" },
] as const;

export const PRODUCT_SCOPE_CODES: readonly string[] = PRODUCT_SCOPES.map((s) => s.code);

const PRODUCT_SCOPE_MAP: Record<string, ProductScopeDef> = Object.fromEntries(
  PRODUCT_SCOPES.map((s) => [s.code, s]),
);

export function productScopeLabel(code: string): ProductScopeDef {
  return PRODUCT_SCOPE_MAP[code] ?? { code: code as ProductScopeCode, zh: code, en: code };
}

/** 归一：只留合法桶、去重、去掉与 `all` 冗余的具体桶 */
export function normalizeProductScopes(raw: readonly unknown[] | string | null | undefined): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,，;；\s]+/);
  const picked = new Set(
    list.map((s) => String(s ?? "").trim().toLowerCase()).filter((s) => PRODUCT_SCOPE_CODES.includes(s)),
  );
  if (picked.has("all")) return ["all"];
  return PRODUCT_SCOPES.filter((s) => picked.has(s.code)).map((s) => s.code);
}

/**
 * 从企业档案推导产品桶（关键词规则，宁缺勿滥）。
 *
 * @description 档案里能用的信号有三种：行业码（UGT，各库口径不一）、`products` 自由文本、
 *              公司名。规则按「强信号优先」排列；一个都命中不了就返回空数组，
 *              调用方据此把结果标成「未识别主营范围」，只比对挂 `all` 的通用项，
 *              并在报告里写明——不猜、不硬塞一个桶。
 */
const KEYWORD_RULES: readonly { scope: ProductScopeCode; words: readonly string[] }[] = [
  { scope: "construction", words: ["建筑", "工程", "施工", "钢结构", "钢构", "市政", "路桥", "装饰", "安装工程", "construction", "engineering", "steel structure", "infrastructure"] },
  { scope: "medical", words: ["医疗", "器械", "诊断", "制药", "药品", "医药", "医院", "medical", "pharma", "device", "diagnostic"] },
  { scope: "toys", words: ["玩具", "儿童", "游乐", "童车", "toys", "toy", "children", "playground"] },
  { scope: "food_contact", words: ["食品", "饮料", "乳", "烘焙", "food", "beverage", "dairy", "food-contact"] },
  { scope: "chemical", words: ["化工", "化学", "涂料", "塑料", "橡胶", "树脂", "危险品", "防爆", "chemical", "coating", "resin", "explosive"] },
  { scope: "textile", words: ["纺织", "服装", "面料", "鞋", "皮革", "箱包", "textile", "apparel", "garment", "footwear", "leather"] },
  { scope: "auto", words: ["汽车", "车辆", "零部件", "轮胎", "车灯", "automotive", "vehicle", "auto part", "tire"] },
  { scope: "energy", words: ["光伏", "组件", "储能", "电池", "风电", "电力", "电站", "solar", "pv", "storage", "battery", "wind", "power plant"] },
  { scope: "oil_gas", words: ["石油", "天然气", "油气", "钻井", "管道", "炼化", "oil", "gas", "petroleum", "pipeline", "drilling"] },
  { scope: "lab", words: ["检测", "校准", "实验室", "检验", "认证服务", "testing", "calibration", "laboratory", "inspection"] },
  { scope: "security", words: ["安保", "保安", "安防", "security", "guarding"] },
  { scope: "machinery", words: ["机械", "设备", "成套", "泵", "阀", "压力容器", "起重", "液压", "机床", "锅炉", "machinery", "equipment", "pump", "valve", "pressure vessel", "crane", "boiler"] },
  { scope: "eee", words: ["电子", "电气", "照明", "灯具", "led", "无线", "电源", "芯片", "家电", "智能", "通信", "电缆", "开关柜", "electronic", "electrical", "lighting", "wireless", "power supply", "semiconductor", "appliance", "cable"] },
  { scope: "services", words: ["服务", "咨询", "物流", "贸易", "劳务", "维修", "运维", "service", "consulting", "logistics", "trading", "maintenance"] },
];

export interface InferProductScopesInput {
  industryCode?: string | null;
  industryName?: string | null;
  products?: string | null;
  company?: string | null;
  /** 能力档案里的品目 / 行业节点名（可选，权重最高） */
  capabilityLabels?: readonly string[] | null;
}

export interface InferredProductScopes {
  scopes: string[];
  /** 命中依据（写进报告，便于解释"为什么只列这几张证"） */
  matchedText: string;
}

export function inferProductScopes(input: InferProductScopesInput): InferredProductScopes {
  const haystack = [
    input.industryName ?? "",
    input.products ?? "",
    (input.capabilityLabels ?? []).join(" "),
    input.company ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const hit: string[] = [];
  const matched: string[] = [];
  for (const rule of KEYWORD_RULES) {
    const found = rule.words.find((w) => haystack.includes(w.toLowerCase()));
    if (found) {
      hit.push(rule.scope);
      matched.push(found);
    }
  }
  return { scopes: normalizeProductScopes(hit), matchedText: matched.join("、") };
}
