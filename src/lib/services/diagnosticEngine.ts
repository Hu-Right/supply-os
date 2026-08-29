/**
 * 国际公采能力诊断引擎
 * International Public Procurement Capability Diagnostic Engine
 *
 * @module src/lib/services/diagnosticEngine
 * @description 从 14 字段企业输入 + 10 维度评分结果，生成完整 12 章节诊断报告数据。
 *              纯函数，可前后端共用。
 */
import type { QualificationScoreInput, ScoringResult } from "@/features/procurement/utils/scoringEngine";

// ── 输出类型 ──

export interface FieldEntry {
  field: string; fieldEn: string; value: string; valueEn: string; evidence: string; evidenceEn: string;
}

export interface ProfileDiagnosticItem {
  item: string; itemEn: string; status: string; statusEn: string; finding: string; findingEn: string; recommendation: string; recommendationEn: string;
}

export interface CertEntry { name: string; status: string; }
export interface CertGap { gap: string; gapEn: string; priority: string; }

export interface UnspscMapping {
  product: string; candidateCode: string; candidateName: string; matchLevel: string; note: string;
}

export interface CapabilityItem {
  capability: string; capabilityEn: string; result: string; risk: string; recommendation: string; recommendationEn: string;
}

export interface BidModule {
  module: string; moduleEn: string; status: string; owner: string; target: string; kpi: string;
}

export interface RiskItem {
  id: string; risk: string; riskEn: string; severity: "High" | "Medium" | "Low"; impact: string; owner: string; due: string;
}

export interface KpiItem {
  area: string; areaEn: string; day30: string; day60: string; day90: string; owner: string;
}

export interface RoadmapPhase {
  phase: string; days: string; actions: string; deliverables: string; acceptance: string;
}

export interface DiagnosticReport {
  cover: { companyName: string; reportTitle: string; assessDate: string; score: number; grade: string; gradeLabel: string; stage: string; stageEn: string; basis: string; basisEn: string; };
  admin: { fields: FieldEntry[]; standardFinding: string; standardFindingEn: string; };
  profile: { items: ProfileDiagnosticItem[]; };
  standards: { held: CertEntry[]; gaps: CertGap[]; recommendations: string[]; };
  unspsc: { products: UnspscMapping[]; maturityScore: number; status: string; statusEn: string; };
  international: { items: CapabilityItem[]; };
  bidOrg: { modules: BidModule[]; };
  risks: { items: RiskItem[]; };
  market: { priorityOrders: string; priorityProducts: string; priorityBuyers: string; priorityRegions: string; goNoGoGate: string; };
  kpis: { items: KpiItem[]; };
  roadmap: { phases: RoadmapPhase[]; };
  conclusion: { score: number; grade: string; position: string; positionEn: string; strengths: string; strengthsEn: string; gaps: string; gapsEn: string; recommendedStage: string; recommendedProducts: string; recommendedRoute: string; finalOpinion: string; finalOpinionEn: string; };
  disclaimer: { zh: string; en: string; };
}

// ── 工具函数 ──

function countItems(s: string): number {
  if (!s?.trim()) return 0;
  return s.split(/[,，;；\s]+/).filter((x) => x.trim().length > 0).length;
}

function hasContent(s: string): boolean { return !!s && s.trim().length > 0; }

const INTL_CERTS = ["ISO9001","ISO14001","ISO45001","CE","UL","FCC","FDA","IATF","SA8000","ISO22000","ISO13485","MDR","UKCA","PSE","KC","SABER","BIS","EAC","RCM","ISED","CSA","INMETRO","TISI","SNI","SONCAP","HACCP"];

function isIntlCert(name: string): boolean { return INTL_CERTS.some(k => name.includes(k)); }

// ── UNSPSC 预定义映射 ──

