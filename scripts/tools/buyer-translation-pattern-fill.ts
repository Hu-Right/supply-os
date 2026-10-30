/**
 * 规则层批量中文翻译落表：把**严格形状的确定性规则**产物喂给 buyer_translation，
 * 覆盖 notice_public 空 buyer_name_cn 的公式化买家名长尾。
 *
 * 为什么不用 translateByPattern 全量输出：抽样审计发现其部分规则产物是机械拼接夹生名
 * （FUNDO MUNICIPAL DE SAUDE DE X → "市政SAUDE DE X基金"、SAM 倒装名 "STATE, DEPARTMENT OF"
 * → "STATE等联合"、UN 全名 → "联合国INTERNATIONAL ..."），不符合「买家名称必须真实」
 * 的用户真理（2026-10-30）。本脚本只收两类：
 *   A. 内置严格形状规则（v2 扩族）：类型词译中走词表（未收录→跳过）、地名/专名保留原文
 *      （合成式，家规允许："TARUMA市"）；菲律宾省市走白名单（省名带标准中文）；
 *   B. KNOWN_ACRONYMS 精确命中（人工策展的缩写表，如 UNDP/ILO/UNESCO）；
 *   C. 其余一律跳过，留给人工批次——宁缺毋假。
 *
 * 写入：buyer_key = SHA2(UPPER(TRIM(buyer_name)), 256)，INSERT ... ON DUPLICATE KEY UPDATE。
 *      插入前删除**同名裸串键旧行**（老灌表短名用名字本形当键，双行会让构建 Map
 *      后写覆盖先写随机输赢），删除前备份 TSV。
 *
 * 用法（服务器 /root/supply-os 下）：
 *   npx tsx scripts/tools/buyer-translation-pattern-fill.ts                     # DRY：只统计+导出
 *   npx tsx scripts/tools/buyer-translation-pattern-fill.ts --dump /tmp/fill.tsv # DRY + 导出名单
 *   npx tsx scripts/tools/buyer-translation-pattern-fill.ts --apply             # 备份+去重+落表
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { KNOWN_ACRONYMS } from "../../src/lib/data/agency-i18n/known-acronyms";

const APPLY = process.argv.includes("--apply");
const dumpIdx = process.argv.indexOf("--dump");
const DUMP_FILE = dumpIdx >= 0 ? process.argv[dumpIdx + 1] : null;
const INSERT_CHUNK = 500;
const CJK_RE = /[\u4e00-\u9fff]/;

/** 垃圾名过滤：爬虫错误页/URL/纯数字/控制字符/超长——这些不是买家名，不进翻译表 */
function isJunk(s: string): boolean {
  if (s.length > 300 || s.length < 2) return true;
  if (/[\u0000-\u0008\u000e-\u001f]/.test(s)) return true;
  if (/^error \d+/i.test(s) || /server error/i.test(s)) return true;
  if (/https?:\/\//i.test(s) || /www\./i.test(s)) return true;
  if (/^\d+([.,]\d+)?$/.test(s)) return true;
  return false;
}

/** 尾部机构缩写后缀（"SECRETARIA DE ESTADO DA CULTURA - SECMA" 的 " - SECMA"）：仅用于匹配，zh 不含 */
function stripTrailingAcronymSuffix(s: string): string {
  return s.replace(/\s+[-–—]\s*[A-Z0-9]{2,10}$/i, "").trim();
}

/* ───────────────────────── 菲律宾省市白名单 ───────────────────────── */
// 省名 → 标准中文（菲律宾 27 省高频集 + 大马尼拉；白名单外 → 规则不适用，留人工）
const PH_PROV_ZH: Record<string, string> = {
  ABRA: "阿布拉", "AGUSAN DEL NORTE": "北阿古桑", "AGUSAN DEL SUR": "南阿古桑",
  AKLAN: "阿克兰", ALBAY: "阿尔拜", ANTIQUE: "安蒂克", APAYAO: "阿巴尧",
  AURORA: "奥罗拉", BASILAN: "巴西兰", BATAAN: "巴丹", BATANGAS: "八打雁",
  BATANES: "巴丹群岛", BENGUET: "本格特", BILIRAN: "比利兰", BOHOL: "薄荷",
  BUKIDNON: "布基农", BULACAN: "布拉干", CAGAYAN: "卡加延", "CAMARINES NORTE": "北甘马仁",
  "CAMARINES SUR": "南甘马仁", CAMIGUIN: "卡米金", CAPIZ: "卡皮斯", CATANDUANES: "卡坦端内斯",
  CAVITE: "甲米地", CEBU: "宿务", "COMPOSTELA VALLEY": "康波斯特拉谷",
  COTABATO: "哥打巴托", "DAVAO DE ORO": "金达沃", "DAVAO DEL SUR": "南达沃",
  "DAVAO ORIENTAL": "东达沃", "EASTERN SAMAR": "东萨马", GUIMARAS: "吉马拉斯",
  IFUGAO: "伊富高", "ILOCOS NORTE": "北伊罗戈", "ILOCOS SUR": "南伊罗戈",
  ILOILO: "伊洛伊洛", ISABELA: "伊莎贝拉", KALINGA: "卡林加", "LA UNION": "拉乌尼翁",
  LAGUNA: "内湖", "LANAO DEL NORTE": "北拉瑙", "LANAO DEL SUR": "南拉瑙",
  LEYTE: "莱特", MAGUINDANAO: "马京达瑙", MARINDUQUE: "马林杜克", MASBATE: "马斯巴特",
  "MISAMIS OCCIDENTAL": "西米萨米斯", "MISAMIS ORIENTAL": "东米萨米斯",
  "MOUNTAIN PROVINCE": "山省", "NEGROS OCCIDENTAL": "西内格罗斯", "NEGROS ORIENTAL": "东内格罗斯",
  "NORTH COTABATO": "北哥打巴托", "NUEVA ECIJA": "新怡诗夏", "NUEVA VIZCAYA": "新比斯开",
  "OCCIDENTAL MINDORO": "西民都洛", "ORIENTAL MINDORO": "东民都洛", PALAWAN: "巴拉望",
  PAMPANGA: "邦板牙", PANGASINAN: "邦阿西楠", QUIRINO: "基里诺", RIZAL: "黎刹",
  ROMBLON: "朗布隆", SAMAR: "萨马", SARANGANI: "萨兰加尼", SIQUIJOR: "锡基霍尔",
  SORSOGON: "索索贡", "SOUTH COTABATO": "南哥打巴托", "SOUTHERN LEYTE": "南莱特",
  "SULTAN KUDARAT": "苏丹库达拉", "SURIGAO DEL NORTE": "北苏里高", "SURIGAO DEL SUR": "南苏里高",
  "ZAMBOANGA DEL NORTE": "北三宝颜", "ZAMBOANGA DEL SUR": "南三宝颜",
  "ZAMBOANGA SIBUGAY": "三宝颜锡布盖", "METRO MANILA": "大马尼拉", NCR: "国家首都区",
};
// PH 大区（DEPARTMENT OF X - REGION / CENTER FOR HEALTH DEVELOPMENT 系列）
const PH_REGION_ZH: Record<string, string> = {
  BICOL: "比科尔", CALABARZON: "卡拉巴松", CARAGA: "卡拉加", "CENTRAL LUZON": "中吕宋",
  "CENTRAL VISAYAS": "中米沙鄢", "CAGAYAN VALLEY": "卡加延谷", "CORDILLERA ADMINISTRATIVE REGION": "科迪勒拉",
  CORDILLERA: "科迪勒拉", "DAVAO REGION": "达沃", DAVAO: "达沃", "EASTERN VISAYAS": "东米沙鄢",
  "ILOCOS REGION": "伊罗戈", ILOCOS: "伊罗戈", MIMAROPA: "米马罗帕",
  "NORTHERN MINDANAO": "北棉兰老", "SOUTHERN MINDANAO": "南棉兰老",
  SOCCSKSARGEN: "索克克萨尔根", "WESTERN VISAYAS": "西米沙鄢",
  BARMM: "邦萨摩洛", "NATIONAL CAPITAL REGION": "国家首都区",
};
// PH 大区罗马数字/阿拉伯数字 → 中文序数
const ROMAN_ZH: Record<string, string> = {
  I: "一", II: "二", III: "三", IV: "四", V: "五", VI: "六", VII: "七", VIII: "八",
  IX: "九", X: "十", XI: "十一", XII: "十二", XIII: "十三", XIV: "十四",
};
const ARAB_ZH: Record<string, string> = {
  "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七",
  "8": "八", "9": "九", "10": "十", "11": "十一", "12": "十二", "13": "十三",
  "14": "十四", "15": "十五", "16": "十六", "17": "十七", "18": "十八",
};
const ORDINAL_ZH: Record<string, string> = {
  FIRST: "一", SECOND: "二", THIRD: "三", FOURTH: "四", FIFTH: "五", SIXTH: "六",
  SEVENTH: "七", EIGHTH: "八",
  "1ST": "一", "2ND": "二", "3RD": "三", "4TH": "四", "5TH": "五", "6TH": "六", "7TH": "七",
};

/** 地名段校验：字母（含带音符）/数字/常见标点 */
const PLACE_OK = /^[A-ZÀ-ÿ0-9 .,'()&-]+$/i;
const LATIN_OK = /^[A-Za-zÀ-ÿ0-9 .,'()&-]+$/;

/** 巴西市政厅局/基金类型词 → 中文（未收录 → 跳过，宁缺毋假） */
const TYPE_ZH: Record<string, string> = {
  SAUDE: "卫生", "SAÚDE": "卫生", EDUCACAO: "教育", "EDUCAÇÃO": "教育",
  CULTURA: "文化", ESPORTE: "体育", "MEIO AMBIENTE": "环境",
  "ASSISTENCIA SOCIAL": "社会救助", "ASSISTÊNCIA SOCIAL": "社会救助",
  TURISMO: "旅游", AGRICULTURA: "农业", FINANCAS: "财政", "FINANÇAS": "财政",
  FAZENDA: "财政", OBRAS: "工程", HABITACAO: "住房", "HABITAÇÃO": "住房",
  "INDUSTRIA E COMERCIO": "工商业", "CIENCIA E TECNOLOGIA": "科技",
  "CIÊNCIA E TECNOLOGIA": "科技", TRANSPORTES: "交通", TRABALHO: "劳动",
  PLANEJAMENTO: "规划", JUSTICA: "司法", "JUSTIÇA": "司法",
  "SEGURANCA PUBLICA": "公共安全", "SEGURANÇA PÚBLICA": "公共安全",
  "DESENVOLVIMENTO SOCIAL": "社会发展", "PROMOCAO SOCIAL": "社会促进",
  "DESENVOLVIMENTO ECONOMICO": "经济发展", "DESENVOLVIMENTO URBANO": "城市发展",
  "SERVICOS URBANOS": "城市服务", "SERVIÇOS URBANOS": "城市服务",
  "POLITICAS SOCIAIS": "社会政策", "DIREITOS HUMANOS": "人权",
  "COMUNICACAO SOCIAL": "新闻传播", GOVERNO: "政府", GABINETE: "内阁",
};

/** BR 州名 → 中文（CONSELHO/TRIBUNAL/MINISTERIO PUBLICO 系列用） */
const BR_STATE_ZH: Record<string, string> = {
  ACRE: "阿克里", ALAGOAS: "阿拉戈斯", AMAPA: "阿马帕", AMAZONAS: "亚马孙",
  BAHIA: "巴伊亚", CEARA: "塞阿拉", "DISTRITO FEDERAL": "联邦区",
  "ESPIRITO SANTO": "圣埃斯皮里图", GOIAS: "戈亚斯", "MATO GROSSO": "马托格罗索",
  "MATO GROSSO DO SUL": "南马托格罗索", "MINAS GERAIS": "米纳斯吉拉斯", PARA: "帕拉",
  PARAIBA: "帕拉伊巴", PARANA: "巴拉那", PERNAMBUCO: "伯南布哥", PIAUI: "皮奥伊",
  "RIO DE JANEIRO": "里约热内卢", "RIO GRANDE DO NORTE": "北里奥格兰德",
  "RIO GRANDE DO SUL": "南里奥格兰德", RONDONIA: "朗多尼亚", RORAIMA: "罗赖马",
  "SANTA CATARINA": "圣卡塔琳娜", "SAO PAULO": "圣保罗", SERGIPE: "塞尔希培",
  TOCANTINS: "托坎廷斯",
};
/** BR 职业监管委员会专业词 → 中文 */
const BR_COUNCIL_ZH: Record<string, string> = {
  MEDICINA: "医学", ODONTOLOGIA: "牙科", CONTABILIDADE: "会计", PSICOLOGIA: "心理学",
  "EDUCACAO FISICA": "体育", "SERVICO SOCIAL": "社会服务", ENFERMAGEM: "护理",
  FARMACIA: "药学", AGRONOMIA: "农学", "ENGENHARIA E AGRONOMIA": "工程与农学",
  VETERINARIA: "兽医", "CORRETORES DE IMOVEIS": "房地产经纪", REPRESENTACAO_COMERCIAL: "商业代理",
};
/** BR 市政基金会/厅局类型词表见 TYPE_ZH；PH 部委局词表 */
const PH_BUREAU_ZH: Record<string, string> = {
  "FISHERIES AND AQUATIC RESOURCES": "渔业与水产资源", "PLANT INDUSTRY": "植物产业",
  TREASURY: "国库", "INTERNAL REVENUE": "国内税务", CUSTOMS: "海关",
  IMMIGRATION: "移民", "FIRE PROTECTION": "消防",
  "JAIL MANAGEMENT AND PENOLOGY": "监狱管理", SOILS: "土壤",
  "AGRICULTURAL TRAINING INSTITUTE": "农业培训院",
};

function splitTypePlace(middle: string): { type: string; place: string | null } | null {
  // middle 形如 "SAUDE DE VILA PROPICIO"（类型 + DE + 地名）或 "SAUDE"（纯类型）
  const m = middle.match(/^(.+?)\s+(?:DE|DO|DA)\s+(.+)$/i);
  if (!m) return { type: middle.trim().toUpperCase(), place: null };
  const type = m[1].trim().toUpperCase();
  const place = m[2].trim().replace(/\s+/g, " ");
  if (!place || !PLACE_OK.test(place)) return null;
  return { type, place };
}

function typeZh(type: string): string | null {
  return Object.prototype.hasOwnProperty.call(TYPE_ZH, type) ? TYPE_ZH[type] : null;
}

/** 剥掉尾部 " - 第N区"（CONSELHO ... - 7 REGIAO）*/
function stripRegiaoSuffix(s: string): string {
  return s.replace(/\s+[-–—]\s*(?:[A-ZÀ-ÿ0-9]+\s+)?REGIAO\s*$/i, "").trim();
}

/** "MUNICIPALITY OF <镇> <省>" / "CITY OF <镇> <省>"：省在白名单尾部命中则拆出 */
function phTownProv(restUpper: string): { town: string; provZh: string } | null {
  const keys = Object.keys(PH_PROV_ZH).sort((a, b) => b.length - a.length);
  for (const prov of keys) {
    if (restUpper === prov) return null; // 纯省名走 PROVINCE OF 语义
    if (restUpper.endsWith(" " + prov)) {
      const town = restUpper.slice(0, restUpper.length - prov.length - 1).trim();
      if (town && PLACE_OK.test(town)) return { town, provZh: PH_PROV_ZH[prov] };
    }
  }
  return null;
}

/** PH "DEPARTMENT OF <X> - REGION <N>" 家族 */
function phDeptRegion(raw: string): string | null {
  const DEPTS: Record<string, string> = {
    "DEPARTMENT OF AGRICULTURE": "农业部",
    "DEPARTMENT OF HEALTH": "卫生部",
    "DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT": "社会福利与发展部",
    "DEPARTMENT OF LABOR AND EMPLOYMENT": "劳工与就业部",
    "DEPARTMENT OF TRADE AND INDUSTRY": "贸易与工业部",
    "DEPARTMENT OF TRANSPORTATION": "交通部",
    "DEPARTMENT OF EDUCATION": "教育部",
    "DEPARTMENT OF AGRARIAN REFORM": "土地改革部",
    "DEPARTMENT OF SCIENCE AND TECHNOLOGY": "科学技术部",
    "DEPARTMENT OF TOURISM": "旅游部",
    "DEPARTMENT OF ENERGY": "能源部",
  };
  const m = raw.match(/^(.+?)\s*[-–—]?\s*REGION\s+([IVX]+(?:\s?[-–]\s?[AB])?|[0-9]+)\s*$/i);
  if (!m) return null;
  const dept = m[1].trim().toUpperCase().replace(/\s+/g, " ");
  const zh = Object.prototype.hasOwnProperty.call(DEPTS, dept) ? DEPTS[dept] : null;
  if (!zh) return null;
  const numKey = m[2].replace(/\s|[-–]/g, "").toUpperCase();
  const ord = ROMAN_ZH[numKey] ?? ARAB_ZH[numKey];
  if (!ord) return null;
  return `${zh}第${ord}大区`;
}

/** PH 公造部/公共工程部区工程办公室家族（DPWH / MPW / MINISTRY OF PUBLIC WORKS） */
function phDpwh(raw: string): string | null {
  const m = raw.match(/^(DEPARTMENT OF PUBLIC WORKS AND HIGHWAYS|DPWH|MPW)\s*[-–]?\s*(.+)$/i);
  if (!m) return null;
  const prefix = /^MPW$/i.test(m[1]) || /^MINISTRY/i.test(m[1]) ? "公共工程部" : "公造部";
  let inner = m[2].trim().toUpperCase().replace(/\s+/g, " ");
  // 取主段（" - 地名" 的尾注丢弃）
  inner = inner.split(/\s+[-–]\s*/)[0].trim();
  // REGION 形："REGION VI" / "REGION IV-B"
  const rm = inner.match(/^REGION\s+([IVX]+(?:-?[AB])?)$/);
  if (rm) {
    const ord = ROMAN_ZH[rm[1].replace("-", "")];
    return ord ? `${prefix}第${ord}大区办公室` : null;
  }
  // 展开括注："COTABATO CITY (DEO)" → "COTABATO CITY"
  inner = inner.replace(/\s*\((?:DEO|ED|DISTRICT ENGINEERING OFFICE)\)\s*$/, "").trim();
  const toks = inner.split(/\s+/);
  let ordZh: string | null = null;
  const rest: string[] = [];
  for (const t of toks) {
    const up = t.toUpperCase();
    if (ORDINAL_ZH[up] && rest.length > 0) { ordZh = ORDINAL_ZH[up]; continue; }
    if (/^(?:DEO|ED|DISTRICT|ENGINEERING|OFFICE)$/i.test(t)) continue;
    // 孤立罗马数字（如 "BATANGAS I DISTRICT..."）：仅在有工程办词尾时视为序数
    if (/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(t) && ordZh === null && rest.length > 0) {
      const restJoined = rest.join(" ");
      if (/DISTRICT|ENGINEERING|OFFICE|DEO|ED$/i.test(inner.slice(inner.indexOf(restJoined)))) {
        ordZh = ROMAN_ZH[up]; continue;
      }
    }
    rest.push(t);
  }
  const place = rest.join(" ").trim();
  if (!place) return null;
  const prov = PH_PROV_ZH[place];
  if (!prov) return null;
  return ordZh ? `${prefix}${prov}第${ordZh}区工程办公室` : `${prefix}${prov}区工程办公室`;
}

/**
 * 严格形状规则 v2：每条都保证 rest 语义干净（类型词/地名/白名单省名），产出合成式中文。
 * 返回 null = 不适用（外层跳过留人工）。
 */
function shapeZh(raw: string): string | null {
  const s0 = raw.trim();
  const s = stripTrailingAcronymSuffix(s0);

  let m: RegExpMatchArray | null;
  /* ── PH 家族 ── */
  if ((m = s.match(/^DEPARTMENT OF EDUCATION\s*[-–—]?\s*(.+)$/i))) {
    const inner = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    if (inner === "MAIN") return "菲律宾教育部本部";
    if (inner === "") return "菲律宾教育部";
    const rm = inner.match(/^REGION\s+([IVX]+(?:-?[AB])?|[0-9]+)$/);
    if (rm) {
      const ord = ROMAN_ZH[rm[1].replace("-", "")] ?? ARAB_ZH[rm[1]];
      if (ord) return `菲律宾教育部第${ord}大区`;
      return null;
    }
    const dm = inner.match(/^DIVISION OF\s+(.+)$/);
    if (dm) {
      const place = dm[1].trim().replace(/\s+/g, " ");
      const provZh = PH_PROV_ZH[place.toUpperCase()];
      if (provZh) return `菲律宾教育部${provZh}分局`;
      if (PLACE_OK.test(place)) return `菲律宾教育部${place}分局`;
      return null;
    }
    return null;
  }
  if ((m = s.match(/^CENTER FOR HEALTH DEVELOPMENT\s*[-–—]\s*REGION\s+([IVX]+|[0-9]+)\s*$/i))) {
    const ord = ROMAN_ZH[m[1]] ?? ARAB_ZH[m[1]];
    return ord ? `健康发展中心第${ord}区` : null;
  }
  if ((m = s.match(/^DEPARTMENT OF HEALTH\s*[-–—]\s*(.+)$/i))) {
    const inner = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    if (PH_REGION_ZH[inner]) return `卫生部${PH_REGION_ZH[inner]}健康发展中心`;
    const dr = phDeptRegion(s);
    if (dr) return dr;
    return null;
  }
  const deptRegion = phDeptRegion(s);
  if (deptRegion) return deptRegion;
  if ((m = s.match(/^BUREAU OF\s+(.+)$/i))) {
    const inner = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    const bm = inner.match(/^(.+?)\s*[-–—]\s*(?:REGION\s+)?([IVX]+|[0-9]+)\s*$/);
    if (bm) {
      const bureau = bm[1].trim();
      const ord = ROMAN_ZH[bm[2]] ?? ARAB_ZH[bm[2]];
      const zh = PH_BUREAU_ZH[bureau];
      if (zh && ord) return `${zh}局第${ord}区`;
    }
    return null;
  }
  if ((m = s.match(/^DPWH\s*[-–—]?\s*(.+)$/i))) return phDpwh(`DPWH ${m[1]}`);
  if (/^DEPARTMENT OF PUBLIC WORKS AND HIGHWAYS/i.test(s)) return phDpwh(s);
  if ((m = s.match(/^CIVIL AVIATION AUTHORITY OF THE PHILIPPINES\s*[-–—]?\s*(.+)$/i))) {
    const inner = m[1].trim().replace(/\s+/g, " ");
    if (PLACE_OK.test(inner) && inner.length <= 60) return `菲律宾民航署${inner}`;
    return null;
  }
  if ((m = s.match(/^PROVINCE OF\s+(.+)$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ").replace(/\s*\((?:Philippines|PH)\)\s*$/i, "");
    const provZh = PH_PROV_ZH[place.toUpperCase()];
    if (provZh) return `${provZh}省`;
    if (PLACE_OK.test(place)) return `${place}省`;
    return null;
  }
  if ((m = s.match(/^(?:MUNICIPALITY|CITY) OF\s+(.+)$/i))) {
    const rest = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    const tp = phTownProv(rest);
    if (tp) return `${tp.town}市（${tp.provZh}省）`;
    if (PLACE_OK.test(rest)) return `${rest}市`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+STATE UNIVERSITY$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ");
    if (PLACE_OK.test(place)) return `${place}州立大学`;
    return null;
  }

  /* ── 西班牙语家族 ── */
  if ((m = s.match(/^(?:Junta de Gobierno del|Alcald[ií]a del)\s+Ayuntamiento de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市政府`;
    return null;
  }
  if ((m = s.match(/^(?:Presidencia de la|Junta de Gobierno de la)\s+Diputaci[oó]n Provincial de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}省议会`;
    return null;
  }
  if ((m = s.match(/^Diputaci[oó]n Provincial de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}省议会`;
    return null;
  }
  if ((m = s.match(/^Ayuntamiento de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市政府`;
    return null;
  }
  if ((m = s.match(/^Servicio de Salud (?:de\s+)?(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}卫生服务局`;
    return null;
  }
  if ((m = s.match(/^Consell Insular de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}岛议会`;
    return null;
  }
  if ((m = s.match(/^Empresa Municipal de Transportes de\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市交通公司`;
    return null;
  }

  /* ── 荷/德语家族 ── */
  if ((m = s.match(/^Gemeente\s+(.+)$/))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市政府`;
    return null;
  }
  if ((m = s.match(/^Samenwerkingsverband Regio\s+(.+)$/))) return null;
  if ((m = s.match(/^Gemeinde\s+(.+?)(?:,.*| - .*)?$/))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}镇政府`;
    return null;
  }
  if ((m = s.match(/^Stadt\s+(.+)$/))) {
    const rest = m[1].split(/\s+[-–]\s+/)[0].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市`;
    return null;
  }

  /* ── 英语家族（英/加/南非） ── */
  if ((m = s.match(/^London Borough of\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `伦敦${rest}区`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+County Council$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}郡议会`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+City Council$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}市议会`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+(?:Metropolitan )?Borough Council$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}自治市议会`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+District Council$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}区议会`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+NHS Foundation Trust$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest} NHS基金会信托`;
    return null;
  }
  if ((m = s.match(/^Regional District of\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}区域区`;
    return null;
  }
  if ((m = s.match(/^District of\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}区`;
    return null;
  }
  if ((m = s.match(/^Town of\s+(.+)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}镇`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+Local Municipality$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}地方自治市`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+District Municipality$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}区自治市`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+Metropolitan Municipality$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (LATIN_OK.test(rest)) return `${rest}都会自治市`;
    return null;
  }

  /* ── 巴西后缀/前缀家族 ── */
  if ((m = s.match(/^(.+?)\s+C[ÁA]MARA\s+(?:MUNICIPAL(?:\s+D[EO]S?\s+VEREADORES)?|D[EO]S?\s+VEREADORES)$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (PLACE_OK.test(rest)) return `${rest}市议会`;
    return null;
  }
  if ((m = s.match(/^(.+?)\s+ASSEMBLEIA LEGISLATIVA$/i))) {
    const rest = m[1].trim().replace(/\s+/g, " ");
    if (PLACE_OK.test(rest)) return `${rest}立法议会`;
    return null;
  }
  if ((m = s.match(/^SERVI[CÇ]O AUT[ÔO]NOMO DE [ÁA]GUA E ESGOTOS? DE\s+(.+)$/i))) {
    const rest = stripRegiaoSuffix(m[1]).trim().replace(/\s+/g, " ");
    if (PLACE_OK.test(rest)) return `${rest}独立自来水污水公司`;
    return null;
  }
  if ((m = s.match(/^MINIST[ÉE]RIO P[ÚU]BLICO\s+(?:DO ESTADO\s+)?(?:DE|DO|DA)\s+(.+)$/i))) {
    const st = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    if (BR_STATE_ZH[st]) return `${BR_STATE_ZH[st]}州检察院`;
    return null;
  }
  if ((m = s.match(/^DEFENSORIA P[ÚU]BLICA\s+(?:DO ESTADO\s+)?(?:DE|DO|DA)\s+(.+)$/i))) {
    const st = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    if (BR_STATE_ZH[st]) return `${BR_STATE_ZH[st]}州公设辩护署`;
    return null;
  }
  if ((m = s.match(/^TRIBUNAL DE CONTAS\s+(?:DO ESTADO\s+)?(?:DE|DO|DA)\s+(.+)$/i))) {
    const st = m[1].trim().toUpperCase().replace(/\s+/g, " ");
    if (BR_STATE_ZH[st]) return `${BR_STATE_ZH[st]}州审计法院`;
    return null;
  }
  if ((m = s.match(/^CONSELHO REGIONAL DE\s+(.+)$/i))) {
    const inner = stripRegiaoSuffix(m[1]).trim().toUpperCase().replace(/\s+/g, " ");
    const cm = inner.match(/^(.+?)\s+(?:DE|DO|DA)\s+(.+)$/);
    if (!cm) return null;
    const prof = cm[1].trim();
    const st = cm[2].trim();
    const profZh = Object.prototype.hasOwnProperty.call(BR_COUNCIL_ZH, prof) ? BR_COUNCIL_ZH[prof] : null;
    const stZh = BR_STATE_ZH[st];
    if (profZh && stZh) return `${stZh}${profZh}委员会`;
    return null;
  }

  /* ── 巴西市政基础族（v1） ── */
  // MUNICIPIO DE <地名> → <地名>市
  if ((m = s.match(/^MUNICIPIO (?:DE|DO|DA)\s+(.+)$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ");
    return PLACE_OK.test(place) ? `${place}市` : null;
  }
  // CAMARA MUNICIPAL DE <地名> → <地名>市议会
  if ((m = s.match(/^CAMARA MUNICIPAL (?:DE|DO|DA)\s+(.+)$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ");
    return PLACE_OK.test(place) ? `${place}市议会` : null;
  }
  // PREFEITURA [MUNICIPAL] DE <地名> → <地名>市政府
  if ((m = s.match(/^PREFEITURA (?:MUNICIPAL\s+)?(?:DE|DO|DA)\s+(.+)$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ");
    return PLACE_OK.test(place) ? `${place}市政府` : null;
  }
  // ESTADO DE <州名> → <州名>州（rest 混入其他机构词如 " - TRIBUNAL..." → 留手翻）
  if ((m = s.match(/^ESTADO (?:DE|DO|DA)\s+(.+)$/i))) {
    const place = m[1].trim().replace(/\s+/g, " ");
    if (/\s[-–—]\s/.test(place)) return null;
    return PLACE_OK.test(place) ? `${place}州` : null;
  }
  // FUNDO MUNICIPAL DE <类型> [DE <地名>] → [地名]市<类型>基金 / 市政<类型>基金
  if ((m = s.match(/^FUNDO MUNICIPAL DE\s+(.+)$/i))) {
    const tp = splitTypePlace(m[1]);
    if (!tp) return null;
    const zh = typeZh(tp.type);
    if (!zh) return null;
    return tp.place ? `${tp.place}市${zh}基金` : `市政${zh}基金`;
  }
  // SECRETARIA MUNICIPAL DE <类型> [DE <地名>] → [地名]市<类型>局 / 市政<类型>局
  if ((m = s.match(/^SECRETARIA MUNICIPAL (?:DE|DO|DA)\s+(.+)$/i))) {
    const tp = splitTypePlace(m[1]);
    if (!tp) return null;
    const zh = typeZh(tp.type);
    if (!zh) return null;
    return tp.place ? `${tp.place}市${zh}局` : `市政${zh}局`;
  }
  // SECRETARIA DE ESTADO DE <类型> → <类型>厅（州级，原名单独也不含州名，不臆造）
  if ((m = s.match(/^SECRETARIA DE ESTADO (?:DE|DA|DO)\s+(.+)$/i))) {
    const tp = splitTypePlace(m[1]);
    const zh = tp ? typeZh(tp.type) : typeZh(m[1].trim().toUpperCase());
    return zh ? `${zh}厅` : null;
  }
  // 肯尼亚县治：X COUNTY GOVERNMENT / COUNTY GOVERNMENT OF X → X县政府
  if ((m = s.match(/^(.+?)\s+COUNTY GOVERNMENT$/i)) || (m = s.match(/^COUNTY GOVERNMENT OF\s+(.+)$/i))) {
    const county = m[1].trim().replace(/\s+/g, " ");
    return /^[A-Za-z0-9 .,'()&-]+$/.test(county) ? `${county}县政府` : null;
  }
  return null;
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

type Row = { buyer_name: string; zh: string; c: number; rule: string };

try {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT buyer_name, COUNT(*) AS c FROM notice_public
      WHERE buyer_name IS NOT NULL AND buyer_name <> ''
        AND (buyer_name_cn IS NULL OR buyer_name_cn = '')
      GROUP BY buyer_name`,
  );
  const all = rows as unknown as Array<{ buyer_name: string; c: number }>;
  const t0 = Date.now();

  const accepted: Row[] = [];
  let junk = 0;
  const unmatched: Array<{ c: number; name: string }> = [];
  const bucketOf = (c: number) => (c >= 20 ? ">=20" : c >= 5 ? "5-19" : c >= 2 ? "2-4" : "1");
  const unmatchedByC: Record<string, number> = { ">=20": 0, "5-19": 0, "2-4": 0, "1": 0 };

  // 已有中文可用（bt 命中）的名字不进未命中清单——重建即可落库，无需翻译
  const [covRows] = await pool.query<RowDataPacket[]>(
    `SELECT SHA2(UPPER(TRIM(buyer_name)),256) AS k FROM buyer_translation
      WHERE buyer_name_zh IS NOT NULL AND buyer_name_zh <> '' AND status = 'translated'`,
  );
  const covered = new Set((covRows as unknown as Array<{ k: string }>).map((r) => r.k));

  for (const { buyer_name, c } of all) {
    if (isJunk(buyer_name)) { junk += 1; continue; }
    // B) KNOWN_ACRONYMS 精确命中（人工策展表）
    const cur = KNOWN_ACRONYMS.get(buyer_name.trim().toUpperCase());
    if (cur?.i18n?.zh && CJK_RE.test(cur.i18n.zh) && cur.i18n.zh !== buyer_name.trim()) {
      accepted.push({ buyer_name, zh: cur.i18n.zh, c, rule: "acronym" });
      continue;
    }
    // A) 严格形状规则
    const zh = shapeZh(buyer_name);
    if (zh && CJK_RE.test(zh)) {
      accepted.push({ buyer_name, zh, c, rule: "shape" });
      continue;
    }
    if (covered.has(createHash("sha256").update(buyer_name.trim().toUpperCase()).digest("hex"))) continue;
    unmatchedByC[bucketOf(c)] += 1;
    if (c >= 5) unmatched.push({ c, name: buyer_name });
  }

  const stat = (pred: (r: Row) => boolean) => {
    const rs = accepted.filter(pred);
    return `${rs.length} 名 / ${rs.reduce((s, r) => s + r.c, 0)} 行`;
  };
  console.log(`[pattern-fill] 总空名 ${all.length} · 准入 ${accepted.length} 名（${stat(() => true)}）`);
  console.log(`  ├ c>=20: ${stat((r) => r.c >= 20)}`);
  console.log(`  ├ c 5-19: ${stat((r) => r.c >= 5 && r.c < 20)}`);
  console.log(`  ├ c 2-4: ${stat((r) => r.c >= 2 && r.c < 5)}`);
  console.log(`  └ c=1: ${stat((r) => r.c === 1)}`);
  const unTotal = unmatchedByC[">=20"] + unmatchedByC["5-19"] + unmatchedByC["2-4"] + unmatchedByC["1"];
  console.log(`[pattern-fill] 未命中 ${unTotal}（c>=20: ${unmatchedByC[">=20"]} · 5-19: ${unmatchedByC["5-19"]} · 2-4: ${unmatchedByC["2-4"]} · =1: ${unmatchedByC["1"]}）· 垃圾名 ${junk} · 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (DUMP_FILE) {
    writeFileSync(DUMP_FILE, accepted.map((r) => `${r.c}\t${r.buyer_name}\t${r.zh}\t${r.rule}`).join("\n"), "utf8");
    writeFileSync(`${DUMP_FILE}.hand-c5.tsv`, unmatched.sort((a, b) => b.c - a.c).map((u) => `${u.c}\t${u.name}`).join("\n"), "utf8");
    console.log(`[pattern-fill] 已导出 ${DUMP_FILE} 与 ${DUMP_FILE}.hand-c5.tsv（未命中 c>=5 清单，共 ${unmatched.length} 名）`);
  }

  if (!APPLY) {
    console.log("[pattern-fill] DRY：加 --apply 才写 buyer_translation");
    process.exit(0);
  }

  // ── 写库 ──
  const keys = accepted.map((r) => createHash("sha256").update(r.buyer_name.trim().toUpperCase()).digest("hex"));
  const placeholders = keys.map(() => "?").join(",");
  const [dupRows] = await pool.query<RowDataPacket[]>(
    `SELECT buyer_key, buyer_name, buyer_name_zh, status, translated_at, updated_at
       FROM buyer_translation
      WHERE buyer_name IN (${accepted.map(() => "?").join(",")})
        AND buyer_key NOT IN (${placeholders})`,
    [...accepted.map((r) => r.buyer_name), ...keys],
  );
  const dups = dupRows as unknown as Array<Record<string, unknown>>;
  if (dups.length > 0) {
    const backup = dups.map((d) => [d.buyer_key, d.buyer_name, d.buyer_name_zh, d.status, d.translated_at, d.updated_at].join("\t")).join("\n");
    appendFileSync("/root/bak-buyer-translation-pattern-fill-20261030.tsv", backup + "\n", "utf8");
    console.log(`[pattern-fill] 裸串键重复行 ${dups.length} 行已备份至 /root/bak-buyer-translation-pattern-fill-20261030.tsv`);
  }

  let written = 0;
  for (let i = 0; i < accepted.length; i += INSERT_CHUNK) {
    const chunk = accepted.slice(i, i + INSERT_CHUNK);
    const values: unknown[] = [];
    const ph = chunk.map(() => "(SHA2(?,256), ?, ?, 'translated', SHA2(CONCAT('pattern-fill-20261030|', ?), 256), UNIX_TIMESTAMP(), UNIX_TIMESTAMP())").join(",");
    for (const r of chunk) values.push(r.buyer_name.trim().toUpperCase(), r.buyer_name, r.zh, r.buyer_name.trim().toUpperCase());
    const [res] = await pool.query(
      `INSERT INTO buyer_translation (buyer_key, buyer_name, buyer_name_zh, status, source_hash, translated_at, updated_at)
       VALUES ${ph}
       ON DUPLICATE KEY UPDATE buyer_name = VALUES(buyer_name), buyer_name_zh = VALUES(buyer_name_zh), updated_at = VALUES(updated_at)`,
      values,
    ) as unknown as [{ affectedRows: number }, unknown];
    written += res.affectedRows;
  }
  console.log(`[pattern-fill] 落表完成：写入 ${written}（含更新）· 删除裸串键旧行 ${dups.length}`);
} finally {
  await pool.end();
}
