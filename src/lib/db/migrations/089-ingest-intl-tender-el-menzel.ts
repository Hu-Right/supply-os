/**
 * 089: 官方收录国际标杆 —— 摩洛哥 ONEE El Menzel 抽水蓄能电站 EPC 招标（AOI SP4130189）
 * ingest-intl-tender-el-menzel
 *
 * 目的：用一条**真实且完整**的国际公共采购招标，把 088 新增的 17 个结构化列与既有列一起
 *      落到生产数据上，作为后续「需求发布表单完善」与详情页展示的基准样本。
 *
 * 收录形态（与爬虫数据同构，确保既有全链路无需改动即可消费）：
 * - crm_bid_notices：entry_source='crawl' + source_channel='onee'。不用 'platform'，因为
 *   平台自填分类合并与 PLATFORM_PUBLISHED_ONLY 可见性谓词都按 platform 行走审核语义，
 *   官方收录属「平台方已核实的公开公告」，与爬虫同源；分类走 UNSPSC 桥接表（爬虫口径）。
 * - crm_bid_notice_unspsc_codes：按字典 **id 祖先链** 写 4 条码（桥接表存的不是 code）。
 * - crm_bid_opportunities：review_status='approved' + audit_status=1 + is_qualified=1，
 *   满足 qualifiedOppWhere，详情页与宽表才会取用它。
 *
 * 纪律（勿改，均有实测依据）：
 * - deadline_ts 按 IANA 时区 Africa/Casablanca（摩洛哥常年 UTC+1，无夏令时）折算：
 *   2026-10-28 09:30 当地 = 08:30 UTC = 1793176200。**不得**沿用 RFQ 侧 23:59:59Z 口径（spec D15）。
 * - estimated_value 一律不写：宽表 buildWideRow 对它跑 parseDecimalValue 抠数字进 decimal 列，
 *   填保函（45,000,000 MAD）或融资额（441.82 M EUR）都会污染金额排序与列表展示。
 *   保函进 supplier_conditions + description，融资额进 funding_agency。
 * - source_notice_id 上无唯一键 → 先删同键多余行再写，保证「一条公告只挂一条合格机会」，
 *   否则宽表 LEFT JOIN 出多行、落库哪条不确定。
 * - 全部文件走官方外链（用户决策：外链承载，不占平台存储；现网无 OSS，仅本地 public/uploads）。
 * - 法语标题与正文含撇号，一律走参数化占位符，不拼进 SQL 字面量。
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { type Migration } from "./runner";

const NOTICE_ID = "SP4130189";
const SOURCE_CHANNEL = "onee";
const TENANT_ID = 1;

/** 2026-10-28 09:30 Africa/Casablanca（UTC+1）= 08:30 UTC */
const DEADLINE_DISPLAY = "2026-10-28 09:30:00";
const DEADLINE_TS = 1793176200;

/** 标题：官方法语名 + 中文括注（爬虫标题同款双语风格，且规避撇号转义） */
const NOTICE_TITLE =
  "Appel d'Offres International n SP4130189 - STEP El Menzel (362 MW) - Etudes d'execution, fourniture des equipements, construction, installation et mise en service（摩洛哥 El Menzel 抽水蓄能电站 362MW 交钥匙 EPC 国际招标）";

/** 公告级原文摘要（法语；机会级中文精编会经 COALESCE 覆盖宽表描述） */
const NOTICE_DESC =
  "STEP El Menzel - Appel d'Offres International en une etape, sans pre-qualification. Objet : etudes d'execution, fourniture des equipements, construction, installation et mise en service d'une station de transfert d'energie par pompage de 362 MW composee de deux groupes reversibles de 181 MW, avec poste 400 kV et genie civil souterrain. Delai d'execution : 48 mois. Garantie d'offre : 45 000 000 MAD. Validite des offres : 182 jours. Depot papier uniquement (1 original, 2 copies, 1 cle USB) avant le 28/10/2026 a 09h30, heure du Royaume du Maroc, l'offre electronique etant interdite par l'Additif n2. Finance par la Banque Islamique de Developpement (BIsD), projet MAR1062.";

