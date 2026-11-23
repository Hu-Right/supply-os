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
  /** 预埋行：入典但不下发（is_active=0），运营/谈判确认后一条 UPDATE 转正 */
  inactive?: boolean;
}

/**
 * 45 条 = 原 28 条（改名规范化）+ 17 条新增。
 * 新增依据：商机资质原文实测频次（GMP 173 / ISO27001 116 / BRC·IFS 83 / RoHS 73 /
 * ISO17025 26 / REACH 21 / ISO50001 17 / ISO3834·EN1090 5 / AS9100 2）
 * + 培训报名手填实测（BSCI 6 / Sedex 3 / GRS 2 / SLCP / SAA·TUV / ETL / NSF / OEKO-TEX）。
 * WHO-PQ 属场景推断（UN 医药标硬门槛），非频次实测。
 *
 * 2026-11-23 扩容 79→150（inactive 标记的 61 条为预埋 is_active=0，不下发）：
 * 公告全文语料三轮挖掘（notice_body 10,540 + 附件 47,884，覆盖率实测见
 * tmp/qual-mine-v4.mjs）。T1 激活 10 条均有原文实证（ANVISA×10 / NADCAP×4 /
 * E-MARK·DOT×2 / ATEX·ENERGY STAR·ISO20000·KOSHER·DVGW·VdS×1）；
 * T2 预埋 61 条 = 华测能力对齐 + 公告长尾预案（碳链/食农/纺织/绿标/电子IT/
 * 准入补盲/EU指令族/专业体系/供应链安全/医疗注册/水暖/中国侧）。
 * 消费方全部走 /api/certifications（is_active=1 动态下发，零硬编码），预埋零影响。
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
  { code: "ISO20000", name: "ISO20000 IT 服务管理体系认证", category: "management", scope: "global",
    aliases: ["ISO/IEC 20000", "ISO 20000", "IT 服务管理体系", "ITSM 认证"] },
  { code: "SOC2", name: "SOC 2 服务组织控制审计报告", category: "management", scope: "global",
    aliases: ["SOC 2", "SOC 2 Type II", "SOC2 Type II", "服务组织控制报告"], inactive: true },
  { code: "TISAX", name: "TISAX 汽车行业信息安全评估", category: "management", scope: "EU",
    aliases: ["TISAX 认证", "汽车信息安全评估标签"], inactive: true },
  { code: "PCI-DSS", name: "PCI-DSS 支付卡行业数据安全标准认证", category: "management", scope: "global",
    aliases: ["PCI DSS", "支付卡数据安全标准", "PCI-DSS 认证"], inactive: true },

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

  // ── 2026-11-23 扩容：行业特定（T1 激活 4 + T2 预埋 25）──
  { code: "KOSHER", name: "KOSHER 洁食认证", category: "industry", scope: "global",
    aliases: ["Kosher 认证", "犹太洁食认证", "洁净认证"] },
  { code: "NADCAP", name: "NADCAP 航空特种工艺认证", category: "industry", scope: "global",
    aliases: ["Nadcap 认证", "NADCAP accredited", "航空特种工艺认可"] },
  { code: "DVGW", name: "DVGW 德国水气工程认证", category: "industry", scope: "DE",
    aliases: ["DVGW 认证", "DVGW Arbeitsblatt", "德国水气协会"] },
  { code: "VDS", name: "VdS 德国消防安保认证", category: "industry", scope: "DE",
    aliases: ["VdS 认证", "VdS Klasse", "德国消防安保认证"] },
  { code: "HALAL", name: "HALAL 清真认证", category: "industry", scope: "global",
    aliases: ["Halal 认证", "清真认证"], inactive: true },
  { code: "GLOBALGAP", name: "GLOBALG.A.P. 良好农业规范认证", category: "industry", scope: "global",
    aliases: ["GlobalGAP", "GLOBALGAP", "GAP 认证", "良好农业规范"], inactive: true },
  { code: "FSSC22000", name: "FSSC22000 食品安全体系认证", category: "industry", scope: "global",
    aliases: ["FSSC 22000", "FSSC 认证"], inactive: true },
  { code: "ORGANIC-CN", name: "中国有机产品认证", category: "industry", scope: "CN",
    aliases: ["有机产品认证", "GB/T 19630", "中国有机", "有机认证"], inactive: true },
  { code: "RSPO", name: "RSPO 可持续棕榈油认证", category: "industry", scope: "global",
    aliases: ["RSPO 认证", "可持续棕榈油"], inactive: true },
  { code: "MSC", name: "MSC 可持续渔业认证", category: "industry", scope: "global",
    aliases: ["MSC 认证", "海洋管理理事会"], inactive: true },
  { code: "ASC", name: "ASC 负责任水产养殖认证", category: "industry", scope: "global",
    aliases: ["ASC 认证", "水产养殖管理委员会"], inactive: true },
  { code: "RAINFOREST", name: "Rainforest Alliance 雨林联盟认证", category: "industry", scope: "global",
    aliases: ["雨林联盟", "RA 认证", "Rainforest Alliance 认证"], inactive: true },
  { code: "UTZ", name: "UTZ 可持续农业认证", category: "industry", scope: "global",
    aliases: ["UTZ 认证", "UTZ certified"], inactive: true },
  { code: "FAIRTRADE", name: "Fairtrade 公平贸易认证", category: "industry", scope: "global",
    aliases: ["公平贸易认证", "Fair Trade 认证"], inactive: true },
  { code: "GOTS", name: "GOTS 全球有机纺织品标准认证", category: "industry", scope: "global",
    aliases: ["GOTS 认证", "全球有机纺织品标准"], inactive: true },
  { code: "OCS", name: "OCS 有机含量标准认证", category: "industry", scope: "global",
    aliases: ["OCS 认证", "Organic Content Standard", "有机含量标准"], inactive: true },
  { code: "BIFMA", name: "BIFMA 美国办公家具标准认证", category: "industry", scope: "US",
    aliases: ["ANSI/BIFMA", "BIFMA 认证", "办公家具标准"], inactive: true },
  { code: "JIS", name: "JIS 日本工业标准认证", category: "industry", scope: "JP",
    aliases: ["JIS 标志", "JIS mark", "日本工业标准"], inactive: true },
  { code: "ISO22163", name: "ISO/TS 22163 轨道交通行业管理体系认证", category: "industry", scope: "global",
    aliases: ["IRIS 认证", "IRIS", "轨道交通质量管理体系"], inactive: true },
  { code: "AS9120", name: "AS9120 航空航材分销质量体系认证", category: "industry", scope: "global",
    aliases: ["AS 9120", "航材分销商质量体系"], inactive: true },
  { code: "ISO9712", name: "ISO9712 无损检测人员资格认证", category: "industry", scope: "global",
    aliases: ["ISO 9712", "NDT 人员认证", "无损检测人员资格"], inactive: true },
  { code: "VDA6.3", name: "VDA 6.3 汽车过程审核", category: "industry", scope: "global",
    aliases: ["VDA 6.3", "德国汽车工业过程审核"], inactive: true },
  { code: "MDSAP", name: "MDSAP 医疗器械单一审核程序", category: "industry", scope: "global",
    aliases: ["Medical Device Single Audit Program", "医疗器械单一审核"], inactive: true },
  { code: "EN15085", name: "EN15085 轨道车辆焊接认证", category: "industry", scope: "EU",
    aliases: ["EN 15085", "轨道焊接认证", "轨道车辆焊接"], inactive: true },
  { code: "WRAS", name: "WRAS 英国水道认证", category: "industry", scope: "UK",
    aliases: ["WRAS 认证", "Water Regulations Advisory Scheme", "英国水法规认证"], inactive: true },
  { code: "ACS", name: "ACS 法国饮用水接触材料认证", category: "industry", scope: "FR",
    aliases: ["ACS 认证", "Attestation de Conformité Sanitaire", "法国卫生合格证明"], inactive: true },
  { code: "GJB9001", name: "GJB9001 国军标质量管理体系认证", category: "industry", scope: "CN",
    aliases: ["GJB 9001", "国军标认证", "军标质量体系", "GJB9001C"], inactive: true },
  { code: "C-TPAT", name: "C-TPAT 美国海关商贸反恐联盟认证", category: "industry", scope: "US",
    aliases: ["C-TPAT 认证", "海关商贸反恐联盟"], inactive: true },
  { code: "AEO", name: "AEO 经认证的经营者认证", category: "industry", scope: "global",
    aliases: ["AEO 认证", "Authorized Economic Operator", "经认证的经营者", "OEA"], inactive: true },

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

  // ── 2026-11-23 扩容：市场准入（T1 激活 4 + T2 预埋 21）──
  { code: "ANVISA", name: "ANVISA 巴西卫生监管注册", category: "market_access", scope: "BR",
    aliases: ["ANVISA 注册", "ANVISA registration", "巴西卫生注册"] },
  { code: "ENERGYSTAR", name: "ENERGY STAR 美国能源之星认证", category: "market_access", scope: "US",
    aliases: ["Energy Star", "能源之星", "ENERGY STAR 认证"] },
  { code: "E-MARK", name: "E-Mark 欧盟车辆型式认证", category: "market_access", scope: "EU",
    aliases: ["E mark", "ECE 认证", "ECE R10", "E-mark 认证", "车辆型式认证"] },
  { code: "DOT", name: "DOT 美国交通部合规", category: "market_access", scope: "US",
    aliases: ["DOT approved", "美国交通部", "FMVSS", "DOT 认证"] },
  { code: "CBAM", name: "CBAM 欧盟碳边境调节机制申报", category: "market_access", scope: "EU",
    aliases: ["碳边境调节机制", "Carbon Border Adjustment", "CBAM 申报"], inactive: true },
  { code: "CARB", name: "CARB 美国加州甲醛法规合规", category: "market_access", scope: "US",
    aliases: ["CARB Phase 2", "加州甲醛", "CARB compliance"], inactive: true },
  { code: "TSCA", name: "TSCA 美国有毒物质控制法 Title VI", category: "market_access", scope: "US",
    aliases: ["TSCA Title VI", "甲醛 Title VI", "美国有毒物质控制"], inactive: true },
  { code: "WEEE", name: "WEEE 欧盟废弃电子电气设备合规", category: "market_access", scope: "EU",
    aliases: ["WEEE 注册", "废弃电子电气", "WEEE directive"], inactive: true },
  { code: "NOM", name: "NOM 墨西哥官方标准认证", category: "market_access", scope: "MX",
    aliases: ["NOM mark", "Norma Oficial Mexicana", "NOM 认证"], inactive: true },
  { code: "ECAS", name: "ECAS 阿联酋合格性认证", category: "market_access", scope: "AE",
    aliases: ["ECAS 认证", "ESMA 认证", "阿联酋合格评定", "MOIAT"], inactive: true },
  { code: "SIRIM", name: "SIRIM 马来西亚标准认证", category: "market_access", scope: "MY",
    aliases: ["SIRIM 认证", "马来西亚 SIRIM"], inactive: true },
  { code: "QCVN", name: "QCVN 越南国家技术法规认证", category: "market_access", scope: "VN",
    aliases: ["QCVN 认证", "越南 CR 认证"], inactive: true },
  { code: "ANATEL", name: "ANATEL 巴西电信设备认证", category: "market_access", scope: "BR",
    aliases: ["Anatel 认证", "巴西电信认证", "Anatel homologação"], inactive: true },
  { code: "MTCTE", name: "MTCTE 印度电信设备认证", category: "market_access", scope: "IN",
    aliases: ["MTCTE 认证", "WPC 许可", "印度电信设备"], inactive: true },
  { code: "PED", name: "PED 欧盟承压设备指令", category: "market_access", scope: "EU",
    aliases: ["PED 2014/68/EU", "承压设备指令", "Pressure Equipment Directive"], inactive: true },
  { code: "PPE", name: "PPE 欧盟个体防护装备法规", category: "market_access", scope: "EU",
    aliases: ["PPE Regulation 2016/425", "个体防护装备", "PPE 认证"], inactive: true },
  { code: "RED", name: "RED 欧盟无线电设备指令", category: "market_access", scope: "EU",
    aliases: ["RED 2014/53/EU", "Radio Equipment Directive", "无线电设备指令"], inactive: true },
  { code: "TPED", name: "TPED 欧盟移动承压设备指令", category: "market_access", scope: "EU",
    aliases: ["TPED 2010/35/EU", "移动承压设备", "Transportable Pressure Equipment"], inactive: true },
  { code: "HEALTHCANADA", name: "Health Canada 加拿大卫生部注册", category: "market_access", scope: "CA",
    aliases: ["加拿大卫生部", "MDALL", "Health Canada 注册"], inactive: true },
  { code: "MFDS", name: "MFDS 韩国食品药品安全部注册", category: "market_access", scope: "KR",
    aliases: ["韩国食品药品安全部", "KFDA", "MFDS 注册"], inactive: true },
  { code: "TGA", name: "TGA 澳大利亚治疗商品管理局注册", category: "market_access", scope: "AU",
    aliases: ["TGA 注册", "ARTG", "澳大利亚治疗商品"], inactive: true },
  { code: "PMDA", name: "PMDA 日本医药品医疗器械综合机构注册", category: "market_access", scope: "JP",
    aliases: ["PMDA 注册", "日本药械审批"], inactive: true },
  { code: "NMPA", name: "NMPA 中国国家药监局注册", category: "market_access", scope: "CN",
    aliases: ["国家药监局", "CFDA 注册", "中国医疗器械注册"], inactive: true },
  { code: "CDSCO", name: "CDSCO 印度中央药品标准控制局注册", category: "market_access", scope: "IN",
    aliases: ["印度药品注册", "CDSCO import license"], inactive: true },
  { code: "WATERMARK", name: "WaterMark 澳大利亚水管认证", category: "market_access", scope: "AU",
    aliases: ["WaterMark 认证", "澳洲水管认证"], inactive: true },

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

  // ── 2026-11-23 扩容：产品安全（T1 激活 1 + T2 预埋 4）──
  { code: "ATEX", name: "ATEX 欧盟防爆指令认证", category: "product_safety", scope: "EU",
    aliases: ["ATEX 2014/34/EU", "防爆认证", "防爆指令"] },
  { code: "IECEX", name: "IECEx 国际防爆电气认证", category: "product_safety", scope: "global",
    aliases: ["IECEx 认证", "国际防爆认证"], inactive: true },
  { code: "GS-MARK", name: "GS 德国安全标志认证", category: "product_safety", scope: "DE",
    aliases: ["GS mark", "GS-geprüft", "GS 认证", "德国安全标志"], inactive: true },
  { code: "ETL", name: "ETL 北美安全认证", category: "product_safety", scope: "US",
    aliases: ["ETL listed", "ETL 认证", "Intertek ETL"], inactive: true },
  { code: "CQC", name: "CQC 中国质量认证中心自愿性认证", category: "product_safety", scope: "CN",
    aliases: ["CQC 标志", "中国质量认证中心", "CQC 认证"], inactive: true },

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
    aliases: ["LEED Certification", "LEED 认证", "绿色建筑认证"] },

  // ── 2026-11-23 扩容：社会责任/ESG（T2 预埋 8）──
  { code: "ISO14067", name: "ISO14067 产品碳足迹核查", category: "esg", scope: "global",
    aliases: ["ISO 14067", "产品碳足迹", "carbon footprint 核查"], inactive: true },
  { code: "ISO14068", name: "ISO14068 碳中和认证", category: "esg", scope: "global",
    aliases: ["ISO 14068-1", "碳中和认证", "carbon neutrality"], inactive: true },
  { code: "WRAP", name: "WRAP 全球负责任服装生产认证", category: "esg", scope: "global",
    aliases: ["WRAP 认证", "负责任服装生产", "Worldwide Responsible Accredited Production"], inactive: true },
  { code: "EU-ECOLABEL", name: "EU Ecolabel 欧盟生态标签", category: "esg", scope: "EU",
    aliases: ["欧盟之花", "欧盟生态标签", "EU Ecolabel 认证"], inactive: true },
  { code: "BLUE-ANGEL", name: "Blue Angel 德国蓝色天使环境标志", category: "esg", scope: "DE",
    aliases: ["蓝色天使", "Blauer Engel", "德国环境标志"], inactive: true },
  { code: "EPEAT", name: "EPEAT 全球电子产品环境评价认证", category: "esg", scope: "global",
    aliases: ["EPEAT 注册", "电子产品环境评估"], inactive: true },
  { code: "BREEAM", name: "BREEAM 英国绿色建筑评估认证", category: "esg", scope: "global",
    aliases: ["BREEAM 认证", "英国绿建评估"], inactive: true },
  { code: "RBA", name: "RBA 责任商业联盟审核", category: "esg", scope: "global",
    aliases: ["责任商业联盟", "Responsible Business Alliance", "EICC", "RBA VAP"], inactive: true }
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
console.log(`分布：${CATEGORIES.map((cat) => `${cat} ${CERTS.filter((c) => c.category === cat).length}`).join(" / ")} ｜ 预埋(inactive) ${CERTS.filter((c) => c.inactive).length} 条`);

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
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), category = VALUES(category),
         scope = VALUES(scope), aliases = VALUES(aliases), is_active = VALUES(is_active)`,
      [c.code, c.name, c.category, c.scope, JSON.stringify(c.aliases), c.inactive ? 0 : 1],
    );
  } else {
    await conn.execute(
      `INSERT INTO supplier_certifications (id, code, name, category, scope, aliases, is_active)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         code = VALUES(code), name = VALUES(name), category = VALUES(category),
         scope = VALUES(scope), aliases = VALUES(aliases), is_active = VALUES(is_active)`,
      [idx + 1, c.code, c.name, c.category, c.scope, JSON.stringify(c.aliases), c.inactive ? 0 : 1],
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
