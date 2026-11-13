/**
 * supplier_certifications 字典规范化：幂等收敛到最小形态（2026-11-13）
 *
 * 设计原则（用户定，2026-11-13）：**非必要，不添加字段。**
 *   一条信息只能有唯一载体；能由既有列推导的，不占新列；只值两三行数据的，不进主表。
 *
 * 最终形态（8 列，其中 4 列是规范化的必要基础）：
 *   id          PK / AUTO_INCREMENT —— **顺序即展示顺序**，按 category 分组连续编号，不另设 sort_order
 *   code        机器键，唯一 —— 归一匹配的锚点（`ISO9001:2015` / `ISO 9001` / `GB/T19001` 归到同一行）
 *   name        中文展示名（培训报名存的是名称快照，历史数据靠 aliases 回查）
 *   category    性质（5 类）—— 不可从 name 推导，决定「不满足会不会废标」
 *   scope       适用范围（global / EU / US / JP / KR / …）—— 不可从 name 推导，决定「这证在该国是否适用」
 *   aliases     别名数组（JSON）—— 标准写法变体、中文简称、历史名称快照
 *   is_active   上架开关（原表既有）
 *   created_at  审计（原表既有）
 *
 * 相对首版（2026-11-13 上午）删掉的 5 列，理由逐条：
 *   - sort_order    → 用 id 排序。id 本身按 category 分组连续编号，顺序在初始化时就定好。
 *   - name_en       → 零消费方。展示用中文名，匹配用 code/aliases，英文全名不承担任何职责。
 *   - is_mandatory  → 23 条「强制」里 21 条就是 market_access 全量，只补 GMP/CPC 两个例外，
 *                     91% 冗余；且「某标书是否强制」由资质抽取的 importance 判定，字典不该越权。
 *   - supersedes    → 45 行里只有 2 行有值（OHSAS18001→ISO45001、MDD→MDR），
 *                     且 OHSAS18001 本就在 ISO45001 的 aliases 里；MDD 已并入 MDR 的 aliases。
 *   - scope_type    → 与 scope_value 表达同一件事。合并为 scope 单列（global / EU / …），
 *                     「是地区还是国家」对筛选无影响，展示层需要时靠静态映射。
 *
 * 幂等：可反复执行。缺列则加、有旧列则迁移、多余列则删、id 不对则重排、数据以 code 为键 UPSERT。
 *
 * 用法：
 *   npx tsx scripts/tools/certification-dict-normalize.ts --preflight
 *   npx tsx scripts/tools/certification-dict-normalize.ts --apply --yes
 *
 * 铁律：只动本表；不删 name/is_active/created_at；任何 DROP 前先确认该列已无消费方。
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const PREFLIGHT = process.argv.includes("--preflight");
const YES = process.argv.includes("--yes");

if (APPLY && !YES) {
  console.error("✗ --apply 必须显式带 --yes（人工闸口）");
  process.exit(1);
}
if (!APPLY && !PREFLIGHT) {
  console.error("用法：--preflight（只读预览） | --apply --yes（执行）");
  process.exit(1);
}

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

type Category = "management" | "industry" | "market_access" | "product_safety" | "esg";

interface CertSeed {
  code: string;
  name: string;
  category: Category;
  /** global 或地区/国家码（EU / UK / EAEU / GCC / AU/NZ / US / JP / …） */
  scope: string;
  aliases: string[];
}

/**
 * 45 条 = 原 28 条（改名规范化）+ 17 条新增。
 * 新增依据：商机资质原文实测频次（GMP 173 / ISO27001 116 / BRC·IFS 83 / RoHS 73 /
 * ISO17025 26 / REACH 21 / ISO50001 17 / ISO3834·EN1090 5 / AS9100 2）
 * + 培训报名手填实测（BSCI 6 / Sedex 3 / GRS 2 / SLCP / SAA·TUV / ETL / NSF / OEKO-TEX）。
 * WHO-PQ 属场景推断（UN 医药标硬门槛），非频次实测。
 */