/** 官方外链（documents / external_links 为 [{url,name,type}]，前端 FilesTab 已渲染） */
const DOC_LINKS = [
  { name: "DAO SP4130189 STEP EL Menzel final.pdf（ONEE 签署版正式招标文件）", url: "https://www.marchespublics.gov.ma", type: "pdf" },
  { name: "ADDITIF n2（第2号补遗：截止延至 2026-10-28 09:30 并禁止电子递交）", url: "https://www.onee.be", type: "pdf" },
  { name: "Reponses aux demandes d'eclaircissement n1~n8（8 批官方澄清答复）", url: "https://www.onee.be", type: "pdf" },
  { name: "CR Reunion preparatoire et visite du site 28-29/07/2026（准备会与现场踏勘纪要）", url: "https://www.onee.be", type: "pdf" },
  { name: "STEP EL MENZEL_plans.pdf（全套图纸 PDF 版）", url: "https://www.onee.be", type: "pdf" },
  { name: "BdP STEP El Menzel.xlsx（报价单 Bordereau N1~N6）", url: "https://www.onee.be", type: "xlsx" },
  { name: "STEP EL MENZEL Calcul CMA kWh.xlsx（度电成本测算模型）", url: "https://www.onee.be", type: "xlsx" },
];

const EXT_LINKS = [
  { name: "Portail Marocain des Marches Publics（摩洛哥公共采购门户：文件与版本发布）", url: "https://www.marchespublics.gov.ma", type: "portal" },
  { name: "ONEE-BE Direction Approvisionnements et Marches（招标信息权威核验页）", url: "https://www.onee.be", type: "authority" },
  { name: "IsDB 项目页 MAR1062（业主方采购规则与机构申诉渠道）", url: "https://www.isdb.org", type: "funder" },
  { name: "plans DWG et PDF（AutoCAD 原图，业主 SharePoint 共享目录，链接具时效）", url: "https://oneelectricity-my.sharepoint.com", type: "cad" },
];

/** 联系人（格式与爬虫一致：[{name,email,phone,title}]；title 承载角色语义） */
const CONTACTS = [
  { name: "Jalila Lfilali", email: "j.lfilali@onee.ma", phone: "", title: "招标正式联系人（ONEE-BE Direction Approvisionnements et Marches）" },
  { name: "STEP El Menzel Project", email: "stepelmenzel@onee.ma", phone: "", title: "项目公共邮箱（澄清与正式沟通须走此渠道并留痕）" },
  { name: "Hamid Lamrabet Raillani", email: "", phone: "", title: "El Menzel 战略项目负责人（ONEE-BE；出席 07-28 准备会与 07-29 踏勘）" },
  { name: "ONEE-BE Bureau d'Ordre", email: "", phone: "", title: "递交收件窗口：65 rue Othman Ben Affan, BP 13498, Casablanca, Maroc" },
];

/** 桥接码：code → 字典 id 祖先链（level1..level5，实测自 crm_unspsc_codes） */
const UNSPSC_ROWS = [
  // Hydraulic turbine engines（水泵水轮机/水轮引擎）
  { code: "26101511", codeId: 101754, level: 5, l1: 101, l2: 101741, l3: 101742, l4: 101743, l5: 101754 },
  // Water pumps（水泵）
  { code: "40151510", codeId: 103581, level: 5, l1: 103, l2: 103484, l3: 103570, l4: 103571, l5: 103581 },
  // Heavy construction services（重型土建施工服务：大坝与地下厂房）
  { code: "72140000", codeId: 165156, level: 3, l1: 109, l2: 107328, l3: 165156, l4: 0, l5: 0 },
  // Industrial electric power distribution（400kV 开关站与电力分配）
  { code: "83101805", codeId: 109066, level: 5, l1: 109, l2: 107390, l3: 107391, l4: 109061, l5: 109066 },
];

/**
 * 机会级中文精编正文 —— 宽表 description 与六语列与 Meilisearch 的唯一作者
 * （DESC_SOURCE_EXPR = COALESCE(opp.description, n.description)）。
 * 长度控制在 2000 字符内：宽表 description 列按 WIDE_LIMITS.description 截断，超出即搜索丢失。
 */