const UNSPSC_MAP: Record<string, { code: string; name: string; nameEn: string; level: string; note: string }[]> = {
  "变压器": [{ code: "39121100", name: "变压器", nameEn: "Transformer", level: "高", note: "直接匹配" }, { code: "39121110", name: "断路器开关柜", nameEn: "Breaker & Switchboard", level: "中高", note: "关联设备" }],
  "开关柜": [{ code: "39121110", name: "断路器开关柜", nameEn: "Circuit breaker switchboard", level: "中高", note: "结合BOM确认" }],
  "箱式变电站": [{ code: "39121100", name: "箱式变电站(组合映射)", nameEn: "Compact Substation", level: "中高", note: "按核心BOM组合编码" }],
  "储能": [{ code: "26111734", name: "电池储能系统", nameEn: "Battery energy storage system", level: "高潜力", note: "需同时建立电池/PCS/EMS关联编码" }],
  "电缆": [{ code: "26121100", name: "电力电缆", nameEn: "Power cable", level: "高", note: "直接匹配" }],
  "电机": [{ code: "26141100", name: "电动机", nameEn: "Electric motor", level: "高", note: "直接匹配" }],
  "高低压": [{ code: "39121110", name: "高/低压开关设备", nameEn: "HV/LV switchgear", level: "中高", note: "按额定参数确认" }],
};

function matchUnspsc(mainProduct: string): UnspscMapping[] {
  if (!mainProduct) return [];
  const results: UnspscMapping[] = [];
  const products = mainProduct.split(/[,，、;；\s]+/).filter(Boolean);
  for (const p of products) {
    let matched = false;
    for (const [keyword, mappings] of Object.entries(UNSPSC_MAP)) {
      if (p.includes(keyword) || keyword.includes(p)) {
        for (const m of mappings) {
          results.push({ product: p, candidateCode: m.code, candidateName: `${m.name} / ${m.nameEn}`, matchLevel: m.level, note: m.note });
        }
        matched = true;
      }
    }
    if (!matched && p.length >= 2) {
      results.push({ product: p, candidateCode: "待匹配", candidateName: "需人工确认", matchLevel: "待确认", note: "建议建立英文关键词五联表后反向验证" });
    }
  }
  return results;
}

// ── 主函数 ──