const CERTS: CertSeed[] = [
  // ── 管理体系 1-7 ──
  { code: "ISO9001", name: "ISO9001 质量管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 9001", "ISO9001:2015", "ISO9001:2008", "GB/T19001", "GB/T 19001", "ISO9000", "QMS"] },
  { code: "ISO14001", name: "ISO14001 环境管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 14001", "ISO14001:2015", "GB/T24001", "GB/T 24001", "ISO14000", "EMS"] },
  { code: "ISO45001", name: "ISO45001 职业健康安全管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 45001", "ISO45001:2018", "GB/T45001", "ISO45000", "OHSAS18001", "OHSAS 18001"] },
  { code: "ISO22000", name: "ISO22000 食品安全管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 22000", "ISO22000:2018", "ISO22000 / HACCP 食品安全体系", "FSMS"] },
  { code: "ISO27001", name: "ISO27001 信息安全管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 27001", "ISO/IEC 27001", "ISO27001:2022", "ISMS", "信息安全管理体系"] },
  { code: "ISO50001", name: "ISO50001 能源管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 50001", "ISO50001:2018", "EnMS", "能源管理体系"] },
  { code: "ISO22301", name: "ISO22301 业务连续性管理体系认证", category: "management", scope: "global",
    aliases: ["ISO 22301", "ISO22301:2019", "BCMS", "业务连续性管理体系"] },

  // ── 行业特定 8-25 ──
  { code: "ISO13485", name: "ISO13485 医疗器械质量体系认证", category: "industry", scope: "global",
    aliases: ["ISO 13485", "ISO13485:2016", "医疗器械质量管理体系"] },
  { code: "IATF16949", name: "IATF16949 汽车行业质量管理体系认证", category: "industry", scope: "global",
    aliases: ["IATF 16949", "IATF16949:2016", "TS16949", "TS 16949"] },
  { code: "ISO3834", name: "ISO3834 焊接质量管理体系认证", category: "industry", scope: "global",
    aliases: ["ISO 3834", "ISO3834-2", "焊接质量体系"] },
  { code: "AS9100", name: "AS9100 航空航天质量管理体系认证", category: "industry", scope: "global",
    aliases: ["AS 9100", "AS9100D", "航空航天质量体系"] },
  { code: "ISO17025", name: "ISO17025 检测和校准实验室能力认证", category: "industry", scope: "global",
    aliases: ["ISO 17025", "ISO/IEC 17025", "CNAS", "实验室认可"] },
  { code: "HACCP", name: "HACCP 食品安全体系认证", category: "industry", scope: "global",
    aliases: ["HACCP认证", "危害分析与关键控制点", "HACCP 体系"] },
  { code: "GMP", name: "GMP 药品生产质量管理规范认证", category: "industry", scope: "global",
    aliases: ["GMP认证", "cGMP", "药品GMP", "良好生产规范"] },
  { code: "BRC", name: "BRC 全球食品安全标准认证", category: "industry", scope: "global",
    aliases: ["BRCGS", "BRC Food", "BRC认证", "BRC全球食品安全标准"] },
  { code: "IFS", name: "IFS 国际食品标准认证", category: "industry", scope: "global",
    aliases: ["IFS Food", "IFS认证", "国际食品标准"] },
  { code: "EN1090", name: "EN1090 钢结构执行标准认证（欧盟）", category: "industry", scope: "EU",
    aliases: ["EN 1090", "EN1090-1", "EN1090-2", "钢结构CE认证"] },
  { code: "ISO15189", name: "ISO15189 医学实验室质量和能力认证", category: "industry", scope: "global",
    aliases: ["ISO 15189", "ISO15189:2022", "医学实验室认可"] },
  { code: "ISO1461", name: "ISO1461 热浸镀锌层认证", category: "industry", scope: "global",
    aliases: ["ISO 1461", "热浸镀锌", "热浸镀锌层"] },
  { code: "ISO11137", name: "ISO11137 医疗保健产品灭菌认证", category: "industry", scope: "global",
    aliases: ["ISO 11137", "ISO11137-1", "辐照灭菌"] },
  { code: "ISO14644", name: "ISO14644 洁净室及相关受控环境认证", category: "industry", scope: "global",
    aliases: ["ISO 14644", "ISO14644-1", "洁净室"] },
  { code: "ISO11607", name: "ISO11607 医疗包装认证", category: "industry", scope: "global",
    aliases: ["ISO 11607", "ISO11607-1", "医疗包装"] },
  { code: "ISO20345", name: "ISO20345 安全鞋认证", category: "industry", scope: "global",
    aliases: ["ISO 20345", "EN ISO 20345", "安全鞋"] },
  { code: "EN10204", name: "EN10204 材料检验证书（欧盟）", category: "industry", scope: "EU",
    aliases: ["EN 10204", "EN10204 3.1", "3.1 certificate", "材料检验证书"] },
  { code: "GS1", name: "GS1 全球统一编码认证", category: "industry", scope: "global",
    aliases: ["GS1 编码", "全球统一编码", "商品条码"] },

  // ── 市场准入 26-51 ──
  { code: "CE", name: "CE 认证（欧盟市场准入）", category: "market_access", scope: "EU",
    aliases: ["CE认证（欧盟）", "CE Marking", "CE标志", "CE 认证", "CE认证"] },
  { code: "UKCA", name: "UKCA 认证（英国市场准入）", category: "market_access", scope: "UK",
    aliases: ["UKCA认证（英国）", "UKCA Marking", "UKCA认证"] },
  { code: "MDR", name: "MDR 认证（欧盟医疗器械法规）", category: "market_access", scope: "EU",
    aliases: ["MDR认证（欧盟，医疗）", "EU MDR", "EU 2017/745", "医疗器械法规", "MDD"] },
  { code: "EAC", name: "EAC 认证（俄罗斯及欧亚经济联盟）", category: "market_access", scope: "EAEU",
    aliases: ["EAC认证（俄罗斯/欧亚）", "EAC Mark", "EAC认证", "海关联盟认证", "CU-TR"] },
  { code: "G-MARK", name: "G-Mark 认证（海湾国家）", category: "market_access", scope: "GCC",
    aliases: ["G-Mark（海湾七国）", "GCC Mark", "Gulf Conformity Mark", "海湾认证"] },
  { code: "ROHS", name: "RoHS 有害物质限制（欧盟）", category: "market_access", scope: "EU",
    aliases: ["RoHS", "ROHS", "Rohs", "Rosh", "有害物质限制"] },
  { code: "REACH", name: "REACH 化学品法规合规（欧盟）", category: "market_access", scope: "EU",
    aliases: ["EU REACH", "REACH 法规", "化学品注册评估授权限制"] },
  { code: "FCC", name: "FCC 认证（美国无线及电子产品）", category: "market_access", scope: "US",
    aliases: ["FCC认证（美国，无线/电子产品）", "FCC ID", "FCC Certification", "FCC认证"] },
  { code: "FDA", name: "FDA 注册（美国医疗及食品）", category: "market_access", scope: "US",
    aliases: ["FDA注册（美国，医疗/食品）", "FDA Registration", "FDA 510K", "510K", "510(k)"] },
  { code: "PSE", name: "PSE 认证（日本电气产品）", category: "market_access", scope: "JP",
    aliases: ["PSE认证（日本，电气产品）", "PSE Mark", "电气用品安全法", "PSE认证"] },
  { code: "MIC", name: "MIC 认证（日本无线设备·俗称技适）", category: "market_access", scope: "JP",
    aliases: ["MIC / TELEC（日本，无线设备）", "TELEC", "技适", "技適", "Giteki", "Radio Law"] },
  { code: "KC", name: "KC 认证（韩国）", category: "market_access", scope: "KR",
    aliases: ["KC认证（韩国）", "KC Mark", "KC认证", "KC 인증"] },
  { code: "SASO", name: "SASO 符合性认证（沙特·SABER 平台）", category: "market_access", scope: "SA",
    aliases: ["SABER/SASO（沙特）", "SABER", "SABER/SASO", "沙特SASO", "SASO认证"] },
  { code: "BIS", name: "BIS 认证（印度）", category: "market_access", scope: "IN",
    aliases: ["BIS认证（印度）", "BIS CRS", "ISI Mark", "BIS认证"] },
  { code: "RCM", name: "RCM 认证（澳大利亚及新西兰）", category: "market_access", scope: "AU/NZ",
    aliases: ["RCM认证（澳大利亚/新西兰）", "RCM Mark", "SAA", "SAA认证"] },
  { code: "ISED", name: "ISED 认证（加拿大无线设备）", category: "market_access", scope: "CA",
    aliases: ["ISED（加拿大，无线设备）", "Industry Canada", "IC ID", "ISED认证"] },
  { code: "INMETRO", name: "INMETRO 认证（巴西）", category: "market_access", scope: "BR",
    aliases: ["INMETRO（巴西）", "INMETRO认证"] },
  { code: "TISI", name: "TISI 认证（泰国）", category: "market_access", scope: "TH",
    aliases: ["TISI（泰国）", "TISI认证", "Thai Industrial Standard"] },
  { code: "SNI", name: "SNI 认证（印度尼西亚）", category: "market_access", scope: "ID",
    aliases: ["SNI（印尼）", "SNI认证", "Standar Nasional Indonesia"] },
  { code: "SONCAP", name: "SONCAP 认证（尼日利亚）", category: "market_access", scope: "NG",
    aliases: ["SONCAP（尼日利亚）", "SONCAP认证"] },
  { code: "WHO-PQ", name: "WHO PQ 世界卫生组织预认证", category: "market_access", scope: "global",
    aliases: ["WHO PQ", "WHO Prequalification", "WHO预认证", "世界卫生组织预认证", "WHO/UNFPA 预认证", "WHO/UNFPA预认证", "UNFPA 预认证"] },
  { code: "PCAB", name: "PCAB 菲律宾承包商执照", category: "market_access", scope: "PH",
    aliases: ["PCAB License", "PCAB Registration", "PCAB 执照", "菲律宾承包商认证委员会"] },
  { code: "B-BBEE", name: "B-BBEE 南非黑人经济振兴等级", category: "market_access", scope: "ZA",
    aliases: ["B-BBEE", "BBBEE", "BBEE", "Broad-Based Black Economic Empowerment", "B-BBEE 等级"] },
  { code: "CIDB", name: "CIDB 建筑承包商等级注册", category: "market_access", scope: "ZA",
    aliases: ["CIDB 等级", "CIDB注册", "建筑工业发展委员会"] },
  { code: "PSIRA", name: "PSIRA 南非私人安保行业注册", category: "market_access", scope: "ZA",
    aliases: ["PSIRA 注册", "私人安保行业监管局"] },
  { code: "KEBS", name: "KEBS 肯尼亚标准局认证", category: "market_access", scope: "KE",
    aliases: ["KEBS 认证", "肯尼亚标准局"] },
  { code: "CCC", name: "CCC 中国强制性产品认证", category: "market_access", scope: "CN",
    aliases: ["CCC 认证", "3C 认证", "中国强制性产品认证", "China Compulsory Certificate"] },

  // ── 产品安全 52-66 ──
  { code: "UL", name: "UL 认证（美国）", category: "product_safety", scope: "US",
    aliases: ["UL认证（美国）", "UL Listed", "UL认证"] },
  { code: "CSA", name: "CSA 认证（加拿大·电气建材医疗）", category: "product_safety", scope: "CA",
    aliases: ["CSA（加拿大，电气、建材、医疗）", "CSA Group", "CSA认证"] },
  { code: "CPC", name: "CPC 认证（美国儿童产品）", category: "product_safety", scope: "US",
    aliases: ["CPC认证（美国，儿童产品）", "Children's Product Certificate", "CPSC", "CPC认证"] },
  { code: "SABS", name: "SABS 认证（南非标准局）", category: "product_safety", scope: "ZA",
    aliases: ["SABS 认证", "南非标准局"] },
  { code: "IEC60601-1", name: "IEC60601-1 医疗电气设备安全认证", category: "product_safety", scope: "global",
    aliases: ["IEC 60601-1", "EN 60601-1", "EN60601-1", "IEC60601", "医疗电气设备安全"] },
  { code: "IEC61215", name: "IEC61215 光伏组件设计鉴定", category: "product_safety", scope: "global",
    aliases: ["IEC 61215", "光伏组件认证"] },
  { code: "IEC61730", name: "IEC61730 光伏组件安全鉴定", category: "product_safety", scope: "global",
    aliases: ["IEC 61730", "光伏安全认证"] },
  { code: "IEC62443", name: "IEC62443 工业自动化网络安全认证", category: "product_safety", scope: "global",
    aliases: ["IEC 62443", "工业网络安全"] },
  { code: "EN1176", name: "EN1176 游乐设备安全标准认证（欧盟）", category: "product_safety", scope: "EU",
    aliases: ["EN 1176", "游乐设备安全"] },
  { code: "EN61010-1", name: "EN61010-1 测量控制设备安全认证（欧盟）", category: "product_safety", scope: "EU",
    aliases: ["EN 61010-1", "EN61010", "IEC 61010"] },
  { code: "IEC61439", name: "IEC61439 低压成套开关设备认证", category: "product_safety", scope: "global",
    aliases: ["IEC 61439", "低压成套设备"] },
  { code: "API", name: "API 美国石油学会标准认证", category: "product_safety", scope: "US",
    aliases: ["API 610", "API 650", "API 6A", "美国石油学会"] },
  { code: "ASME", name: "ASME 美国机械工程师协会认证", category: "product_safety", scope: "US",
    aliases: ["ASME 认证", "ASME 锅炉压力容器", "美国机械工程师协会"] },
  { code: "NSF", name: "NSF 美国国家卫生基金会认证", category: "product_safety", scope: "US",
    aliases: ["NSF 认证", "NSF/ANSI 61", "美国国家卫生基金会"] },
  { code: "OEKO-TEX", name: "OEKO-TEX 纺织品生态标签认证", category: "product_safety", scope: "global",
    aliases: ["OEKO TEX", "STANDARD 100", "纺织品生态标签"] },
  { code: "VDE", name: "VDE 德国电气产品认证", category: "product_safety", scope: "DE",
    aliases: ["VDE 认证", "VDE 标准", "德国电气工程师协会"] },
  { code: "IEC61850", name: "IEC61850 变电站通信网络标准", category: "product_safety", scope: "global",
    aliases: ["IEC 61850", "变电站通信"] },

  // ── 社会责任 67-74 ──
  { code: "SA8000", name: "SA8000 社会责任管理体系认证", category: "esg", scope: "global",
    aliases: ["SA 8000", "SA8000:2014", "社会责任标准", "SA8000认证"] },
  { code: "BSCI", name: "BSCI 社会责任审核（amfori）", category: "esg", scope: "global",
    aliases: ["amfori BSCI", "Business Social Compliance Initiative", "BSCI验厂", "BSCI认证", "BSCI等"] },
  { code: "SEDEX", name: "Sedex 道德贸易审核（SMETA）", category: "esg", scope: "global",
    aliases: ["Sedex", "SEDEX", "SMETA", "Sedex4P", "sedex4p", "SMETA 4P"] },
  { code: "GRS", name: "GRS 全球回收标准认证", category: "esg", scope: "global",
    aliases: ["Global Recycled Standard", "全球回收标准", "GRS认证"] },
  { code: "SLCP", name: "SLCP 社会劳工整合项目审核", category: "esg", scope: "global",
    aliases: ["Social & Labor Convergence Program", "社会劳工整合项目", "SLCP审核"] },
  { code: "ISO14064", name: "ISO14064 温室气体核查认证", category: "esg", scope: "global",
    aliases: ["ISO 14064", "ISO14064-1", "温室气体核查", "GHG 核查"] },
  { code: "ISO26000", name: "ISO26000 社会责任指南认证", category: "esg", scope: "global",
    aliases: ["ISO 26000", "社会责任指南"] },
  { code: "FSC", name: "FSC 森林管理委员会认证", category: "esg", scope: "global",
    aliases: ["FSC 认证", "森林认证", "FSC COC"] },
  { code: "PEFC", name: "PEFC 森林认证", category: "esg", scope: "global",
    aliases: ["PEFC 认证", "森林认证体系认可计划"] },
  { code: "LEED", name: "LEED 绿色建筑认证", category: "esg", scope: "global",
    aliases: ["LEED Certification", "LEED 认证", "绿色建筑认证"] }
];