const OPP_DESC = `【项目与业主】摩洛哥国家电力与饮用水办公室电力分支（ONEE-BE）国际公开招标 AOI n° SP4130189，标的为 El Menzel 抽水蓄能电站施工图设计、设备供货、施工、安装及投运，交钥匙 EPC、单一不可分割标段，部分投标一律拒绝。电站位于塞夫鲁省东南约 35 公里、距非斯约 30 公里。无事先资格预审，按伊斯兰开发银行（IsDB）2018 年采购指南与其设备采购通用招标文件（设计-供货-安装）执行。

【规模与技术范围】装机 362 MW，两台各 181 MW 定速可逆水泵水轮机机组；含上/下水库与输水系统、地下厂房土建、机组与成套机电设备、400 kV 开关站、控制与通信系统、模型试验、安装调试与性能试验。技术规范须同时满足 Section VII（含 ESHS 环境社会健康安全要求）与最新补遗及官方澄清答复。

【工期与节点】合同工期 48 个月，超出即不响应；投标有效期 182 天。招标发起 2026-07-02，投标准备会与现场踏勘 2026-07-28/29，递交截止 2026-10-28 09:30（摩洛哥当地时间，UTC+1，即 08:30 UTC）并当场开标。IsDB 页面原载 2026-09-30 已被第 2 号补遗取代。

【递交与封装】仅接受纸质递交：现场送达取回执，或带回执挂号邮件寄至 ONEE-BE（65 rue Othman Ben Affan, BP 13498, Casablanca）；第 2 号补遗明确禁止电子递交，任何平台上传都不能替代纸质送达。份数 1 正本 + 2 纸质副本 + 1 个 USB，USB 与正本信封封装方式须消除歧义；超时到达一律拒收。

【担保】投标保函 45 000 000 摩洛哥迪拉姆（MAD）或等值自由兑换货币；中标后另须提供履约担保与预付款担保（Section X）。

【资格与联合体】须具备同类抽水蓄能或复杂度相当水电工程的总体业绩，含营业额、财务报表、流动性与信贷额度、关键人员（水电 EPC 项目经理、地下工程与机组调试专家）及设备资源（Section III）。允许并要求组成联合体：水泵水轮机制造商须作为成员加入，另需大型地下/水工土建主体与所需专业制造商；不具备总体业绩的供应商不应直接投标，应以专业制造商、申报分包商或二级供应商身份进入合格联合体。文件语言为法语，外文证明须附经认证的法语译文。

【评标】以「最优资源优化」定标：实质响应且经评审成本最低，价格评审采用贴现度电成本（CMA du kWh）模型（业主提供专用测算表）；六张报价单（Bordereau N1~N6）与 CMA 输入、FUNC 保证值必须同源一致。中标关键不是名义总价最低，而是在完全响应与资质证据充分前提下使经评审度电成本最低。

【资金与合规】IsDB 融资（协议号 MAR1062），已披露额度为 4.3252 亿欧元分期付款融资加 930 万欧元普通贷款合计 4.4182 亿欧元；该额度既非合同估算价也非投标限价，不得据此推算预算。适用 IsDB 反欺诈反腐败规则与利益冲突条款（1.9.1-1.9.4），合格投标人限 IsDB 合格成员国（Section V），不设价格优惠。

【资料层级】冲突处理顺位：最新补遗与官方澄清答复 > ONEE 签署盖章的正式招标文件 > 业主发布的 Word 版（仅供翻译与编标便利）> 门户与融资机构页面信息。`;

/** 精选中文摘要：宽表 description_cn 列仅 500 字符（WIDE_LIMITS.descriptionCn），严格对齐 */
const OPP_CN_SUMMARY =
  "摩洛哥 ONEE 国际招标 SP4130189：El Menzel 抽水蓄能电站 362 MW（2×181 MW 定速可逆机组）交钥匙 EPC，含地下土建、400 kV 开关站与机电成套设备，工期 48 个月，IsDB 融资 MAR1062。仅纸质递交（1 正本+2 副本+1 USB），第 2 号补遗禁止电子投标，2026-10-28 09:30 摩洛哥当地时间截止，投标有效期 182 天，投标保函 4500 万迪拉姆，评审以 CMA 度电成本为准，水泵水轮机制造商须作为联合体成员。";