export function generateDiagnosticReport(input: QualificationScoreInput, scoring: ScoringResult, id?: number, assessDate?: string): DiagnosticReport {
  const date = assessDate || new Date().toISOString().slice(0, 10);
  const certCount = input.certifications.length;
  const intlCertCount = input.certifications.filter(isIntlCert).length;
  const serviceCount = countItems(input.service_countries);
  const overseasCount = countItems(input.overseas_companies);
  const hasEnglish = input.english_team !== "尚不具备";
  const hasExport = input.export_scale !== "尚未出口";
  const hasUngm = input.ungm_status !== "未注册";
  const hasBid = input.bid_willingness === "是";
  const hasOverseasEntity = hasContent(input.overseas_companies);
  const hasService = hasContent(input.service_countries);

  // ── 封面 ──
  const gradeStageMap: Record<string, { zh: string; en: string }> = {
    A: { zh: "进入国际公采系统化执行期", en: "Enter systematic procurement execution phase" },
    B: { zh: "进入国际公采系统化准备期", en: "Enter structured procurement-readiness phase" },
    C: { zh: "进入国际公采基础建设期", en: "Enter foundational capacity-building phase" },
  };
  const stage = gradeStageMap[scoring.grade] || gradeStageMap.C;

  const cover: DiagnosticReport["cover"] = {
    companyName: input.company_name, reportTitle: "国际公采能力诊断报告", assessDate: date,
    score: scoring.totalScore, grade: scoring.grade, gradeLabel: scoring.gradeLabel,
    stage: stage.zh, stageEn: stage.en,
    basis: "企业填写的国际公共采购能力测试信息（自报数据）",
    basisEn: "Company self-declared assessment information",
  };

  // ── 一、报告基本信息 ──
  const evSelf = "C：企业自报 / Self-declared";
  const evVerify = "C：待证书核验 / To be verified";
  const adminFields: FieldEntry[] = [
    { field: "企业名称", fieldEn: "Company Name", value: input.company_name, valueEn: input.company_name, evidence: evSelf, evidenceEn: evSelf },
    { field: "官网", fieldEn: "Website", value: input.company_website, valueEn: input.company_website, evidence: evSelf, evidenceEn: evSelf },
    { field: "成立时间", fieldEn: "Founded", value: input.founding_year || "-", valueEn: input.founding_year || "-", evidence: evSelf, evidenceEn: evSelf },
    { field: "员工规模", fieldEn: "Employees", value: input.employee_count || "-", valueEn: input.employee_count || "-", evidence: evSelf, evidenceEn: evSelf },
    { field: "所属行业", fieldEn: "Industry", value: input.industry.join(", "), valueEn: input.industry.join(", "), evidence: evSelf, evidenceEn: evSelf },
    { field: "主营产品", fieldEn: "Main Products", value: input.main_product, valueEn: input.main_product, evidence: evSelf, evidenceEn: evSelf },
    { field: "近2年国际业务", fieldEn: "2-year International Business", value: input.export_scale || "-", valueEn: input.export_scale || "-", evidence: evSelf, evidenceEn: evSelf },
    { field: "管理/产品认证", fieldEn: "Certifications", value: input.certifications.join("、") || "-", valueEn: input.certifications.join(", ") || "-", evidence: certCount > 0 ? evVerify : evSelf, evidenceEn: certCount > 0 ? evVerify : evSelf },
    { field: "海外售后", fieldEn: "Overseas Service", value: input.service_countries || "-", valueEn: input.service_countries || "-", evidence: evSelf, evidenceEn: evSelf },
    { field: "海外公司", fieldEn: "Overseas Entity", value: input.overseas_companies || "-", valueEn: input.overseas_companies || "-", evidence: evSelf, evidenceEn: evSelf },
    { field: "UNGM注册", fieldEn: "UNGM Registration", value: input.ungm_status, valueEn: input.ungm_status, evidence: evSelf, evidenceEn: evSelf },
    { field: "英文商务及标书能力", fieldEn: "English Business & Bid Capability", value: input.english_team, valueEn: input.english_team, evidence: evSelf, evidenceEn: evSelf },
    { field: "30天账期", fieldEn: "30-day Payment Terms", value: input.payment_terms, valueEn: input.payment_terms, evidence: evSelf, evidenceEn: evSelf },
  ];

  const standardFinding = `${input.company_name}${hasExport ? "具备一定国际业务基础" : "尚处于国际业务起步阶段"}，持有 ${certCount} 项认证（${intlCertCount} 项国际认证）。${hasUngm ? "已完成UNGM注册。" : "尚未注册UNGM，需优先完成准入基础建设。"}${hasEnglish ? "英文团队能力具备。" : "英文能力需重点补强。"}`;
  const standardFindingEn = `${input.company_name} has ${hasExport ? "some international business foundation" : "just started international business"} with ${certCount} certifications (${intlCertCount} international). ${hasUngm ? "UNGM registered." : "UNGM registration pending — priority."} ${hasEnglish ? "English capability available." : "English capability needs strengthening."}`;

  // ── 二、企业基础画像 ──
  const profileItems: ProfileDiagnosticItem[] = [
    {
      item: "企业规模与稳定性", itemEn: "Scale & Stability",
      status: `成立${input.founding_year || "未知"}，${input.employee_count || "未知"}人`,
      statusEn: `Founded ${input.founding_year || "unknown"}, ${input.employee_count || "unknown"} employees`,
      finding: input.employee_count === "200-500人" || input.employee_count === "500人以上" ? "具备持续经营及制造组织基础" : "规模较小，需补充稳定性证据",
      findingEn: input.employee_count === "200-500人" || input.employee_count === "500人以上" ? "Adequate operating foundation" : "Smaller scale, supplementary evidence needed",
      recommendation: "补充审计报表、产能、厂区、关键生产设备、质量团队等证据",
      recommendationEn: "Add audited financials, capacity, factory and quality team evidence",
    },
    {
      item: "国际业务基础", itemEn: "International Track Record",
      status: input.export_scale || "未提供",
      statusEn: input.export_scale || "Not provided",
      finding: hasExport ? "已有出口基础，但大型国际公采资格门槛可能更高" : "尚无出口经验，需从零建立",
      findingEn: hasExport ? "Existing export basis, but large tenders may require higher thresholds" : "No export experience yet",
      recommendation: hasExport ? "建立近5年国际项目Reference List，优先筛选同类产品业绩" : "先从EPC/代理商合作模式切入，积累国际项目经验",
      recommendationEn: hasExport ? "Build a 5-year reference list, prioritize similar product cases" : "Start with EPC/agent partnership to accumulate experience",
    },
    {
      item: "海外组织", itemEn: "Overseas Presence",
      status: `${hasOverseasEntity ? input.overseas_companies : "无"}；${hasService ? input.service_countries : "无售后点"}`,
      statusEn: `${hasOverseasEntity ? input.overseas_companies : "None"}; ${hasService ? input.service_countries : "No service points"}`,
      finding: hasOverseasEntity ? "欧洲/中东具备本地化优势" : "海外覆盖有限",
      findingEn: hasOverseasEntity ? "Localization advantage in Europe/Middle East" : "Limited overseas coverage",
      recommendation: hasOverseasEntity ? "在东南亚、非洲、拉美等重点市场发展EPC/售后伙伴" : "优先建立1-2个重点区域合作伙伴",
      recommendationEn: hasOverseasEntity ? "Build partners in SEA, Africa, LatAm priority regions" : "Prioritize 1-2 key regional partners",
    },
    {
      item: "管理体系", itemEn: "Management Systems",
      status: certCount > 0 ? input.certifications.join("、") : "未提供",
      statusEn: certCount > 0 ? input.certifications.join(", ") : "Not provided",
      finding: certCount >= 3 ? "质量/环境/HSE基础较好" : "认证数量有限，需补强",
      findingEn: certCount >= 3 ? "Strong QHSE foundation" : "Limited certifications, needs strengthening",
      recommendation: "建立国际机构专项合规文件包",
      recommendationEn: "Build procurement-specific compliance package",
    },
    {
      item: "英文组织能力", itemEn: "English Capability",
      status: input.english_team,
      statusEn: input.english_team,
      finding: input.english_team === "具备且经验丰富" ? "明显优势" : input.english_team === "具备但经验一般" ? "有基础但需实战验证" : "重大缺口",
      findingEn: input.english_team === "具备且经验丰富" ? "Clear strength" : input.english_team === "具备但经验一般" ? "Foundation exists, needs validation" : "Major gap",
      recommendation: hasEnglish ? "固定技术、商务、法务、财务投标角色" : "优先招聘或外包英文标书能力",
      recommendationEn: hasEnglish ? "Assign fixed roles for technical, commercial, legal, financial bidding" : "Prioritize recruiting or outsourcing English bid capability",
    },
  ];

  // ── 三、标准/认证诊断 ──
  const held = input.certifications.map(c => ({ name: c, status: isIntlCert(c) ? "已持有（国际）" : "已持有" }));
  const gaps: CertGap[] = [];
  if (!input.certifications.some(c => c.includes("SA8000"))) gaps.push({ gap: "SA8000 社会责任管理体系", gapEn: "SA8000 Social Accountability", priority: "Medium" });
  if (!input.certifications.some(c => c.includes("ISO22000") || c.includes("HACCP"))) gaps.push({ gap: "食品安全体系（如适用）", gapEn: "Food safety system (if applicable)", priority: "Low" });
  if (!input.certifications.some(c => c.includes("IATF"))) gaps.push({ gap: "IATF16949 汽车行业质量（如适用）", gapEn: "IATF16949 Automotive (if applicable)", priority: "Low" });
  const certRecs: string[] = [
    "盘点现有证书有效期及覆盖范围",
    "建立证书-目标市场匹配矩阵",
    "优先补齐高频国际公采要求的认证",
  ];

  // ── 四、UNSPSC ──
  const unspscProducts = matchUnspsc(input.main_product);
  const unspscMaturity = Math.min(Math.round((unspscProducts.filter(u => u.matchLevel === "高").length / Math.max(unspscProducts.length, 1)) * 80 + 10), 90);
  const unspscStatus = `UNSPSC 体系化成熟度约 ${unspscMaturity}/100。产品本身"可匹配度高"，但企业尚未提供正式的SKU定位编码库，当前应视为"编码未就绪"。建议30天内完成核心产品线8位编码初配。`;
  const unspscStatusEn = `UNSPSC maturity is estimated at ${unspscMaturity}/100. Product mappability is high, but no formal SKU-level taxonomy has been evidenced. Build 8-digit code mapping within 30 days.`;

  // ── 五、国际业务与履约 ──
  const intlItems: CapabilityItem[] = [
    { capability: "出口经验", capabilityEn: "Export Experience", result: input.export_scale || "未提供", risk: hasExport ? "中" : "高", recommendation: hasExport ? "用合同、报关、提单、验收等形成可核验证据链" : "先通过EPC/代理商模式积累国际业绩", recommendationEn: hasExport ? "Build verifiable evidence chain with contracts, customs docs, B/L" : "Accumulate references via EPC/agent model" },
    { capability: "海外服务", capabilityEn: "Overseas Service", result: hasService ? input.service_countries : "未提供", risk: serviceCount >= 3 ? "低" : "中", recommendation: "建立服务网点证明、备件清单、响应SLA", recommendationEn: "Evidence service network, spare parts list, response SLA" },
    { capability: "海外实体", capabilityEn: "Overseas Entity", result: hasOverseasEntity ? input.overseas_companies : "未提供", risk: hasOverseasEntity ? "低" : "中高", recommendation: hasOverseasEntity ? "可作为商务/售后资源，但投标主体需按项目资格判断" : "优先在重点区域设立代表处或合作伙伴", recommendationEn: hasOverseasEntity ? "Strategic resource; bidder entity must meet tender requirements" : "Establish representative office or partners in priority regions" },
    { capability: "交付与物流", capabilityEn: "Delivery & Logistics", result: "未提供详细数据", risk: "中", recommendation: "按产品体积/危险等级建立Incoterms和物流方案", recommendationEn: "Build Incoterms and logistics playbook by product" },
    { capability: "账期", capabilityEn: "Payment Terms", result: input.payment_terms === "可以" ? "可接受30天" : "不接受", risk: input.payment_terms === "可以" ? "低" : "中", recommendation: "进一步测试60/90天及分期付款场景", recommendationEn: "Stress-test 60/90 day and installment scenarios" },
    { capability: "投标/履约保函", capabilityEn: "Bid & Performance Bonds", result: "未提供", risk: "中高", recommendation: "核验银行授信、保函额度、开立周期、受益人国家可接受性", recommendationEn: "Verify credit line, bond capacity, issuance cycle, beneficiary acceptance" },
    { capability: "本地安装调试", capabilityEn: "Local Installation", result: "未提供", risk: "中高", recommendation: "需现场安装的项目优先采用EPC/本地伙伴模式", recommendationEn: "Partner for installation-heavy bids" },
  ];

  // ── 六、投标组织 ──
  const bidModules: BidModule[] = [
    { module: "机会筛选", moduleEn: "Opportunity Screening", status: "未展示固定机制", owner: "国际业务负责人", target: "建立Go/No-Go流程", kpi: "每周5-10条高匹配机会" },
    { module: "技术响应", moduleEn: "Technical Response", status: "具备产品团队基础", owner: "技术负责人", target: "建立标准技术响应库", kpi: "核心产品线100%建立Datasheet/偏差表模板" },
    { module: "英文标书", moduleEn: "English Bidding", status: input.english_team, owner: "投标经理", target: "标准化模板与审校机制", kpi: "关键文档双人复核，零重大格式/遗漏" },
    { module: "商务报价", moduleEn: "Commercial Pricing", status: "未提供机制", owner: "国际商务+财务", target: "建立全成本报价模型", kpi: "汇率/物流/税费/保函/质保/风险金纳入模型" },
    { module: "合规审查", moduleEn: "Compliance Review", status: "专项体系待建", owner: "合规/法务", target: "项目级审查", kpi: "所有Go项目100%完成制裁/出口管制/COI筛查" },
    { module: "最终审批", moduleEn: "Final Approval", status: "未提供", owner: "管理层", target: "建立提交前Gate Review", kpi: "投标截止前48小时完成最终审查" },
  ];

  // ── 七、关键短板与风险 ──
  const risks: RiskItem[] = [];
  let riskId = 1;
  if (!hasUngm) risks.push({ id: `R${riskId++}`, risk: "UNGM未注册", riskEn: "UNGM not registered", severity: "High", impact: "无法形成联合国采购系统化准入与机会订阅", owner: "国际业务/BD", due: "30天" });
  if (certCount < 3) risks.push({ id: `R${riskId++}`, risk: "项目级国际标准/型式试验证据不足", riskEn: "Project-specific standards evidence incomplete", severity: "High", impact: "可能直接导致技术不合格", owner: "技术/质量", due: "30-60天" });
  if (!hasExport || input.export_scale === "尚未出口") risks.push({ id: `R${riskId++}`, risk: "同类国际项目业绩证据不足", riskEn: "Insufficient verifiable references", severity: "High", impact: "资格预审和评分受影响", owner: "国际业务", due: "30天" });
  risks.push({ id: `R${riskId++}`, risk: "国际合规专项体系未形成", riskEn: "Procurement-specific compliance not formalized", severity: "High", impact: "反腐败、制裁、出口管制风险", owner: "法务/合规", due: "60天" });
  risks.push({ id: `R${riskId++}`, risk: "UNSPSC编码库未形成", riskEn: "No formal UNSPSC library", severity: "Medium", impact: "搜标召回率与匹配准确率低", owner: "数据/国际业务", due: "30天" });
  risks.push({ id: `R${riskId++}`, risk: "保函/授信能力未核验", riskEn: "Bonding capacity unknown", severity: "Medium", impact: "大额项目可能无法提交或履约", owner: "财务", due: "30天" });
  if (serviceCount < 3) risks.push({ id: `R${riskId++}`, risk: "非欧洲/中东本地服务覆盖不足", riskEn: "Limited service outside Europe/Middle East", severity: "Medium", impact: "限制安装、调试及SLA型项目", owner: "海外事业部", due: "60天" });

  // ── 八、市场匹配 ──
  const market: DiagnosticReport["market"] = {
    priorityOrders: "设备供货型、金额中等、技术标准清晰、无需复杂本地施工牌照",
    priorityProducts: `${input.main_product || "核心产品"}；成熟产品优先建立公采业绩`,
    priorityBuyers: "公用事业公司、能源部门、MDB项目执行机构、UN基础设施项目、EPC总包商",
    priorityRegions: hasOverseasEntity ? `${input.overseas_companies}可利用现有网络；并逐步拓展东南亚、非洲` : "优先拓展欧洲/中东，逐步覆盖东南亚、非洲",
    goNoGoGate: "资格100%满足；核心技术条款>=90%；合规无红线；付款保函可承受；交期可实现",
  };

  // ── 九、KPI ──
  const kpiItems: KpiItem[] = [
    { area: "UNGM与平台准入", areaEn: "Portal Readiness", day30: "完成UNGM Basic；建立平台账号台账", day60: "完成目标机构供应商资料补充", day90: "维护账号、证书有效期和订阅", owner: "国际业务" },
    { area: "证书/标准矩阵", areaEn: "Certification Matrix", day30: "4条主产品线100%盘点", day60: "补齐高频IEC/型式试验证据清单", day90: "项目级快速调用", owner: "技术/质量" },
    { area: "国际业绩", areaEn: "References", day30: ">=10个近5年案例", day60: "证据完整率>=80%", day90: "形成按产品/区域/金额筛选库", owner: "国际业务" },
    { area: "国际合规成熟度", areaEn: "Compliance Maturity", day30: "完成制度/声明清单", day60: "建立制裁/出口管制/反腐败SOP", day90: "专项准备度>=85%", owner: "合规/法务" },
    { area: "UNSPSC编码匹配", areaEn: "UNSPSC Mapping", day30: "核心SKU完成8位编码初配", day60: "与英文关键词和参数绑定", day90: "核心产品覆盖100%", owner: "国际业务/数据" },
    { area: "机会筛选", areaEn: "Opportunity Screening", day30: "每周5-10条高匹配机会", day60: "形成Go/No-Go评分卡", day90: "稳定输出高匹配项目池", owner: "国际业务" },
    { area: "投标闭环", areaEn: "Bid Execution", day30: "完成模板/清单/报价模型", day60: "至少1个实投", day90: "累计2-3个高匹配实投", owner: "投标团队" },
    { area: "海外履约网络", areaEn: "Local Delivery Network", day30: "梳理现有网络能力", day60: "新增1-2个重点区域伙伴", day90: "累计新增2-3个EPC/售后伙伴", owner: "海外事业部" },
  ];

  // ── 十、90天行动计划 ──
  const roadmapPhases: RoadmapPhase[] = [
    { phase: "基础底座", days: "Day 0-30", actions: "UNGM注册；英文公司资料包；证书标准矩阵；>=10个业绩；国际合规清单；UNSPSC初配；银行保函能力核验", deliverables: "国际公采基础资料包", acceptance: "可完成供应商注册、资格预审和基础Go/No-Go" },
    { phase: "搜标与投标准备", days: "Day 31-60", actions: "关键词/UNSPSC反向校验；合规SOP；技术响应模板；报价模型；目标采购方与EPC清单", deliverables: "搜标与投标准备体系", acceptance: "每周稳定筛出5-10条机会，至少1个进入实投" },
    { phase: "真实投标闭环", days: "Day 61-90", actions: "完成2-3个真实投标；项目级合规审查；建立澄清/报价/提交复盘；拓展2-3个本地服务/EPC伙伴", deliverables: "真实投标闭环", acceptance: "形成搜标-筛选-合规-技术-商务-审批-提交-复盘闭环" },
  ];

  // ── 十一、综合结论 ──
  const strengthList: string[] = [];
  if (certCount >= 3) strengthList.push(`${certCount}项认证（含${intlCertCount}项国际认证）`);
  if (hasEnglish) strengthList.push(`英文团队${input.english_team}`);
  if (hasOverseasEntity) strengthList.push(`${input.overseas_companies}有海外实体`);
  if (hasService) strengthList.push(`${input.service_countries}有售后服务`);
  if (input.payment_terms === "可以") strengthList.push("可接受30天账期");
  if (hasExport) strengthList.push(`出口规模${input.export_scale}`);

  const gapList: string[] = [];
  if (!hasUngm) gapList.push("UNGM未注册");
  gapList.push("国际业绩证据不足");
  gapList.push("UNSPSC编码库未建立");
  gapList.push("国际合规体系待完善");
  if (!hasBid) gapList.push("投标意愿待确认");

  const conclusion: DiagnosticReport["conclusion"] = {
    score: scoring.totalScore, grade: scoring.grade,
    position: `${input.company_name}已具备开展国际公共采购业务的核心基础，主要挑战是将既有能力转换为国际公采可验证证据与标准化投标体系。`,
    positionEn: `${input.company_name} already possesses core capabilities for international public procurement. The main challenge is converting existing capabilities into verifiable evidence and a standardized bidding system.`,
    strengths: strengthList.join("；") || "基础信息有限，需进一步评估",
    strengthsEn: strengthList.join("; ") || "Limited information, further assessment needed",
    gaps: gapList.join("；"),
    gapsEn: gapList.join("; "),
    recommendedStage: stage.zh,
    recommendedProducts: `${input.main_product || "核心产品"}优先；成熟产品线先行建立公采业绩`,
    recommendedRoute: "优先设备供货型项目，并与EPC/本地服务商联合，降低施工牌照与本地履约门槛",
    finalOpinion: `${input.company_name}已经具备开展国际公共采购业务的核心基础，不属于"产品或团队能力不足"的企业，而属于"需要把既有能力转换成国际公采可验证证据与标准化投标体系"的企业。建议纳入重点培育企业池。未来90天应优先完成UNGM注册、国际标准/型式试验矩阵、国际项目业绩证据库、国际合规体系、核心产品UNSPSC编码库、保函授信核验及目标市场履约网络建设。`,
    finalOpinionEn: `${input.company_name} already possesses the core capabilities to participate in international public procurement. The company is recommended for the priority development pool. Over the next 90 days, priority actions include UNGM registration, standards/type-test matrix, verifiable references, procurement compliance, UNSPSC taxonomy, bonding verification and delivery-network expansion.`,
  };

  // ── 免责声明 ──
  const disclaimer = {
    zh: "本报告为基于企业自报测试信息的国际公共采购准备度诊断，不构成任何具体项目的投标资格确认、法律意见、认证意见、制裁/出口管制法律判断或中标保证。实际投标资格必须以具体招标文件、采购方规则、目的国法律、技术标准及适用合规要求为准。",
    en: "This report is a procurement-readiness diagnostic based on self-declared company information. It does not constitute legal advice, certification, eligibility confirmation for any specific solicitation, sanctions/export-control legal determination or guarantee of award.",
  };

  return {
    cover, admin: { fields: adminFields, standardFinding, standardFindingEn }, profile: { items: profileItems },
    standards: { held, gaps, recommendations: certRecs }, unspsc: { products: unspscProducts, maturityScore: unspscMaturity, status: unspscStatus, statusEn: unspscStatusEn },
    international: { items: intlItems }, bidOrg: { modules: bidModules }, risks: { items: risks },
    market, kpis: { items: kpiItems }, roadmap: { phases: roadmapPhases },
    conclusion, disclaimer,
  };
}
