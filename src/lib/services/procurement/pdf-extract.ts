/**
 * 需求 PDF 提取（F02：根据上传的 PDF 提取需求信息，结果须由采购方逐项确认）
 * @module lib/services/procurement/pdf-extract
 *
 * @description 两段式：
 *              ① `extractPdfText` 用 pdf-parse 取文本（页数/字符数设上限，防大文件拖垮接口）；
 *              ② `extractRequirementFields` 用可解释的规则抽取标题/背景/用途/标准/交付/截止/
 *                 预算/币种/明细，并给每条结果附「来源行」——不产黑箱结果，前端逐项勾选确认后
 *                 才写入需求。规则抽取可离线运行，不依赖采购方是否配置 LLM。
 */
import { PDFParse } from "pdf-parse";

const MAX_CHARS = 20_000;
const MAX_PAGES = 30;

export interface ExtractedItem {
  nameZh: string;
  spec: string;
  quantity: number | null;
  qtyUnit: string;
}

export interface ExtractedRequirement {
  titleZh: string;
  background: string;
  usageEnv: string;
  standards: string;
  deliveryCountry: string;
  deliveryCity: string;
  deliveryAddress: string;
  quoteDeadlineDate: string;
  budgetAmount: string;
  budgetCurrency: string;
  items: ExtractedItem[];
  /** 每个字段的来源行（逐项确认时展示依据） */
  sources: Record<string, string>;
}

const UNIT = "套|台|个|件|把|张|批|吨|米|平方米|平米|组|辆|艘|架|箱|包|卷|pcs|sets|units|set|unit";

const ITEM_LINE = new RegExp(
  `^(?:\\d{1,3}[.、)]\\s*)?(.{1,60}?)\\s*(?:[|\\t]|\\s{2,})\\s*(.{0,80}?)\\s*(?:[|\\t]|\\s{2,})\\s*([\\d,]+(?:\\.\\d+)?)\\s*(${UNIT})\\s*$`,
  "i",
);

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseAmount(raw: string): string {
  return raw.replace(/[,，\s]/g, "");
}

function normalizeDate(y: string, m: string, d: string): string {
  const mm = String(Number(m)).padStart(2, "0");
  const dd = String(Number(d)).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** PDF → 文本（页数/字符上限；解析失败抛错） */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: MAX_PAGES });
    return String(result.text ?? "").slice(0, MAX_CHARS);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** 文本 → 需求字段（规则抽取，带来源行） */
export function extractRequirementFields(text: string): ExtractedRequirement {
  const lines = text
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l.length > 0);
  const out: ExtractedRequirement = {
    titleZh: "",
    background: "",
    usageEnv: "",
    standards: "",
    deliveryCountry: "",
    deliveryCity: "",
    deliveryAddress: "",
    quoteDeadlineDate: "",
    budgetAmount: "",
    budgetCurrency: "",
    items: [],
    sources: {},
  };
  const set = (key: keyof ExtractedRequirement, value: string, source: string) => {
    if (!value) return;
    (out[key] as string) = value;
    out.sources[key] = source.slice(0, 200);
  };

  // 标题：首个 4–100 字的行（跳过"采购文件/招标文件"等泛标题）
  const titleLine = lines.find(
    (l) => l.length >= 4 && l.length <= 100 && !/^(采购文件|招标文件|询价文件|需求文件)$/.test(l),
  );
  if (titleLine) set("titleZh", titleLine, titleLine);

  // 背景/目的
  const bgLine = lines.find((l) => /(项目背景|采购背景|采购目的|项目概况|背景介绍)/.test(l));
  if (bgLine) {
    const inline = bgLine.split(/[:：]/).slice(1).join("：").trim();
    set("background", inline || bgLine, bgLine);
  }

  // 用途/使用环境
  const usageLine = lines.find((l) => /(用途|使用环境|应用场景)/.test(l) && l.length >= 6);
  if (usageLine) set("usageEnv", usageLine.split(/[:：]/).slice(1).join("：").trim() || usageLine, usageLine);

  // 强制标准/认证
  const stdLine = lines.find((l) => /(ISO\s?\d|IEC\s?\d|CE\s?认证|GB\/T|EN\s?\d|强制性标准|认证要求)/i.test(l));
  if (stdLine) set("standards", stdLine, stdLine);

  // 交付地：优先「交货地点/交付地点/目的地」，其次 国家+城市
  const deliveryLine = lines.find((l) => /(交货地点|交付地点|目的地|送货地址|delivery\s*(to|address))/i.test(l));
  if (deliveryLine) {
    const value = deliveryLine.split(/[:：]/).slice(1).join("：").trim() || deliveryLine;
    set("deliveryAddress", value, deliveryLine);
    const parts = value.split(/[，,、\s]+/).filter(Boolean);
    if (parts[0]) set("deliveryCountry", parts[0], deliveryLine);
    if (parts[1]) set("deliveryCity", parts[1], deliveryLine);
  }

  // 报价/投标截止
  const deadlineLine = lines.find((l) => /(报价截止|投标截止|截止时间|递交截止|deadline)/i.test(l));
  const dateMatch = (deadlineLine ?? text).match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (dateMatch) set("quoteDeadlineDate", normalizeDate(dateMatch[1], dateMatch[2], dateMatch[3]), deadlineLine ?? dateMatch[0]);

  // 预算
  const budgetLine = lines.find((l) => /(预算|采购金额|合同估算价|budget)/i.test(l));
  const amountMatch = (budgetLine ?? text).match(/(?:预算|金额|budget)[^\d]{0,12}([\d,]+(?:\.\d+)?)/i);
  if (amountMatch) set("budgetAmount", parseAmount(amountMatch[1]), budgetLine ?? amountMatch[0]);

  // 币种
  if (/USD|美元|\$/i.test(text)) out.budgetCurrency = "USD";
  else if (/EUR|欧元|€/i.test(text)) out.budgetCurrency = "EUR";
  else if (/CNY|人民币|元|￥/i.test(text)) out.budgetCurrency = "CNY";

  // 明细：按「名称 规格 数量 单位」行解析，去重
  // 注意：这里必须用未折叠空白的原始行——cleaned 行把连续空格压成 1 个，会丢失列分隔信号
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const seen = new Set<string>();
  for (const line of rawLines) {
    const m = line.match(ITEM_LINE);
    if (!m) continue;
    const nameZh = clean(m[1]).replace(/[.、]$/, "");
    if (!nameZh || nameZh.length < 2) continue;
    const key = `${nameZh}|${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.items.push({
      nameZh,
      spec: clean(m[2]),
      quantity: Number(parseAmount(m[3])) || null,
      qtyUnit: m[4],
    });
    out.sources[`item.${out.items.length - 1}`] = line.slice(0, 200);
    if (out.items.length >= 100) break;
  }

  return out;
}