const CATEGORIES: Category[] = ["management", "industry", "market_access", "product_safety", "esg"];

/** 首版引入但已判定多余的列：回填后删除 */
const DROP_COLS = [
  { name: "sort_order", reason: "用 id 排序，顺序在初始化时定好" },
  { name: "name_en", reason: "零消费方" },
  { name: "is_mandatory", reason: "91% 冗余（market_access 全量），强制性归资质抽取判定" },
  { name: "supersedes", reason: "仅 2 行有值，已并入 aliases" },
  { name: "scope_type", reason: "与 scope 表达同一件事，已合并" },
];

function validateSeed(): string[] {
  const errs: string[] = [];
  const codes = new Set<string>();
  const names = new Set<string>();
  let lastCat = -1;

  for (const c of CERTS) {
    if (codes.has(c.code)) errs.push(`code 重复：${c.code}`);
    codes.add(c.code);
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c.code)) errs.push(`code 形态非法（须大写字母数字._-）：${c.code}`);
    if (names.has(c.name)) errs.push(`name 重复：${c.name}`);
    names.add(c.name);
    if (!/[\u4e00-\u9fa5]/.test(c.name)) errs.push(`name 缺中文：${c.code}`);
    if (c.name.length > 60) errs.push(`name 过长（>60）：${c.code}`);
    if (/[,，]/.test(c.name)) errs.push(`name 含逗号（会切碎多选统计）：${c.code} ${c.name}`);
    if (!CATEGORIES.includes(c.category)) errs.push(`category 非法：${c.code} ${c.category}`);
    if (!c.scope) errs.push(`scope 为空：${c.code}`);
    if (c.scope !== "global" && !/^[A-Z]{2}(\/[A-Z]{2})?$|^[A-Z]{3,4}$/.test(c.scope)) {
      errs.push(`scope 形态可疑（应为 global 或地区/国家码）：${c.code} ${c.scope}`);
    }
    if (c.aliases.length === 0) errs.push(`aliases 为空：${c.code}`);
    if (c.aliases.some((a) => !a.trim())) errs.push(`aliases 含空串：${c.code}`);

    // id 顺序必须按 category 分组：同类只能出现在连续区间，且组序符合 CATEGORIES
    const ci = CATEGORIES.indexOf(c.category);
    if (ci < lastCat) errs.push(`id 顺序未按 category 分组：${c.code}（${c.category}）`);
    lastCat = Math.max(lastCat, ci);
  }

  // 别名不得撞其他行的 code（否则归一歧义）
  for (const c of CERTS) {
    for (const a of c.aliases) {
      const hit = CERTS.find((x) => x.code === a.toUpperCase() && x.code !== c.code);
      if (hit) errs.push(`别名撞他行 code：${c.code} <- "${a}" 与 ${hit.code}`);
    }
  }

  if (CERTS.length === 0) errs.push("种子为空");

  return errs;
}

