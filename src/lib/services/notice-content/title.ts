/**
 * 公告标题清洗 / 质量判定（纯函数）
 *
 * 目标不是“把标题写得更漂亮”，而是把采集层的明确噪声去掉：
 * - HTML 标签、HTML 实体（&amp; / &quot; / &#160;）
 * - 门户前缀（[LICITANET] 等）
 * - 连续空格、前导空格、前导 :/-/–
 * - 末尾的 ... / …
 *
 * 对“源标题本身就很泛”的（MATERIAL DE CONSUMO / DIVERSOS），
 * 不编造新标题；只给 title_quality=generic，并从正文提取 title_suggested。
 */
export type TitleQuality = "good" | "generic" | "truncated" | "empty";

export interface TitleVerdict {
  raw: string;
  clean: string;
  suggested: string | null;
  quality: TitleQuality;
  source: "source" | "normalized" | "extracted";
  changed: boolean;
}

const PORTAL_PREFIXES = [
  "LICITANET",
  "PNCP",
  "TED",
  "BOAMP",
  "SAM",
  "UNGM",
  "UNDP",
  "UNICEF",
  "TENDERS",
  "ETENDERS",
];

const GENERIC_TITLES = new Set(
  [
    "material de consumo",
    "materiais de consumo",
    "diversos",
    "prestacao de servico",
    "prestação de serviço",
    "prestacao de servicos",
    "prestação de serviços",
    "servicos de manut.veiculos e maquinas",
    "serviços de manutenção",
    "servicos de manutencao",
    "compra por dispensa",
    "aquisicao de materiais diversos",
    "aquisição de materiais diversos",
    "material de limpeza",
    "generico",
    "genérico",
    "otros",
    "servicios",
    "suministros",
    "works",
    "goods",
    "services",
    "supplies",
  ].map((s) => s.toLowerCase()),
);

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function stripPortalPrefix(s: string): string {
  let out = s.trim();
  // [LICITANET] / [TED] 这类门户标签；只删已知标签，避免误删业务方括号
  const m = /^\[([A-Za-z0-9 _-]{2,24})\]\s*/.exec(out);
  if (m && PORTAL_PREFIXES.includes(m[1].toUpperCase())) {
    out = out.slice(m[0].length).trim();
  }
  return out;
}

function stripLeadingPunctuation(s: string): string {
  return s.replace(/^[\s:：\-–—]+/, "").trim();
}

function stripTrailingEllipsis(s: string): { text: string; truncated: boolean } {
  const m = /(\s*\.{3,}|\s*…+)\s*$/.exec(s);
  if (!m) return { text: s, truncated: false };
  return { text: s.slice(0, m.index).trim(), truncated: true };
}

function cleanText(raw: string): { text: string; truncated: boolean } {
  let s = raw ?? "";
  s = decodeEntities(s);
  s = stripHtml(s);
  s = s.replace(/\s+/g, " ").trim();
  s = stripPortalPrefix(s);
  s = stripLeadingPunctuation(s);
  const ell = stripTrailingEllipsis(s);
  s = ell.text.replace(/\s+/g, " ").trim();
  return { text: s, truncated: ell.truncated };
}

/** 正文清洗（对外展示/API 用）：解码实体、去标签、压空白，保留段落换行。 */
export function cleanContentText(raw: unknown): string {
  let s = String(raw ?? "");
  s = decodeEntities(s);
  s = stripHtml(s);
  s = s.replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

function isGeneric(title: string): boolean {
  return GENERIC_TITLES.has(title.toLowerCase().trim());
}

/** 从正文里抽第一句作为候选标题；不改变原意，只做截断 */
function suggestFromBody(body: string | null | undefined): string | null {
  if (!body) return null;
  let s = decodeEntities(stripHtml(body)).replace(/\s+/g, " ").trim();
  if (!s) return null;
  // 去掉“中文:”“Objeto:”这类前缀
  s = s.replace(/^(中文|中文翻译|objeto|object|descripci[oó]n|description)\s*[:：]\s*/i, "");
  const cut = s.split(/(?<=[.!?。！？])\s+/)[0] ?? s;
  const out = cut.length > 160 ? `${cut.slice(0, 157).trimEnd()}...` : cut;
  return out.length >= 15 ? out : null;
}

export function normalizeTitle(raw: string | null | undefined, body?: string | null): TitleVerdict {
  const rawStr = (raw ?? "").trim();
  const { text, truncated } = cleanText(rawStr);
  const changed = text !== rawStr;

  let quality: TitleQuality;
  if (text.length < 3) quality = "empty";
  else if (isGeneric(text)) quality = "generic";
  else if (truncated) quality = "truncated";
  else quality = "good";

  const suggested =
    quality === "generic" || quality === "truncated" ? suggestFromBody(body) : null;

  return {
    raw: rawStr,
    clean: text,
    suggested,
    quality,
    source: changed ? "normalized" : suggested ? "extracted" : "source",
    changed,
  };
}