/** 其他语言原文（法语摘要，供 description_other） */
const OPP_OTHER_TEXT =
  "Francais : AOI n SP4130189 - etudes d'execution, fourniture des equipements, construction, installation et mise en service de la STEP El Menzel (362 MW, deux groupes reversibles de 181 MW, poste 400 kV, genie civil souterrain), marche EPC a lot unique et indivisible, delai 48 mois, sans pre-qualification, finance par la BIsD (MAR1062). Garantie d'offre 45 000 000 MAD ; validite 182 jours ; depot papier uniquement (1 original, 2 copies, 1 cle USB) avant le 28/10/2026 a 09h30 heure du Maroc, offre electronique interdite par l'Additif n2 ; evaluation selon la meilleure optimisation des ressources avec calcul du cout moyen actualise (CMA) du kWh ; langue francaise avec traductions certifiees.";

const KEY_DATES = JSON.stringify({
  lancement: "2026-07-02",
  reunion_preparatoire: "2026-07-28",
  visite_site: "2026-07-29",
  date_limite_officielle: "2026-10-28T09:30:00+01:00",
  date_limite_isdb_page: "2026-09-30（已被第 2 号补遗取代）",
  ouverture_plis: "2026-10-28 09:30 当场开标（投标人可出席）",
});

/** 机会行字段值：既填既有列，也填 088 新增列，逐列可追溯到招标文件原文 */
const OPP_FIELDS: Record<string, unknown> = {
  // ── 既有列 ──
  tenant_id: TENANT_ID,
  source_platform: "onee.ma",
  source_notice_id: NOTICE_ID,
  source_url: "https://www.marchespublics.gov.ma",
  title: NOTICE_TITLE,
  reference: "AOI n° SP4130189",
  notice_type: "Appel d'Offres International",
  registration_level: "IsDB 合格国投标人 + 经认证法语译文",
  agency: "ONEE",
  agency_full: "Office National de l'Electricite et de l'Eau Potable - Branche Electricite",
  country: "Morocco",
  beneficiary_countries: "Morocco",
  published_date: "2026-07-02",
  deadline: DEADLINE_DISPLAY,
  deadline_ts: DEADLINE_TS,
  // deadline_sec 是 STORED 生成列（由 deadline_ts 自动派生，见 009 迁移），禁止手动赋值
  deadline_timezone: "Africa/Casablanca",
  incoterms: "不适用（现场交钥匙工程，非货物贸易术语）",
  description: OPP_DESC,
  description_cn: OPP_CN_SUMMARY,
  description_other: OPP_OTHER_TEXT,
  bid_overview:
    "单一不可分割标段：施工图设计、水泵水轮机与发电电动机成套供货、上下水库与输水系统及地下厂房土建、400 kV 开关站、控制与通信系统、模型试验、现场安装调试与性能试验、48 个月投运。",
  supplier_conditions:
    "投标保函 45 000 000 摩洛哥迪拉姆（或等值自由兑换货币）；投标有效期 182 天；仅接受纸质递交（1 正本 + 2 纸质副本 + 1 USB），第 2 号补遗禁止电子递交；摩洛哥当地时间 2026-10-28 09:30 后到达一律拒收；外文证明须附经认证的法语译文。",
  eligibility:
    "Section III 资格标准：同类抽水蓄能或复杂度相当水电工程的总体业绩（土建与机电一体化交付）、营业额与财务能力、流动资金与信贷额度、关键人员（水电 EPC 项目经理、地下工程专家、机组调试专家）、自有施工与试验设备；允许并要求联合体，水泵水轮机制造商须作为联合体成员加入，专业制造商可以申报分包商或二级供应商身份进入。",
  technical_hurdles:
    "定速可逆机组须以模型试验与同类型机运行记录证明效率、工况转换、振动与稳定性；地下厂房与输水系统地质风险高；400 kV 及控制通信接口、ESHS 保障值与性能试验为强制项；六张报价单（Bordereau N1~N6）与 CMA 度电成本输入、FUNC 保证值必须同源一致（第 6 号报价表 H31/H33 存在 #REF! 公式错误须先行核验）。",
  industry: "Energy - Pumped Storage Hydro",
  unspsc_codes: JSON.stringify([
    { code: "26101511", name: "Hydraulic turbine engines" },
    { code: "40151510", name: "Water pumps" },
    { code: "72140000", name: "Heavy construction services" },
    { code: "83101805", name: "Industrial electric power distribution" },
  ]),
  contacts: JSON.stringify(CONTACTS),
  documents: JSON.stringify(DOC_LINKS),
  external_links: JSON.stringify(EXT_LINKS),
  product_code: "26101511",
  review_status: "approved",
  audit_status: 1,
  is_qualified: 1,
  status: 0,
  // ── 088 新增列 ──
  procurement_procedure: "AOI 一步法国际公开招标（无事先资格预审）",
  prequalification_required: 0,
  lot_structure: "单一不可分割标段（lot unique indivisible），部分投标与选择性报价一律拒绝",
  contract_form: "EPC 交钥匙（设计-采购-施工-调试一体）",
  consortium_rule:
    "允许并要求联合体：水泵水轮机制造商须作为成员加入；牵头方承担总体 EPC 与合同接口责任，地下/水工土建主体承担现场高风险工程，专业制造商以申报分包商或二级供应商身份进入；联合体协议须锁定工作范围、业绩归属与责任形式。",
  bid_validity_days: 182,
  submission_mode: "paper",
  submission_requirement:
    "1 份正本 + 2 份纸质副本 + 1 个 USB，分信封封装；USB 与正本信封的实际封装方式须按最新澄清核验，避免歧义；禁止电子递交（第 2 号补遗）。",
  submission_address:
    "ONEE-BE, Direction Approvisionnements et Marches, Bureau d'Ordre, 65 rue Othman Ben Affan, BP 13498, Casablanca, Maroc（现场递交取回执，或带回执挂号邮件）",
  funding_agency:
    "伊斯兰开发银行 IsDB/BIsD，协议号 MAR1062：分期付款融资 432.52 M EUR + 普通贷款 9.30 M EUR = 441.82 M EUR；该额度既非合同估算价也非投标限价。",
  evaluation_method:
    "最优资源优化：实质响应 + 合格投标中经评审最低，评审使用 CMA（度电成本）贴现模型；基准为经评审度电成本而非名义总价，IsDB 体系不设价格优惠。",
  language_requirement: "投标文件语言为法语；外文证明与资质文件须附经认证的法语译文。",
  execution_period: "48 个月（超出即不响应）",
  local_content:
    "无强制本地成分比例，但评审侧重本地执行能力：施工许可、劳务组织、供应链与本地分包实质参与（历史同类项目本地用工占比极高）。",
  eshs_requirements:
    "适用 Section VII 环境与社会及健康安全（ESHS）要求与 IsDB 保障政策：生态敏感区、移民安置、职业健康安全、性别与反胁迫条款；违规可触发资格暂停与跨机构制裁。",
  eligible_countries: "IsDB 合格成员国（依 Directives Septembre 2018 Section V）",
  key_dates: KEY_DATES,
};

