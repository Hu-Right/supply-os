/**
 * 机构别名映射种子数据（含 i18n 多语言翻译）
 * Agency Alias Seed Data with i18n
 *
 * @module server/data/agency-i18n/aliases
 * @description 经过验证的国际采购机构别名映射 + 联合国 6 种官方语言翻译。
 *              canonical: 标准机构名（英文，展示用，使用最广泛认可的简称）
 *              aliases: 该机构的所有已知别名/全称（大写存储，用于匹配归并）
 *              i18n: 各语言翻译名 { zh, fr, ru, es, ar }（en 即 canonical 本身）
 *
 *              维护原则：
 *              1. 只映射确实指向同一法律实体的名称变体
 *              2. 不确定归属的缩写不纳入（避免错误合并）
 *              3. canonical 选择最简洁、最广为人知的形式
 *              4. 翻译以该机构官方/最常用的译名为准
 */

export interface AgencyAliasGroup {
  canonical: string;
  aliases: string[];
  i18n: {
    zh?: string;
    fr?: string;
    ru?: string;
    es?: string;
    ar?: string;
  };
}

/**
 * 经过验证的机构别名映射分组表
 * 每组 = 一个法律实体 + 其所有别名 + 多语言翻译
 */
export const AGENCY_ALIAS_GROUPS: AgencyAliasGroup[] = [
  // ═══════════════════════════════════════════════════════════════
  // 联合国系统 (UN System)
  // ═══════════════════════════════════════════════════════════════
  {
    canonical: "UNDP",
    aliases: [
      "UNITED NATIONS DEVELOPMENT PROGRAMME",
      "UNITED NATIONS DEVELOPMENT PROGRAM",
      "UN DEVELOPMENT PROGRAMME",
      "UN DEVELOPMENT PROGRAM",
      "U.N.D.P.",
    ],
    i18n: { zh: "联合国开发计划署", fr: "PNUD", ru: "ПРООН", es: "PNUD", ar: "برنامج الأمم المتحدة الإنمائي" },
  },
  {
    canonical: "UNICEF",
    aliases: [
      "UNITED NATIONS CHILDREN'S FUND",
      "UNITED NATIONS INTERNATIONAL CHILDREN'S EMERGENCY FUND",
      "UN CHILDREN'S FUND",
      "U.N.I.C.E.F.",
    ],
    i18n: { zh: "联合国儿童基金会", fr: "UNICEF", ru: "ЮНИСЕФ", es: "UNICEF", ar: "منظمة الأمم المتحدة للطفولة" },
  },
  {
    canonical: "WHO",
    aliases: ["WORLD HEALTH ORGANIZATION", "WORLD HEALTH ORGANISATION", "W.H.O."],
    i18n: { zh: "世界卫生组织", fr: "OMS", ru: "ВОЗ", es: "OMS", ar: "منظمة الصحة العالمية" },
  },
  {
    canonical: "FAO",
    aliases: [
      "FOOD AND AGRICULTURE ORGANIZATION",
      "FOOD AND AGRICULTURE ORGANIZATION OF THE UNITED NATIONS",
      "FOOD AND AGRICULTURE ORGANISATION",
      "F.A.O.",
    ],
    i18n: { zh: "联合国粮食及农业组织", fr: "FAO", ru: "ФАО", es: "FAO", ar: "منظمة الأغذية والزراعة" },
  },
  {
    canonical: "UNESCO",
    aliases: [
      "UNITED NATIONS EDUCATIONAL, SCIENTIFIC AND CULTURAL ORGANIZATION",
      "UNITED NATIONS EDUCATIONAL SCIENTIFIC AND CULTURAL ORGANIZATION",
      "U.N.E.S.C.O.",
    ],
    i18n: { zh: "联合国教科文组织", fr: "UNESCO", ru: "ЮНЕСКО", es: "UNESCO", ar: "منظمة الأمم المتحدة للتربية والعلم والثقافة" },
  },
  {
    canonical: "UNFPA",
    aliases: ["UNITED NATIONS POPULATION FUND", "UNITED NATIONS FUND FOR POPULATION ACTIVITIES"],
    i18n: { zh: "联合国人口基金", fr: "FNUAP", ru: "ЮНФПА", es: "UNFPA", ar: "صندوق الأمم المتحدة للسكان" },
  },
  {
    canonical: "UNOPS",
    aliases: ["UNITED NATIONS OFFICE FOR PROJECT SERVICES"],
    i18n: { zh: "联合国项目事务署", fr: "UNOPS", ru: "ЮНОПС", es: "UNOPS", ar: "مكتب الأمم المتحدة لخدمات المشاريع" },
  },
  {
    canonical: "UNHCR",
    aliases: [
      "OFFICE OF THE UNITED NATIONS HIGH COMMISSIONER FOR REFUGEES",
      "UNITED NATIONS HIGH COMMISSIONER FOR REFUGEES",
    ],
    i18n: { zh: "联合国难民署", fr: "HCR", ru: "УВКБ ООН", es: "ACNUR", ar: "مفوضية الأمم المتحدة لشؤون اللاجئين" },
  },
  {
    canonical: "UNEP",
    aliases: ["UNITED NATIONS ENVIRONMENT PROGRAMME", "UNITED NATIONS ENVIRONMENT PROGRAM"],
    i18n: { zh: "联合国环境规划署", fr: "PNUE", ru: "ЮНЕП", es: "PNUMA", ar: "برنامج الأمم المتحدة للبيئة" },
  },
  {
    canonical: "UN-Habitat",
    aliases: [
      "UNITED NATIONS HUMAN SETTLEMENTS PROGRAMME",
      "UNITED NATIONS HUMAN SETTLEMENTS PROGRAM",
    ],
    i18n: { zh: "联合国人居署", fr: "ONU-Habitat", ru: "ООН-Хабитат", es: "ONU-Hábitat", ar: "موئل الأمم المتحدة" },
  },
  {
    canonical: "UNODC",
    aliases: ["UNITED NATIONS OFFICE ON DRUGS AND CRIME"],
    i18n: { zh: "联合国毒品和犯罪问题办公室", fr: "ONUDC", ru: "УНП ООН", es: "UNODC", ar: "مكتب الأمم المتحدة المعني بالمخدرات والجريمة" },
  },
  {
    canonical: "WFP",
    aliases: ["WORLD FOOD PROGRAMME", "WORLD FOOD PROGRAM"],
    i18n: { zh: "世界粮食计划署", fr: "PAM", ru: "ВПП", es: "PMA", ar: "برنامج الأغذية العالمي" },
  },
  {
    canonical: "UN Women",
    aliases: [
      "UNITED NATIONS ENTITY FOR GENDER EQUALITY AND THE EMPOWERMENT OF WOMEN",
      "UNITED NATIONS ENTITY FOR GENDER EQUALITY",
      "UN-WOMEN",
      "UN WOMEN",
    ],
    i18n: { zh: "联合国妇女署", fr: "ONU Femmes", ru: "ООН-Женщины", es: "ONU Mujeres", ar: "هيئة الأمم المتحدة للمرأة" },
  },
  {
    canonical: "ILO",
    aliases: ["INTERNATIONAL LABOUR ORGANIZATION", "INTERNATIONAL LABOR ORGANIZATION"],
    i18n: { zh: "国际劳工组织", fr: "OIT", ru: "МОТ", es: "OIT", ar: "منظمة العمل الدولية" },
  },
  {
    canonical: "IAEA",
    aliases: ["INTERNATIONAL ATOMIC ENERGY AGENCY"],
    i18n: { zh: "国际原子能机构", fr: "AIEA", ru: "МАГАТЭ", es: "OIEA", ar: "الوكالة الدولية للطاقة الذرية" },
  },
  {
    canonical: "UNCTAD",
    aliases: ["UNITED NATIONS CONFERENCE ON TRADE AND DEVELOPMENT"],
    i18n: { zh: "联合国贸发会议", fr: "CNUCED", ru: "ЮНКТАД", es: "UNCTAD", ar: "مؤتمر الأمم المتحدة للتجارة والتنمية" },
  },
  {
    canonical: "UNRWA",
    aliases: ["UNITED NATIONS RELIEF AND WORKS AGENCY FOR PALESTINE REFUGEES IN THE NEAR EAST"],
    i18n: { zh: "联合国近东巴勒斯坦难民救济和工程处", fr: "UNRWA", ru: "БАПОР", es: "UNRWA", ar: "وكالة الأمم المتحدة لإغاثة وتشغيل اللاجئين الفلسطينيين" },
  },
  {
    canonical: "UNITAR",
    aliases: ["UNITED NATIONS INSTITUTE FOR TRAINING AND RESEARCH"],
    i18n: { zh: "联合国训练研究所", fr: "UNITAR", ru: "ЮНИТАР", es: "UNITAR", ar: "معهد الأمم المتحدة للتدريب والبحث" },
  },
  {
    canonical: "UNU",
    aliases: ["UNITED NATIONS UNIVERSITY"],
    i18n: { zh: "联合国大学", fr: "UNU", ru: "УООН", es: "UNU", ar: "جامعة الأمم المتحدة" },
  },
  {
    canonical: "IOM",
    aliases: ["INTERNATIONAL ORGANIZATION FOR MIGRATION"],
    i18n: { zh: "国际移民组织", fr: "OIM", ru: "МОМ", es: "OIM", ar: "المنظمة الدولية للهجرة" },
  },

  // ═══════════════════════════════════════════════════════════════
  // 多边开发银行 (Multilateral Development Banks)
  // ═══════════════════════════════════════════════════════════════
  {
    canonical: "World Bank",
    aliases: [
      "THE WORLD BANK",
      "WORLD BANK GROUP",
      "THE WORLD BANK GROUP",
      "WBG",
      "INTERNATIONAL BANK FOR RECONSTRUCTION AND DEVELOPMENT",
      "IBRD",
      "INTERNATIONAL DEVELOPMENT ASSOCIATION",
      "IDA",
    ],
    i18n: { zh: "世界银行", fr: "Banque mondiale", ru: "Всемирный банк", es: "Banco Mundial", ar: "البنك الدولي" },
  },
  {
    canonical: "ADB",
    aliases: ["ASIAN DEVELOPMENT BANK", "ASIAN DEVELOPMENT FUND", "ADF"],
    i18n: { zh: "亚洲开发银行", fr: "BAD", ru: "АзБР", es: "BAsD", ar: "بنك التنمية الآسيوي" },
  },
  {
    canonical: "AfDB",
    aliases: ["AFRICAN DEVELOPMENT BANK", "AFRICAN DEVELOPMENT FUND"],
    i18n: { zh: "非洲开发银行", fr: "BAD", ru: "АфРБ", es: "BAfD", ar: "بنك التنمية الأفريقي" },
  },
  {
    canonical: "IDB",
    aliases: ["INTER-AMERICAN DEVELOPMENT BANK", "INTER AMERICAN DEVELOPMENT BANK", "IADB", "PAN AMERICAN DEVELOPMENT BANK"],
    i18n: { zh: "美洲开发银行", fr: "BID", ru: "МАБР", es: "BID", ar: "بنك التنمية للبلدان الأمريكية" },
  },
  {
    canonical: "EBRD",
    aliases: ["EUROPEAN BANK FOR RECONSTRUCTION AND DEVELOPMENT", "EBRD"],
    i18n: { zh: "欧洲复兴开发银行", fr: "BERD", ru: "ЕБРР", es: "BERD", ar: "البنك الأوروبي لإعادة الإعمار والتنمية" },
  },
  {
    canonical: "EIB",
    aliases: ["EUROPEAN INVESTMENT BANK"],
    i18n: { zh: "欧洲投资银行", fr: "BEI", ru: "ЕИБ", es: "BEI", ar: "البنك الأوروبي للاستثمار" },
  },
  {
    canonical: "AIIB",
    aliases: ["ASIAN INFRASTRUCTURE INVESTMENT BANK"],
    i18n: { zh: "亚洲基础设施投资银行", fr: "AIIB", ru: "АИИБ", es: "AIIB", ar: "البنك الآسيوي للاستثمار في البنية التحتية" },
  },
  {
    canonical: "NDB",
    aliases: ["NEW DEVELOPMENT BANK"],
    i18n: { zh: "新开发银行", fr: "NDB", ru: "НБР", es: "NDB", ar: "بنك التنمية الجديد" },
  },
  {
    canonical: "IsDB",
    aliases: ["ISLAMIC DEVELOPMENT BANK"],
    i18n: { zh: "伊斯兰开发银行", fr: "BID", ru: "ИсБР", es: "BID", ar: "البنك الإسلامي للتنمية" },
  },

  // ═══════════════════════════════════════════════════════════════
  // 国际基金
  // ═══════════════════════════════════════════════════════════════
  {
    canonical: "Global Fund",
    aliases: [
      "THE GLOBAL FUND TO FIGHT AIDS, TUBERCULOSIS AND MALARIA",
      "GLOBAL FUND TO FIGHT AIDS, TUBERCULOSIS AND MALARIA",
    ],
    i18n: { zh: "全球基金", fr: "Fonds mondial", ru: "Глобальный фонд", es: "Fondo Mundial", ar: "الصندوق العالمي" },
  },
  {
    canonical: "GEF",
    aliases: ["GLOBAL ENVIRONMENT FACILITY"],
    i18n: { zh: "全球环境基金", fr: "FEM", ru: "ГЭФ", es: "FMAM", ar: "مرفق البيئة العالمية" },
  },
  {
    canonical: "GCF",
    aliases: ["GREEN CLIMATE FUND"],
    i18n: { zh: "绿色气候基金", fr: "FVC", ru: "ЗКФ", es: "FCV", ar: "الصندوق الأخضر للمناخ" },
  },
  {
    canonical: "Gavi",
    aliases: ["GAVI THE VACCINE ALLIANCE", "GAVI ALLIANCE"],
    i18n: { zh: "全球疫苗免疫联盟", fr: "Gavi", ru: "Gavi", es: "Gavi", ar: "تحالف اللقاحات" },
  },

  // ═══════════════════════════════════════════════════════════════
  // 其他重要国际组织
  // ═══════════════════════════════════════════════════════════════
  {
    canonical: "IFAD",
    aliases: ["INTERNATIONAL FUND FOR AGRICULTURAL DEVELOPMENT"],
    i18n: { zh: "国际农业发展基金", fr: "FIDA", ru: "МФСР", es: "FIDA", ar: "الصندوق الدولي للتنمية الزراعية" },
  },
  {
    canonical: "IFC",
    aliases: ["INTERNATIONAL FINANCE CORPORATION"],
    i18n: { zh: "国际金融公司", fr: "SFI", ru: "МФК", es: "CFI", ar: "مؤسسة التمويل الدولية" },
  },
  {
    canonical: "MIGA",
    aliases: ["MULTILATERAL INVESTMENT GUARANTEE AGENCY"],
    i18n: { zh: "多边投资担保机构", fr: "AMGI", ru: "МИГА", es: "OMGI", ar: "الوكالة متعددة الأطراف لضمان الاستثمار" },
  },
  {
    canonical: "WTO",
    aliases: ["WORLD TRADE ORGANIZATION"],
    i18n: { zh: "世界贸易组织", fr: "OMC", ru: "ВТО", es: "OMC", ar: "منظمة التجارة العالمية" },
  },
  {
    canonical: "IMF",
    aliases: ["INTERNATIONAL MONETARY FUND"],
    i18n: { zh: "国际货币基金组织", fr: "FMI", ru: "МВФ", es: "FMI", ar: "صندوق النقد الدولي" },
  },
  {
    canonical: "OECD",
    aliases: [
      "ORGANISATION FOR ECONOMIC CO-OPERATION AND DEVELOPMENT",
      "ORGANIZATION FOR ECONOMIC COOPERATION AND DEVELOPMENT",
    ],
    i18n: { zh: "经合组织", fr: "OCDE", ru: "ОЭСР", es: "OCDE", ar: "منظمة التعاون الاقتصادي والتنمية" },
  },
  {
    canonical: "NATO",
    aliases: ["NORTH ATLANTIC TREATY ORGANIZATION"],
    i18n: { zh: "北约", fr: "OTAN", ru: "НАТО", es: "OTAN", ar: "منظمة حلف شمال الأطلسي" },
  },
  {
    canonical: "ICRC",
    aliases: ["INTERNATIONAL COMMITTEE OF THE RED CROSS"],
    i18n: { zh: "红十字国际委员会", fr: "CICR", ru: "МККК", es: "CICR", ar: "اللجنة الدولية للصليب الأحمر" },
  },
  {
    canonical: "ITU",
    aliases: ["INTERNATIONAL TELECOMMUNICATION UNION"],
    i18n: { zh: "国际电信联盟", fr: "UIT", ru: "МСЭ", es: "UIT", ar: "الاتحاد الدولي للاتصالات" },
  },
  {
    canonical: "ICAO",
    aliases: ["INTERNATIONAL CIVIL AVIATION ORGANIZATION"],
    i18n: { zh: "国际民航组织", fr: "OACI", ru: "ИКАО", es: "OACI", ar: "منظمة الطيران المدني الدولي" },
  },
  {
    canonical: "IMO",
    aliases: ["INTERNATIONAL MARITIME ORGANIZATION"],
    i18n: { zh: "国际海事组织", fr: "OMI", ru: "ИМО", es: "OMI", ar: "المنظمة البحرية الدولية" },
  },
  {
    canonical: "WMO",
    aliases: ["WORLD METEOROLOGICAL ORGANIZATION"],
    i18n: { zh: "世界气象组织", fr: "OMM", ru: "ВМО", es: "OMM", ar: "المنظمة العالمية للأرصاد الجوية" },
  },
  {
    canonical: "CDB",
    aliases: ["CARIBBEAN DEVELOPMENT BANK"],
    i18n: { zh: "加勒比开发银行", fr: "BDC", ru: "КБР", es: "BDC", ar: "بنك التنمية الكاريبي" },
  },
  {
    canonical: "MLF",
    aliases: [
      "MULTILATERAL FUND FOR THE IMPLEMENTATION OF THE MONTREAL PROTOCOL",
      "MULTILATERAL FUND",
    ],
    i18n: { zh: "多边基金", fr: "FM", ru: "МФ", es: "FM", ar: "الصندوق المتعدد الأطراف" },
  },

  // ═══════════════════════════════════════════════════════════════
  // 各国国家采购平台 (National Procurement Platforms)
  // ═══════════════════════════════════════════════════════════════
  {
    canonical: "TED",
    aliases: ["TED", "TENDERS ELECTRONIC DAILY", "TENDER ELECTRONIC DAILY"],
    i18n: { zh: "欧盟电子招标日报", fr: "TED", ru: "TED", es: "TED", ar: "TED" },
  },
  {
    canonical: "SAM",
    aliases: ["SAM", "SYSTEM FOR AWARD MANAGEMENT", "SAM.GOV"],
    i18n: { zh: "美国联邦采购系统", fr: "SAM", ru: "SAM", es: "SAM", ar: "SAM" },
  },
  {
    canonical: "CANADABUYS",
    aliases: ["CANADABUYS", "CANADA BUYS", "BUYANDSELL.GC.CA"],
    i18n: { zh: "加拿大政府采购网", fr: "ACHATCANADA", ru: "CanadaBuys", es: "CanadaBuys", ar: "CanadaBuys" },
  },
  {
    canonical: "philgeps",
    aliases: ["PHILGEPS", "PHILIPPINE GOVERNMENT ELECTRONIC PROCUREMENT SYSTEM", "PHILIPPINE GEPS"],
    i18n: { zh: "菲律宾政府采购系统", fr: "PhilGEPS", ru: "PhilGEPS", es: "PhilGEPS", ar: "PhilGEPS" },
  },
  {
    canonical: "FindATender",
    aliases: ["FINDATENDER", "FIND A TENDER", "FAT", "UK FIND A TENDER SERVICE"],
    i18n: { zh: "英国招标信息服务", fr: "FindATender", ru: "FindATender", es: "FindATender", ar: "FindATender" },
  },
  {
    canonical: "eprocure_gov_in",
    aliases: ["EPROCURE_GOV_IN", "EPROCURE GOV IN", "INDIA E-PROCUREMENT", "CPPP"],
    i18n: { zh: "印度电子采购平台", fr: "eProcure", ru: "eProcure", es: "eProcure", ar: "eProcure" },
  },
  {
    canonical: "TENDERED",
    aliases: ["TENDERED", "TENDERNED", "TENDER NED"],
    i18n: { zh: "荷兰招标平台", fr: "TenderNed", ru: "TenderNed", es: "TenderNed", ar: "TenderNed" },
  },
  {
    canonical: "eTenders",
    aliases: ["ETENDERS", "E-TENDERS", "IRELAND ETENDERS"],
    i18n: { zh: "爱尔兰电子招标平台", fr: "eTenders", ru: "eTenders", es: "eTenders", ar: "eTenders" },
  },
  {
    canonical: "georgia_procurement",
    aliases: ["GEORGIA_PROCUREMENT", "GEORGIA PROCUREMENT"],
    i18n: { zh: "格鲁吉亚采购平台", fr: "GeorgiaProcurement", ru: "Закупки Грузии", es: "GeorgiaProcurement", ar: "GeorgiaProcurement" },
  },
  {
    canonical: "epads_gov_pk",
    aliases: ["EPADS_GOV_PK", "EPADS GOV PK", "PAKISTAN E-PROCUREMENT"],
    i18n: { zh: "巴基斯坦电子采购系统", fr: "ePADS", ru: "ePADS", es: "ePADS", ar: "ePADS" },
  },
  {
    canonical: "BCBid",
    aliases: ["BCBID", "BC BID", "BRITISH COLUMBIA BID"],
    i18n: { zh: "加拿大不列颠哥伦比亚省招标", fr: "BCBid", ru: "BCBid", es: "BCBid", ar: "BCBid" },
  },
  {
    canonical: "contracts_finder",
    aliases: ["CONTRACTS_FINDER", "CONTRACTS FINDER", "UK CONTRACTS FINDER"],
    i18n: { zh: "英国合同查找服务", fr: "Contracts Finder", ru: "Contracts Finder", es: "Contracts Finder", ar: "Contracts Finder" },
  },
  {
    canonical: "tektorg_rosneft",
    aliases: ["TEKTORG_ROSNEFT", "TEKTORG ROSNEFT", "TEKTORG"],
    i18n: { zh: "俄罗斯石油公司采购平台", fr: "Tektorg", ru: "Текторг", es: "Tektorg", ar: "Tektorg" },
  },
  {
    canonical: "eprocurement.gov.tj",
    aliases: ["EPROCUREMENT.GOV.TJ", "TAJIKISTAN E-PROCUREMENT"],
    i18n: { zh: "塔吉克斯坦电子采购", fr: "eProcurement.tj", ru: "eProcurement.tj", es: "eProcurement.tj", ar: "eProcurement.tj" },
  },
  {
    canonical: "UMUCYO",
    aliases: ["UMUCYO"],
    i18n: { zh: "卢旺达电子采购平台", fr: "Umucyo", ru: "Umucyo", es: "Umucyo", ar: "Umucyo" },
  },
  {
    canonical: "adb_global",
    aliases: ["ADB_GLOBAL", "ASIAN DEVELOPMENT BANK GLOBAL", "ADB"],
    i18n: { zh: "亚洲开发银行", fr: "BAD", ru: "АБР", es: "BAsD", ar: "مصرف التنمية الآسيوي" },
  },
  {
    canonical: "GIZ",
    aliases: ["GIZ", "DEUTSCHE GESELLSCHAFT FÜR INTERNATIONALE ZUSAMMENARBEIT"],
    i18n: { zh: "德国国际合作机构", fr: "GIZ", ru: "GIZ", es: "GIZ", ar: "GIZ" },
  },
  {
    canonical: "rosatom",
    aliases: ["ROSATOM", "ROS ATOM", "STATE ATOMIC ENERGY CORPORATION ROSATOM"],
    i18n: { zh: "俄罗斯国家原子能公司", fr: "Rosatom", ru: "Росатом", es: "Rosatom", ar: "Rosatom" },
  },
  {
    canonical: "zakupki_okmot_popp",
    aliases: ["ZAKUPKI_OKMOT_POPP", "ZAKUPKI OKMOT POPP"],
    i18n: { zh: "吉尔吉斯斯坦采购平台", fr: "Zakupki", ru: "Закупки", es: "Zakupki", ar: "Zakupki" },
  },
  {
    canonical: "tendersge",
    aliases: ["TENDERSGE", "TENDERS GE"],
    i18n: { zh: "格鲁吉亚招标平台", fr: "TendersGE", ru: "TendersGE", es: "TendersGE", ar: "TendersGE" },
  },
  {
    canonical: "uzex_etender",
    aliases: ["UZEX_ETENDER", "UZEX ETENDER", "UZBEKISTAN EXCHANGE ETENDER"],
    i18n: { zh: "乌兹别克斯坦电子招标", fr: "UzEx eTender", ru: "UzEx eTender", es: "UzEx eTender", ar: "UzEx eTender" },
  },
  {
    canonical: "GHANEPS",
    aliases: ["GHANEPS", "GHANA E-PROCUREMENT SYSTEM"],
    i18n: { zh: "加纳电子采购系统", fr: "GhanaEPS", ru: "GhanaEPS", es: "GhanaEPS", ar: "GhanaEPS" },
  },
  {
    canonical: "MCC",
    aliases: ["MCC", "MILLENNIUM CHALLENGE CORPORATION"],
    i18n: { zh: "千年挑战公司", fr: "MCC", ru: "MCC", es: "MCC", ar: "MCC" },
  },
  {
    canonical: "UNIDO",
    aliases: ["UNIDO", "UNITED NATIONS INDUSTRIAL DEVELOPMENT ORGANIZATION"],
    i18n: { zh: "联合国工业发展组织", fr: "ONUDI", ru: "ЮНИДО", es: "ONUDI", ar: "اليونيدو" },
  },
];