const seedErrs = validateSeed();
if (seedErrs.length) {
  console.error("✗ 种子数据校验失败：");
  for (const e of seedErrs) console.error("  ·", e);
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [colRows] = await conn.query(
  `SELECT COLUMN_NAME c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_certifications'`,
);
const existingCols = new Set((colRows as any[]).map((r) => r.c));
const [idxRows] = await conn.query(
  `SELECT DISTINCT INDEX_NAME i FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_certifications'`,
);
const existingIdx = new Set((idxRows as any[]).map((r) => r.i));
const [rawRows] = await conn.query(
  `SELECT id${existingCols.has("code") ? ", code" : ", NULL AS code"} FROM supplier_certifications ORDER BY id`,
);
const rows = rawRows as any[];

const addCols: string[] = [];
if (!existingCols.has("code")) addCols.push("code");
if (!existingCols.has("category")) addCols.push("category");
if (!existingCols.has("aliases")) addCols.push("aliases");
const needScope = !existingCols.has("scope");
const mergeScope = needScope && existingCols.has("scope_value");
const dropCols = DROP_COLS.filter((c) => existingCols.has(c.name));
const needIdx = !existingIdx.has("uk_cert_code");
/** 目标 id = 数组下标 + 1（顺序即语义，不手写编号） */
const targetId = (code: string) => CERTS.findIndex((c) => c.code === code) + 1;
const idMismatch = rows.filter((r) => targetId(r.code) !== r.id).length;

console.log("=== supplier_certifications 收敛到最小形态 ===");
console.log(`现状：${rows.length} 行 / ${existingCols.size} 列`);
console.log(`目标：${CERTS.length} 行 / 8 列（id, code, name, category, scope, aliases, is_active, created_at）`);
console.log(`分布：${CATEGORIES.map((cat) => `${cat} ${CERTS.filter((c) => c.category === cat).length}`).join(" / ")}`);

if (PREFLIGHT) {
  console.log("\n-- 加列 --");
  console.log(addCols.length ? addCols.map((c) => "  + " + c).join("\n") : "  （无需）");
  console.log("\n-- scope --");
  console.log(mergeScope ? "  ~ scope_value → scope（改名保留数据）" : needScope ? "  + scope（新增）" : "  （已存在）");
  console.log("\n-- 删列 --");
  console.log(dropCols.length ? dropCols.map((c) => `  - ${c.name}  （${c.reason}）`).join("\n") : "  （无需）");
  console.log("\n-- 索引 --");
  console.log(needIdx ? "  + UNIQUE uk_cert_code (code)" : "  （已存在）");
  console.log("\n-- id 重排 --");
  console.log(idMismatch ? `  ~ ${idMismatch} 行 id 需重排（按 category 分组连续编号）` : "  （已对齐）");
  console.log("\n（只读预览，未改动数据库。执行请加 --apply --yes）");
  await conn.end();
  process.exit(0);
}

// ── 执行 ────────────────────────────────────────────────────────────
const COLUMN_DDL: Record<string, string> = {
  code: "ADD COLUMN `code` varchar(40) NULL COMMENT '认证编码（唯一键，如 ISO9001 / CE / FCC），机器归一与匹配的锚点' AFTER `id`",
  category: "ADD COLUMN `category` varchar(20) NULL COMMENT '性质：management 管理体系 / industry 行业特定 / market_access 市场准入 / product_safety 产品安全 / esg 社会责任' AFTER `name`",
  aliases: "ADD COLUMN `aliases` json NULL COMMENT '别名数组：标准写法变体、中文简称、历史名称快照（用于归一匹配与历史数据回查）' AFTER `category`",
};
for (const name of addCols) {
  await conn.query(`ALTER TABLE supplier_certifications ${COLUMN_DDL[name]}`);
  console.log(`✓ 加列 ${name}`);
}

if (mergeScope) {
  await conn.query(
    "ALTER TABLE supplier_certifications CHANGE COLUMN `scope_value` `scope` varchar(100) NULL COMMENT '适用范围：global 或地区/国家码（EU/UK/EAEU/GCC/AU/NZ/US/JP/KR/SA/IN/CA/BR/TH/ID/NG）'",
  );
  console.log("✓ scope_value → scope（改名保留数据）");
} else if (needScope) {
  await conn.query(
    "ALTER TABLE supplier_certifications ADD COLUMN `scope` varchar(100) NULL COMMENT '适用范围：global 或地区/国家码（EU/UK/EAEU/GCC/AU/NZ/US/JP/KR/SA/IN/CA/BR/TH/ID/NG）' AFTER `category`",
  );
  console.log("✓ 加列 scope");
}

if (needIdx) {
  await conn.query("ALTER TABLE supplier_certifications ADD UNIQUE KEY `uk_cert_code` (`code`)");
  console.log("✓ 建唯一键 uk_cert_code");
}

/**
 * 回填分两条路径：
 *   - code 已全部就绪（正常路径）：按 code 定位，**不带 id**——避免目标 id 与现有行主键相撞，
 *     把别人的 code 覆盖掉（首版曾因带 id 插入而踩到这个坑）。
 *   - code 仍为 NULL（首次初始化）：只能按 id 定位（此时 code 不构成唯一键约束）。
 * 无论哪条路径，id 的最终顺序都由后面统一重排，不靠 UPSERT 顺手改。
 */
const codeReady = rows.length > 0 && rows.every((r) => r.code);
let inserted = 0;
let updated = 0;
for (const [idx, c] of CERTS.entries()) {
  const existed = codeReady
    ? rows.some((r) => r.code === c.code)
    : rows.some((r) => r.id === idx + 1);
  if (codeReady) {
    await conn.execute(
      `INSERT INTO supplier_certifications (code, name, category, scope, aliases, is_active)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), category = VALUES(category),
         scope = VALUES(scope), aliases = VALUES(aliases), is_active = 1`,
      [c.code, c.name, c.category, c.scope, JSON.stringify(c.aliases)],
    );
  } else {
    await conn.execute(
      `INSERT INTO supplier_certifications (id, code, name, category, scope, aliases, is_active)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 1)
       ON DUPLICATE KEY UPDATE
         code = VALUES(code), name = VALUES(name), category = VALUES(category),
         scope = VALUES(scope), aliases = VALUES(aliases), is_active = 1`,
      [idx + 1, c.code, c.name, c.category, c.scope, JSON.stringify(c.aliases)],
    );
  }
  if (existed) updated++;
  else inserted++;
}
console.log(`✓ 回填：更新 ${updated} 行 / 新增 ${inserted} 行`);

const TYPE_MAP: Record<string, string> = {
  code: "varchar(40) NOT NULL COMMENT '认证编码（唯一键，如 ISO9001 / CE / FCC），机器归一与匹配的锚点'",
  category: "varchar(20) NOT NULL COMMENT '性质：management 管理体系 / industry 行业特定 / market_access 市场准入 / product_safety 产品安全 / esg 社会责任'",
  scope: "varchar(100) NOT NULL COMMENT '适用范围：global 或地区/国家码（EU/UK/EAEU/GCC/AU/NZ/US/JP/KR/SA/IN/CA/BR/TH/ID/NG）'",
  aliases: "json NOT NULL COMMENT '别名数组：标准写法变体、中文简称、历史名称快照（用于归一匹配与历史数据回查）'",
};
for (const col of Object.keys(TYPE_MAP)) {
  const [nn]: any = await conn.query(
    `SELECT IS_NULLABLE n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_certifications' AND COLUMN_NAME = ?`,
    [col],
  );
  if (nn[0]?.n !== "YES") continue;
  const [nulls]: any = await conn.query(
    `SELECT COUNT(*) c FROM supplier_certifications WHERE \`${col}\` IS NULL`,
  );
  if (nulls[0].c > 0) {
    console.error(`✗ ${col} 仍有 ${nulls[0].c} 行为空，跳过收紧`);
    continue;
  }
  await conn.query(`ALTER TABLE supplier_certifications MODIFY COLUMN \`${col}\` ${TYPE_MAP[col]}`);
  console.log(`✓ ${col} 收紧为 NOT NULL`);
}

for (const c of dropCols) {
  await conn.query(`ALTER TABLE supplier_certifications DROP COLUMN \`${c.name}\``);
  console.log(`✓ 删列 ${c.name}（${c.reason}）`);
}

// id 重排：先整体偏移避开主键区间，再逐条落到目标 id
if (idMismatch > 0) {
  await conn.query("UPDATE supplier_certifications SET id = id + 1000 ORDER BY id DESC");
  for (const [idx, c] of CERTS.entries()) {
    await conn.execute("UPDATE supplier_certifications SET id = ? WHERE code = ?", [idx + 1, c.code]);
  }
  await conn.query(`ALTER TABLE supplier_certifications AUTO_INCREMENT = ${CERTS.length + 1}`);
  console.log(`✓ id 重排 ${idMismatch} 行（按 category 分组连续编号）`);
}

// ── 终态校验 ────────────────────────────────────────────────────────
const [rawFinal] = await conn.query(
  `SELECT id, code, name, category, scope, JSON_LENGTH(aliases) alias_count
   FROM supplier_certifications ORDER BY id`,
);
const finalRows = rawFinal as any[];
const codes = finalRows.map((r) => r.code);
const dup = codes.filter((v: string, i: number) => codes.indexOf(v) !== i);
const badCat = finalRows.filter((r) => !CATEGORIES.includes(r.category));
const noScope = finalRows.filter((r) => !r.scope);
const noAlias = finalRows.filter((r) => !r.alias_count);
const idOk = finalRows.every((r, i) => r.id === i + 1);

console.log("\n=== 终态 ===");
console.log(`行数 ${finalRows.length} / code 重复 ${dup.length} / category 非法 ${badCat.length} / 缺 scope ${noScope.length} / 无别名 ${noAlias.length} / id 连续 ${idOk ? "是" : "否"}`);

if (dup.length || badCat.length || noScope.length || noAlias.length || !idOk || finalRows.length !== CERTS.length) {
  console.error("✗ 终态校验未通过");
  await conn.end();
  process.exit(1);
}

const [colFinal] = await conn.query(
  `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ',') cols
   FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_certifications'`,
);
const colList = String((colFinal as any[])[0].cols);
console.log(`列（${colList.split(",").length}）：${colList}`);

console.log("\n-- 全表（id 即展示顺序）--");
let lastCat = "";
for (const r of finalRows) {
  if (r.category !== lastCat) {
    console.log(`\n[${r.category}]`);
    lastCat = r.category;
  }
  console.log(`  ${String(r.id).padStart(2)} ${String(r.code).padEnd(10)} ${r.name.padEnd(30)} ${String(r.scope).padEnd(7)} 别名${r.alias_count}`);
}

await conn.end();
console.log("\n✓ 完成");
