/**
 * 供应商资质诊断表单 — 本地化选项常量
 *
 * 所有选项值通过 i18n 翻译函数获取，确保跟随当前语言环境。
 * 表单内部值（提交到后端的值）使用中文，与 crm_supplier_qualification 表保持一致。
 *
 * @module shared/data/qualificationOptions
 */

type T = (key: string) => string;

/** 选项：显示文本（本地化）+ 提交值（中文，与数据库一致） */
export interface QualOption { label: string; value: string }

export function getEmployeeOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptEmpUnder50"), value: "50人以下" },
    { label: t("qualOptEmp50to200"), value: "50-200人" },
    { label: t("qualOptEmp200to500"), value: "200-500人" },
    { label: t("qualOptEmpOver500"), value: "500人以上" },
  ];
}

export function getIndustryOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptIndAgriculture"), value: "农林牧渔业" },
    { label: t("qualOptIndFood"), value: "食品加工与食品、饮料制造业" },
    { label: t("qualOptIndTextile"), value: "纺织业、化学纤维制造业" },
    { label: t("qualOptIndApparel"), value: "服装、鞋帽、皮革制造业" },
    { label: t("qualOptIndWood"), value: "木材加工及木、竹、藤、棕、草制品、家具制造业" },
    { label: t("qualOptIndPaper"), value: "纸制品、印刷业、文教体育、办公用品制造业" },
    { label: t("qualOptIndNonmetal"), value: "非金属矿物制品业（含水泥、玻璃、陶瓷、耐火材料等）" },
    { label: t("qualOptIndMetal"), value: "金属制品业" },
    { label: t("qualOptIndChemical"), value: "化学原料及化学制品制造业" },
    { label: t("qualOptIndRubber"), value: "橡胶制品、塑料制品业" },
    { label: t("qualOptIndElectronics"), value: "通信设备、计算机及其他电子设备制造业" },
    { label: t("qualOptIndElectrical"), value: "电气机械及器材、线缆制造业" },
    { label: t("qualOptIndInstrument"), value: "仪器仪表制造业" },
    { label: t("qualOptIndGeneralEquip"), value: "通用设备和专用设备制造业" },
    { label: t("qualOptIndCrafts"), value: "工艺品其他制造业" },
    { label: t("qualOptIndOther"), value: "其他（请注明）" },
  ];
}

export function getExportOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptExpNone"), value: "尚未出口" },
    { label: t("qualOptExpUnder1M"), value: "100万美元以内" },
    { label: t("qualOptExp1Mto5M"), value: "100-500万美元" },
    { label: t("qualOptExp5Mto20M"), value: "500-2000万美元" },
    { label: t("qualOptExpOver20M"), value: "2000万美元以上" },
  ];
}

export function getCertOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptCertISO9001"), value: "ISO9001质量管理体系认证" },
    { label: t("qualOptCertISO14001"), value: "ISO14001环境管理体系认证" },
    { label: t("qualOptCertISO45001"), value: "ISO45001职业健康安全管理体系认证" },
    { label: t("qualOptCertSA8000"), value: "SA8000社会责任管理体系" },
    { label: t("qualOptCertISO22000"), value: "ISO22000 / HACCP 食品安全体系" },
    { label: t("qualOptCertISO13485"), value: "ISO13485 医疗器械质量体系" },
    { label: t("qualOptCertIATF16949"), value: "IATF16949 汽车行业质量管理" },
    { label: t("qualOptCertCE"), value: "CE认证（欧盟）" },
    { label: t("qualOptCertMDR"), value: "MDR认证（欧盟，医疗）" },
    { label: t("qualOptCertUKCA"), value: "UKCA认证（英国）" },
    { label: t("qualOptCertUL"), value: "UL认证（美国）" },
    { label: t("qualOptCertFCC"), value: "FCC认证（美国，无线/电子产品）" },
    { label: t("qualOptCertFDA"), value: "FDA认证（美国，医疗/食品）" },
    { label: t("qualOptCertCPC"), value: "CPC认证（美国，儿童产品）" },
    { label: t("qualOptCertPSE"), value: "PSE认证（日本，电气产品）" },
    { label: t("qualOptCertMIC"), value: "MIC/TELEC（日本，无线设备）" },
    { label: t("qualOptCertKC"), value: "KC认证（韩国）" },
    { label: t("qualOptCertSABER"), value: "SABER/SASO（沙特）" },
    { label: t("qualOptCertBIS"), value: "BIS认证（印度）" },
    { label: t("qualOptCertEAC"), value: "EAC认证（俄罗斯/欧亚）" },
    { label: t("qualOptCertRCM"), value: "RCM认证（澳大利亚/新西兰）" },
    { label: t("qualOptCertISED"), value: "ISED认证（加拿大，无线设备）" },
    { label: t("qualOptCertCSA"), value: "CSA认证（加拿大，电气、建材、医疗）" },
    { label: t("qualOptCertINMETRO"), value: "INMETRO认证（巴西）" },
    { label: t("qualOptCertTISI"), value: "TISI认证（泰国）" },
    { label: t("qualOptCertSNI"), value: "SNI认证（印尼）" },
    { label: t("qualOptCertSONCAP"), value: "SONCAP认证（尼日利亚）" },
    { label: t("qualOptCertGMark"), value: "G-Mark（海湾七国）" },
  ];
}

export function getUngmOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptUngmNone"), value: "未注册" },
    { label: t("qualOptUngmBasic"), value: "已注册基础级(Basic)" },
    { label: t("qualOptUngmL1"), value: "已注册一级(Level 1)" },
    { label: t("qualOptUngmL2"), value: "已注册二级(Level 2)" },
  ];
}

export function getEnglishTeamOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptEngExpert"), value: "具备且经验丰富" },
    { label: t("qualOptEngBasic"), value: "具备但经验一般" },
    { label: t("qualOptEngNone"), value: "尚不具备" },
  ];
}

export function getPaymentOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptYes"), value: "可以" },
    { label: t("qualOptNo"), value: "不可以" },
  ];
}

export function getBidOptions(t: T): QualOption[] {
  return [
    { label: t("qualOptBidNo"), value: "否" },
    { label: t("qualOptBidYes"), value: "是" },
  ];
}
