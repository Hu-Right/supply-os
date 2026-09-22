/**
 * 来源平台域名映射（统一注册表）
 * Source Platform Domain Registry
 *
 * @module shared/data/sourcePlatforms
 * @description 公告来源链接域名 → 平台显示名的统一映射，替代散落在组件里的
 *              9 项 P0 硬编码。域名清单按生产库活跃公告来源域名分布实测整理
 *              （Top40 覆盖 ≈100%，2026-09-16 核对），并保留历史映射中的
 *              小众平台（UNGM/UNDP/GeM 等）。
 *
 *              匹配规则：host 归一化（小写、去 www.）后先精确匹配，再按
 *              最长后缀匹配兼容子域（如 public.mtender.gov.md →
 *              mtender.gov.md）。未收录域名返回 null，调用方自行回退中性
 *              文案，不做任何猜测编造。
 */

export interface SourcePlatformEntry {
  /** 平台官方简称（各语言通用，如 TED / SAM.gov / PNCP） */
  name: string;
  /** 中文名（zh 环境展示）；缺省时回退 name */
  nameZh?: string;
}

const SOURCE_PLATFORMS: Record<string, SourcePlatformEntry> = {
  // ── 多边机构与国际组织 ──
  "ted.europa.eu": { name: "TED", nameZh: "欧盟招标公告网" },
  "ungm.org": { name: "UNGM", nameZh: "联合国全球市场" },
  "undp.org": { name: "UNDP", nameZh: "联合国开发计划署" },
  "projects.worldbank.org": { name: "World Bank", nameZh: "世界银行" },
  "adb.org": { name: "ADB", nameZh: "亚洲开发银行" },
  "ifad.org": { name: "IFAD", nameZh: "国际农业发展基金" },
  "developmentaid.org": { name: "DevelopmentAid", nameZh: "发展援助平台" },

  // ── 各国政府平台（按活跃公告量降序）──
  "pncp.gov.br": { name: "PNCP", nameZh: "巴西国家采购网" },
  "sam.gov": { name: "SAM.gov", nameZh: "美国联邦采购网" },
  "contrataciondelestado.es": { name: "Contratación del Estado", nameZh: "西班牙国家采购平台" },
  "mercadopublico.cl": { name: "Mercado Público", nameZh: "智利公共采购网" },
  "etenders.gov.za": { name: "eTenders", nameZh: "南非电子招标网" },
  "canadabuys.canada.ca": { name: "CanadaBuys", nameZh: "加拿大政府采购网" },
  "find-tender.service.gov.uk": { name: "Find a Tender", nameZh: "英国招标公告网" },
  "contractsfinder.service.gov.uk": { name: "Contracts Finder", nameZh: "英国合同公告网" },
  "philgeps.gov.ph": { name: "PhilGEPS", nameZh: "菲律宾政府采购网" },
  "ezamowienia.gov.pl": { name: "eZamowienia", nameZh: "波兰电子采购网" },
  "tenderned.nl": { name: "Tenderned", nameZh: "荷兰招标平台" },
  "eprocure.gov.in": { name: "eprocure.gov.in", nameZh: "印度电子采购网" },
  "jnportal.ujn.gov.rs": { name: "UJP Portal", nameZh: "塞尔维亚采购门户" },
  "egp.praz.org.zw": { name: "PRAZ EGP", nameZh: "津巴布韦电子采购网" },
  "ejn.gov.ba": { name: "EJN", nameZh: "波黑电子采购网" },
  "procurement.gov.ge": { name: "Ge-GP", nameZh: "格鲁吉亚电子采购网" },
  "butb.by": { name: "BUTB", nameZh: "白俄罗斯商品交易所" },
  "tender.gov.mn": { name: "tender.gov.mn", nameZh: "蒙古政府采购网" },
  "gebiz.gov.sg": { name: "GeBIZ", nameZh: "新加坡政府采购网" },
  "mtender.gov.md": { name: "MTender", nameZh: "摩尔多瓦电子采购网" },
  "gprocurement.go.th": { name: "Thai e-GP", nameZh: "泰国政府采购网" },
  "enarocanje.si": { name: "eNarocanje", nameZh: "斯洛文尼亚电子采购网" },
  "ekr.gov.hu": { name: "EKR", nameZh: "匈牙利统一采购系统" },
  "bcbid.gov.bc.ca": { name: "BC Bid", nameZh: "加拿大BC省招标网" },
  "comprar.gob.ar": { name: "Comprar", nameZh: "阿根廷国家采购网" },
  "gets.govt.nz": { name: "GETS", nameZh: "新西兰政府采购网" },
  "cejn.gov.me": { name: "EJN Montenegro", nameZh: "黑山电子采购网" },
  "zakupki.rosatom.ru": { name: "Rosatom Zakupki", nameZh: "俄原子能集团采购网" },
  "zakupki.gov.kg": { name: "zakupki.gov.kg", nameZh: "吉尔吉斯斯坦采购网" },
  "tektorg.ru": { name: "TEKTORG", nameZh: "俄罗斯电子交易平台" },
  "eprocurement.gov.cy": { name: "eprocurement.gov.cy", nameZh: "塞浦路斯电子采购网" },
  "umucyo.gov.rw": { name: "Umucyo", nameZh: "卢旺达电子采购网" },
  "eprocurement.gov.tj": { name: "eprocurement.gov.tj", nameZh: "塔吉克斯坦电子采购网" },
  "mr.gov.il": { name: "mr.gov.il", nameZh: "以色列政府采购网" },

  // ── 历史映射保留（当前量小，但为已知采购平台）──
  "etimad.sa": { name: "Etimad", nameZh: "沙特采购门户" },
  "gem.gov.in": { name: "GeM", nameZh: "印度政府采购市场" },
  "compranet.gob.mx": { name: "CompraNet", nameZh: "墨西哥采购网" },
  "nupco.com": { name: "NUPCO", nameZh: "沙特国家采购公司" },
  "seha.ae": { name: "Seha" },
};

/** host 归一化：小写、去 www. 前缀 */
function normalizeHost(sourceUrl: string): string | null {
  try {
    let host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/**
 * 匹配来源平台：host 精确匹配优先，再按最长后缀匹配兼容子域。
 * @returns 未收录域名返回 null，调用方自行回退中性文案
 */
export function matchSourcePlatform(sourceUrl: string | undefined | null): SourcePlatformEntry | null {
  if (!sourceUrl) return null;
  const host = normalizeHost(sourceUrl);
  if (!host) return null;
  if (SOURCE_PLATFORMS[host]) return SOURCE_PLATFORMS[host];
  let best: SourcePlatformEntry | null = null;
  let bestLen = 0;
  for (const [key, entry] of Object.entries(SOURCE_PLATFORMS)) {
    if (host.endsWith("." + key) && key.length > bestLen) {
      best = entry;
      bestLen = key.length;
    }
  }
  return best;
}

/**
 * 获取来源平台显示名。
 * 非 zh 语言返回官方简称（缩写各语言通用，与国家映射非 zh 回退原文的口径一致）；
 * zh 返回「中文名（简称）」，中文名缺省时仅返回简称。
 * @returns 未收录域名返回空串，调用方自行回退中性文案
 */
export function getSourcePlatformName(sourceUrl: string | undefined | null, locale: string): string {
  const entry = matchSourcePlatform(sourceUrl);
  if (!entry) return "";
  if (locale !== "zh") return entry.name;
  const nameZh = entry.nameZh || entry.name;
  return nameZh === entry.name ? entry.name : nameZh + "（" + entry.name + "）";
}