/** upsert 公告行，返回主键 id（不硬编码 id：现网与本地自增值不同，且必须大于同步水位线） */
async function upsertNotice(pool: Pool): Promise<number> {
  const [hit] = await pool.query(
    `SELECT id FROM crm_bid_notices WHERE notice_id = ? AND source_channel = ? LIMIT 1`,
    [NOTICE_ID, SOURCE_CHANNEL],
  );
  const existingId = Number((hit as Array<{ id: number }>)[0]?.id || 0);
  if (existingId) {
    await pool.query(
      `UPDATE crm_bid_notices SET
         title = ?, reference = ?, reference_no = ?, notice_type = ?, agency = ?, agency_full = ?,
         organization = ?, country = ?, deadline = ?, deadline_ts = ?, description = ?, url = ?,
         documents = ?, external_links = ?, industry = ?, registration_level = ?, difficulty = ?,
         published_date = ?, is_active = 1, is_expired = 0, beneficiary_countries = ?, update_time = UNIX_TIMESTAMP()
       WHERE id = ?`,
      [
        NOTICE_TITLE, NOTICE_ID, NOTICE_ID, "Appel d'Offres International", "ONEE",
        "Office National de l'Electricite et de l'Eau Potable - Branche Electricite",
        "ONEE - Branche Electricite", "Morocco", DEADLINE_DISPLAY, DEADLINE_TS, NOTICE_DESC,
        "https://www.marchespublics.gov.ma", JSON.stringify(DOC_LINKS), JSON.stringify(EXT_LINKS),
        "Energy - Pumped Storage Hydro", "IsDB 合格国投标人 + 经认证法语译文", "严格",
        "2026-07-02", "Morocco", existingId,
      ],
    );
    return existingId;
  }

  const cols = [
    "notice_id", "source_channel", "reference", "reference_no", "title", "notice_type", "agency",
    "agency_full", "organization", "country", "deadline", "deadline_ts", "description", "url",
    "documents", "external_links", "unspsc_codes", "industry", "registration_level", "difficulty",
    "published_date", "is_active", "is_expired", "is_featured", "entry_source",
    "beneficiary_countries", "create_time", "update_time", "tenant_id",
  ];
  const values: unknown[] = [
    NOTICE_ID, SOURCE_CHANNEL, NOTICE_ID, NOTICE_ID, NOTICE_TITLE, "Appel d'Offres International", "ONEE",
    "Office National de l'Electricite et de l'Eau Potable - Branche Electricite",
    "ONEE - Branche Electricite", "Morocco", DEADLINE_DISPLAY, DEADLINE_TS, NOTICE_DESC,
    "https://www.marchespublics.gov.ma", JSON.stringify(DOC_LINKS), JSON.stringify(EXT_LINKS),
    JSON.stringify([{ code: "26101511", description: "Hydraulic turbine engines" }]),
    "Energy - Pumped Storage Hydro", "IsDB 合格国投标人 + 经认证法语译文", "严格",
    "2026-07-02", 1, 0, 0, "crawl", "Morocco", Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), TENANT_ID,
  ];
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO crm_bid_notices (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    values,
  );
  return res.insertId;
}

/** 桥接码：唯一键 uk_notice_code(notice_id, code)；levelN_id 写字典 id 链而非 code */
async function upsertUnspsc(pool: Pool): Promise<void> {
  for (const r of UNSPSC_ROWS) {
    await pool.query(
      `INSERT INTO crm_bid_notice_unspsc_codes
        (notice_id, code_id, code, level, level1_id, level2_id, level3_id, level4_id, level5_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         code_id = VALUES(code_id), level = VALUES(level),
         level1_id = VALUES(level1_id), level2_id = VALUES(level2_id), level3_id = VALUES(level3_id),
         level4_id = VALUES(level4_id), level5_id = VALUES(level5_id)`,
      [NOTICE_ID, r.codeId, r.code, r.level, r.l1, r.l2, r.l3, r.l4, r.l5],
    );
  }
}

/** 机会行：source_notice_id 无唯一键 → 先删同键旧行（杜绝多条合格行导致宽表 JOIN 不确定） */
async function upsertOpportunity(pool: Pool): Promise<number> {
  await pool.query(`DELETE FROM crm_bid_opportunities WHERE source_notice_id = ?`, [NOTICE_ID]);
  const keys = Object.keys(OPP_FIELDS);
  const now = new Date();
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO crm_bid_opportunities (${[...keys, "create_time", "update_time"].join(", ")})
     VALUES (${[...keys, "create_time", "update_time"].map(() => "?").join(", ")})`,
    [...keys.map((k) => OPP_FIELDS[k]), now, now],
  );
  return res.insertId;
}

export const migration: Migration = {
  version: 89,
  name: "ingest-intl-tender-el-menzel",
  async up(dbPool: Pool) {
    const noticeId = await upsertNotice(dbPool);
    await upsertUnspsc(dbPool);
    const oppId = await upsertOpportunity(dbPool);
    console.log(
      `[migration-089] 已收录 AOI SP4130189：公告 id=${noticeId}（notice_id=${NOTICE_ID}）、机会 id=${oppId}；` +
      "宽表由增量同步按 id 水位自动拾取（新公告 id 取自自增，必大于水位）",
    );
  },
};
