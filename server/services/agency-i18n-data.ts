/**
 * 机构名 i18n 静态数据
 * Agency Name i18n Static Data
 *
 * @module server/services/agency-i18n-data
 * @description 精确缩写映射、国家中文名、巴西/肯尼亚/国际前缀模式、类型聚合分类。
 *              与 agencyI18n.ts（逻辑层）分离，便于独立维护和测试。
 */

/** 翻译结果 */
export interface PatternI18nResult {
  canonical: string;
  i18n: { zh: string; fr?: string; ru?: string; es?: string; ar?: string };
}

// ── 精确缩写匹配（优先级最高）──
// 数据库中直接存储缩写的国际机构（UNDP、WHO 等），别名表只有全称
export const KNOWN_ACRONYMS = new Map<string, PatternI18nResult>([
  ["UNDP", { canonical: "UNDP", i18n: { zh: "联合国开发计划署", fr: "PNUD", ru: "ПРООН", es: "PNUD", ar: "برنامج الأمم المتحدة الإنمائي" } }],
  ["WHO", { canonical: "WHO", i18n: { zh: "世界卫生组织", fr: "OMS", ru: "ВОЗ", es: "OMS", ar: "منظمة الصحة العالمية" } }],
  ["ILO", { canonical: "ILO", i18n: { zh: "国际劳工组织", fr: "OIT", ru: "МОТ", es: "OIT", ar: "منظمة العمل الدولية" } }],
  ["IFAD", { canonical: "IFAD", i18n: { zh: "国际农业发展基金", fr: "FIDA", ru: "МФСР", es: "FIDA", ar: "الصندوق الدولي للتنمية الزراعية" } }],
  ["UNICEF", { canonical: "UNICEF", i18n: { zh: "联合国儿童基金会", fr: "UNICEF", ru: "ЮНИСЕФ", es: "UNICEF", ar: "منظمة الأمم المتحدة للطفولة" } }],
  ["FAO", { canonical: "FAO", i18n: { zh: "联合国粮食及农业组织", fr: "FAO", ru: "ФАО", es: "FAO", ar: "منظمة الأغذية والزراعة" } }],
  ["UNOPS", { canonical: "UNOPS", i18n: { zh: "联合国项目事务署", fr: "UNOPS", ru: "ЮНОПС", es: "UNOPS", ar: "مكتب الأمم المتحدة لخدمات المشاريع" } }],
  ["UNHCR", { canonical: "UNHCR", i18n: { zh: "联合国难民署", fr: "HCR", ru: "УВКБ", es: "ACNUR", ar: "مفوضية الأمم المتحدة لشؤون اللاجئين" } }],
  ["UNESCO", { canonical: "UNESCO", i18n: { zh: "联合国教科文组织", fr: "UNESCO", ru: "ЮНЕСКО", es: "UNESCO", ar: "منظمة الأمم المتحدة للتربية والعلم والثقافة" } }],
  ["UNRWA", { canonical: "UNRWA", i18n: { zh: "联合国近东救济工程处", fr: "UNRWA", ru: "БАПОР", es: "OOPS", ar: "وكالة الأمم المتحدة لإغاثة وتشغيل اللاجئين" } }],
  ["UNCDF", { canonical: "UNCDF", i18n: { zh: "联合国资本发展基金", fr: "FENU", ru: "ФКНР", es: "FNUDC", ar: "صندوق الأمم المتحدة للمشاريع الإنتاجية" } }],
  ["WFP", { canonical: "WFP", i18n: { zh: "世界粮食计划署", fr: "PAM", ru: "ВПП", es: "PMA", ar: "برنامج الأغذية العالمي" } }],
  ["WMO", { canonical: "WMO", i18n: { zh: "世界气象组织", fr: "OMM", ru: "ВМО", es: "OMM", ar: "المنظمة العالمية للأرصاد الجوية" } }],
  ["UPU", { canonical: "UPU", i18n: { zh: "万国邮政联盟", fr: "UPU", ru: "ВПС", es: "UPU", ar: "الاتحاد البريدي العالمي" } }],
  ["ITC", { canonical: "ITC", i18n: { zh: "国际贸易中心", fr: "CCI", ru: "МТЦ", es: "CCI", ar: "مركز التجارة الدولية" } }],
  ["IDLO", { canonical: "IDLO", i18n: { zh: "国际发展法律组织", fr: "IDLO", ru: "МПУ", es: "IDLO", ar: "المنظمة الدولية لقانون التنمية" } }],
  ["IAEA", { canonical: "IAEA", i18n: { zh: "国际原子能机构", fr: "AIEA", ru: "МАГАТЭ", es: "OIEA", ar: "الوكالة الدولية للطاقة الذرية" } }],
  ["AU", { canonical: "AU", i18n: { zh: "非洲联盟", fr: "UA", ru: "АС", es: "UA", ar: "الاتحاد الأفريقي" } }],
  ["OSCE", { canonical: "OSCE", i18n: { zh: "欧安组织", fr: "OSCE", ru: "ОБСЕ", es: "OSCE", ar: "منظمة الأمن والتعاون في أوروبا" } }],
  ["ICC", { canonical: "ICC", i18n: { zh: "国际刑事法院", fr: "CPI", ru: "МУС", es: "CPI", ar: "المحكمة الجنائية الدولية" } }],
  ["WORLD BANK", { canonical: "World Bank", i18n: { zh: "世界银行", fr: "Banque mondiale", ru: "Всемирный банк", es: "Banco Mundial", ar: "البنك الدولي" } }],
  ["WORLDBANK", { canonical: "World Bank", i18n: { zh: "世界银行", fr: "Banque mondiale", ru: "Всемирный банк", es: "Banco Mundial", ar: "البنك الدولي" } }],
  ["AFDB", { canonical: "AfDB", i18n: { zh: "非洲开发银行", fr: "BAD", ru: "АфР", es: "BAD", ar: "مصرف التنمية الأفريقي" } }],
  ["ISDB", { canonical: "IsDB", i18n: { zh: "伊斯兰开发银行", fr: "BID", ru: "ИБР", es: "BID", ar: "البنك الإسلامي للتنمية" } }],
  ["ISDB_GLOBAL", { canonical: "IsDB", i18n: { zh: "伊斯兰开发银行", fr: "BID", ru: "ИБР", es: "BID", ar: "البنك الإسلامي للتنمية" } }],
  ["ADB", { canonical: "ADB", i18n: { zh: "亚洲开发银行", fr: "BAD", ru: "АзБР", es: "BAD", ar: "مصرف التنمية الآسيوي" } }],
  ["AIIB", { canonical: "AIIB", i18n: { zh: "亚洲基础设施投资银行", fr: "AIIB", ru: "АИИБ", es: "AIIB", ar: "البنك الآسيوي للاستثمار في البنية التحتية" } }],
  ["BMZ", { canonical: "BMZ", i18n: { zh: "德国联邦经济合作与发展部", fr: "BMZ", ru: "БМЦ", es: "BMZ", ar: "وزارة التعاون الاقتصادي والتنمية الألمانية" } }],
  ["GIZ", { canonical: "GIZ", i18n: { zh: "德国国际合作机构", fr: "GIZ", ru: "ГИЦ", es: "GIZ", ar: "وكالة التعاون الدولي الألمانية" } }],
  ["EC", { canonical: "EC", i18n: { zh: "欧盟委员会", fr: "CE", ru: "ЕК", es: "CE", ar: "المفوضية الأوروبية" } }],
  ["ICAO", { canonical: "ICAO", i18n: { zh: "国际民航组织", fr: "OACI", ru: "ИКАО", es: "OACI", ar: "منظمة الطيران المدني الدولي" } }],
  ["BADEA", { canonical: "BADEA", i18n: { zh: "阿拉伯经济发展银行", fr: "BADEA", ru: "БАДЕА", es: "BADEA", ar: "البنك العربي للتنمية الاقتصادية" } }],
  ["GCF", { canonical: "GCF", i18n: { zh: "绿色气候基金", fr: "FVC", ru: "ЗКФ", es: "FCV", ar: "الصندوق الأخضر للمناخ" } }],
  ["GLOBALTENDERS", { canonical: "GLOBALTENDERS", i18n: { zh: "全球招标平台", fr: "GLOBALTENDERS", ru: "GLOBALTENDERS", es: "GLOBALTENDERS", ar: "المناقصات العالمية" } }],
  ["DMO_GOV_TR", { canonical: "DMO (Turkey)", i18n: { zh: "土耳其政府采购局", fr: "DMO (Turquie)", ru: "ДМО (Турция)", es: "DMO (Turquía)", ar: "وكالة المشتريات الحكومية التركية" } }],
  ["NEA_NEPAL", { canonical: "NEA Nepal", i18n: { zh: "尼泊尔电力局", fr: "NEA Népal", ru: "НЭА Непал", es: "NEA Nepal", ar: "هيئة نيبال الكهربائية" } }],
  ["XT_XARID", { canonical: "Xarid (Uzbekistan)", i18n: { zh: "乌兹别克斯坦采购平台", fr: "Xarid (Ouzbékistan)", ru: "Харид (Узбекистан)", es: "Xarid (Uzbekistán)", ar: "منصة مشتريات أوزبكستان" } }],
  ["TURKMENNEBIT", { canonical: "Turkmennebit", i18n: { zh: "土库曼斯坦石油总公司", fr: "Turkmennebit", ru: "Туркменнебит", es: "Turkmennebit", ar: "تركمن نفط" } }],
  ["TURKMENGAZ", { canonical: "Turkmengaz", i18n: { zh: "土库曼斯坦天然气总公司", fr: "Turkmengaz", ru: "Туркменгаз", es: "Turkmengaz", ar: "تركمن غاز" } }],
  ["RHD BANGLADESH", { canonical: "RHD Bangladesh", i18n: { zh: "孟加拉国公路局", fr: "RHD Bangladesh", ru: "ДШД Бангладеш", es: "RHD Bangladesh", ar: "إدارة الطرق في بنغلاديش" } }],
  ["CAIXA ECONOMICA FEDERAL", { canonical: "CAIXA", i18n: { zh: "巴西联邦储蓄银行", fr: "CAIXA", ru: "КАЙША", es: "CAIXA", ar: "الصندوق الاقتصادي الفيدرالي البرازيلي" } }],
  ["SENADO FEDERAL", { canonical: "Senado Federal", i18n: { zh: "巴西联邦参议院", fr: "Sénat fédéral", ru: "Федеральный сенат", es: "Senado Federal", ar: "مجلس الشيوخ الاتحادي" } }],
  ["PODER JUDICIARIO", { canonical: "Poder Judiciário", i18n: { zh: "巴西司法机关", fr: "Pouvoir judiciaire", ru: "Судебная власть", es: "Poder Judicial", ar: "السلطة القضائية" } }],
  ["BELGIAN DEVELOPMENT AGENCY", { canonical: "Belgian Development Agency", i18n: { zh: "比利时发展署", fr: "Agence belge de développement", ru: "Бельгийское агентство развития", es: "Agencia Belga de Desarrollo", ar: "وكالة التنمية البلجيكية" } }],
  ["TENDERS.TJ", { canonical: "Tenders.tj", i18n: { zh: "塔吉克斯坦招标平台", fr: "Tenders.tj", ru: "Tenders.tj", es: "Tenders.tj", ar: "منصة مناقصات طاجيكستان" } }],
  ["C40 CITIES - CLIMATE LEADERSHIP GROUP (USA)", { canonical: "C40 Cities", i18n: { zh: "C40 城市气候领导组", fr: "C40 Villes", ru: "C40 Города", es: "Ciudades C40", ar: "مدن C40" } }],
  ["COE", { canonical: "COE", i18n: { zh: "欧洲委员会", fr: "CoE", ru: "СЕ", es: "CoE", ar: "مجلس أوروبا" } }],
  ["CAMARA DOS DEPUTADOS", { canonical: "Câmara dos Deputados", i18n: { zh: "巴西联邦众议院", fr: "Chambre des députés", ru: "Палата депутатов", es: "Cámara de Diputados", ar: "مجلس النواب" } }],
  // 国际组织缩写补充
  ["WTO", { canonical: "WTO", i18n: { zh: "世界贸易组织", fr: "OMC", ru: "ВТО", es: "OMC", ar: "منظمة التجارة العالمية" } }],
  ["IMO", { canonical: "IMO", i18n: { zh: "国际海事组织", fr: "OMI", ru: "ИМО", es: "OMI", ar: "المنظمة البحرية الدولية" } }],
  ["OPCW", { canonical: "OPCW", i18n: { zh: "禁止化学武器组织", fr: "OIAC", ru: "ОЗХО", es: "OPAQ", ar: "منظمة حظر الأسلحة الكيميائية" } }],
  ["CTBTO", { canonical: "CTBTO", i18n: { zh: "全面禁止核试验条约组织", fr: "CTBTO", ru: "ОДВЯИ", es: "CTBTO", ar: "منظمة الحظر الشامل للتجارب النووية" } }],
  ["INTERPOL", { canonical: "INTERPOL", i18n: { zh: "国际刑警组织", fr: "INTERPOL", ru: "ИНТЕРПОЛ", es: "INTERPOL", ar: "المنظمة الدولية للشرطة الجنائية" } }],
  ["WIPO", { canonical: "WIPO", i18n: { zh: "世界知识产权组织", fr: "OMPI", ru: "ВОИС", es: "OMPI", ar: "المنظمة العالمية للملكية الفكرية" } }],
  ["ITU", { canonical: "ITU", i18n: { zh: "国际电信联盟", fr: "UIT", ru: "МСЭ", es: "UIT", ar: "الاتحاد الدولي للاتصالات" } }],
  ["UNAIDS", { canonical: "UNAIDS", i18n: { zh: "联合国艾滋病规划署", fr: "ONUSIDA", ru: "ЮНЭЙДС", es: "ONUSIDA", ar: "برنامج الأمم المتحدة المشترك للإيدز" } }],
  ["UNV", { canonical: "UNV", i18n: { zh: "联合国志愿者", fr: "VNU", ru: "Добровольцы ООН", es: "VNU", ar: "متطوعو الأمم المتحدة" } }],
  ["WB", { canonical: "World Bank", i18n: { zh: "世界银行", fr: "Banque mondiale", ru: "Всемирный банк", es: "Banco Mundial", ar: "البنك الدولي" } }],
  ["AF", { canonical: "African Fund", i18n: { zh: "非洲基金", fr: "Fonds africain", ru: "Африканский фонд", es: "Fondo Africano", ar: "الصندوق الأفريقي" } }],
  ["BNDES", { canonical: "BNDES", i18n: { zh: "巴西国家开发银行", fr: "BNDES", ru: "БНДЕС", es: "BNDES", ar: "البنك الوطني البرازيلي للتنمية" } }],
  ["ICTP", { canonical: "ICTP", i18n: { zh: "国际理论物理中心", fr: "CITP", ru: "МЦТФ", es: "ICTP", ar: "المركز الدولي للفيزياء النظرية" } }],
  // 平台代码
  ["KFW_GERMANY", { canonical: "KfW Germany", i18n: { zh: "德国复兴信贷银行", fr: "KfW Allemagne", ru: "КфВ Германия", es: "KfW Alemania", ar: "بنك الإعمار الألماني" } }],
  ["UZSUV_UZ", { canonical: "Uzsuv (Uzbekistan)", i18n: { zh: "乌兹别克斯坦物资储备平台", fr: "Uzsuv (Ouzbékistan)", ru: "Узсув", es: "Uzsuv (Uzbekistán)", ar: "أوزسوف أوزبكستان" } }],
  ["MINTRANS_TJ", { canonical: "MinTrans (Tajikistan)", i18n: { zh: "塔吉克斯坦交通运输部", fr: "MinTrans (Tadjikistan)", ru: "Минтранс (Таджикистан)", es: "MinTrans (Tayikistán)", ar: "وزارة النقل الطاجيكية" } }],
  ["KG ZAKUPKI", { canonical: "KG Zakupy (Kyrgyzstan)", i18n: { zh: "吉尔吉斯斯坦采购平台", fr: "KG Zakupy (Kirghizistan)", ru: "КГ Закупки", es: "KG Zakupy (Kirguistán)", ar: "منصة مشتريات قيرغيزستان" } }],
  // 中文机构名
  ["\u5B5F\u52A0\u62C9\u56FD\u9053\u8DEF\u4E0E\u516C\u8DEF\u5C40", { canonical: "Bangladesh Roads and Highways", i18n: { zh: "孟加拉国道路与公路局", fr: "Routes et autoroutes du Bangladesh", ru: "Дороги и шоссе Бангладеш", es: "Carreteras de Bangladesh", ar: "الطرق السريعة في بنغلاديش" } }],
  ["\u5B5F\u52A0\u62C9\u56FD\u516C\u8DEF\u5C40", { canonical: "Bangladesh Roads and Highways", i18n: { zh: "孟加拉国公路局", fr: "Routes du Bangladesh", ru: "Шоссе Бангладеш", es: "Carreteras de Bangladesh", ar: "هيئة طرق بنغلاديش" } }],
  ["\u5B5F\u52A0\u62C9\u56FDRHD", { canonical: "RHD Bangladesh", i18n: { zh: "孟加拉国公路局", fr: "RHD Bangladesh", ru: "ДШД Бангладеш", es: "RHD Bangladesh", ar: "إدارة الطرق في بنغلاديش" } }],
  ["\u975E\u6D32\u8054\u76DF", { canonical: "AU", i18n: { zh: "非洲联盟", fr: "UA", ru: "АС", es: "UA", ar: "الاتحاد الأفريقي" } }],
  ["\u4E9A\u6D32\u5F00\u53D1\u94F6\u884C", { canonical: "ADB", i18n: { zh: "亚洲开发银行", fr: "BAD", ru: "АзБР", es: "BAD", ar: "مصرف التنمية الآسيوي" } }],
  // 剩余机构精确匹配
  ["OTHER", { canonical: "Other", i18n: { zh: "其他", fr: "Autre", ru: "Другое", es: "Otro", ar: "أخرى" } }],
  ["NPO", { canonical: "NPO", i18n: { zh: "非营利组织", fr: "OBNL", ru: "НКО", es: "ONL", ar: "منظمة غير ربحية" } }],
  ["SAUDE - IS", { canonical: "Saúde IS", i18n: { zh: "健康信息系统", fr: "Santé IS", ru: "ЗдравООхранение ИС", es: "Salud IS", ar: "نظام المعلومات الصحية" } }],
  ["METRO DF", { canonical: "Metrô DF", i18n: { zh: "巴西利亚地铁", fr: "Métro DF", ru: "МетроДФ", es: "Metro DF", ar: "مترو العاصمة الاتحادية" } }],
  ["IPASLUZ SAUDE", { canonical: "IPASLUZ Saúde", i18n: { zh: "IPASLUZ 健康", fr: "IPASLUZ Santé", ru: "ИПАСЛУЗ Здоровье", es: "IPASLUZ Salud", ar: "إيباسلوز الصحية" } }],
  ["DME DISTRIBUICAO S.A. - DMED", { canonical: "DME Distribuição", i18n: { zh: "DME 配电公司", fr: "DME Distribution", ru: "ДМЭ Распределение", es: "DME Distribución", ar: "دي إم إي للتوزيع" } }],
  ["STATISTICAL OFFICE OF THE EUROPEAN UNION (EUROSTAT)", { canonical: "Eurostat", i18n: { zh: "欧盟统计局", fr: "Eurostat", ru: "Евростат", es: "Eurostat", ar: "يوروستات" } }],
  ["WORLD HEALTH ORGANIZATION (WHO) CAMBODIA", { canonical: "WHO Cambodia", i18n: { zh: "世界卫生组织(柬埔寨)", fr: "OMS Cambodge", ru: "ВОЗ Камбоджа", es: "OMS Camboya", ar: "منظمة الصحة العالمية (كمبوديا)" } }],
  ["FOOD AND AGRICULTURE ORGANISATION OF THE UNITED NATIONS (CONGO)", { canonical: "FAO Congo", i18n: { zh: "联合国粮农组织(刚果)", fr: "FAO Congo", ru: "ФАО Конго", es: "FAO Congo", ar: "منظمة الأغذية والزراعة (الكونغو)" } }],
  ["FAMILY HEALTH INTERNATIONAL (THAILAND)", { canonical: "FHI Thailand", i18n: { zh: "家庭健康国际(泰国)", fr: "FHI Thaïlande", ru: "ФСИ Таиланд", es: "FHI Tailandia", ar: "الصحة الأسرية الدولية (تايلاند)" } }],
  ["CLINTON HEALTH ACCESS INITIATIVE (CHAI)", { canonical: "CHAI", i18n: { zh: "克林顿健康访问倡议", fr: "CHAI", ru: "Инициатива Клинтона", es: "CHAI", ar: "مبادرة كلينتون للصحة" } }],
  ["DEUTSCHE WELTHUNGERHILFE E.V.", { canonical: "Welthungerhilfe", i18n: { zh: "德国世界饥饿援助", fr: "Welthungerhilfe", ru: "Вельтхунгерхильфе", es: "Welthungerhilfe", ar: "منظمة المساعدة العالمية ضد الجوع" } }],
  ["RWANDA WOMEN'S NETWORK", { canonical: "Rwanda Women's Network", i18n: { zh: "卢旺达妇女网络", fr: "Réseau des femmes du Rwanda", ru: "Сеть женщин Руанды", es: "Red de Mujeres de Ruanda", ar: "شبكة نساء رواندا" } }],
  ["WYSS ACADEMY FOR NATURE - REGIONAL HUB SOUTHEAST ASIA", { canonical: "Wyss Academy", i18n: { zh: "Wyss 自然学院(东南亚)", fr: "Académie Wyss", ru: "Академия Висс", es: "Academia Wyss", ar: "أكاديمية وايس" } }],
  ["NATIONAL SOCIAL SECURITY FUND", { canonical: "NSSF", i18n: { zh: "国家社会保障基金", fr: "CNSS", ru: "Фонд соцстраха", es: "CNSS", ar: "صندوق الضمان الاجتماعي الوطني" } }],
  ["OFFICE OF THE REGISTRAR OF POLITICAL PARTIES", { canonical: "ORPP", i18n: { zh: "政党登记处", fr: "Bureau du registraire des partis politiques", ru: "Регистрация партий", es: "Oficina de Registro de Partidos", ar: "مكتب تسجيل الأحزاب السياسية" } }],
  ["NATIONAL INSTITUTE OF STATISTICS / INSTITUT NATIONAL DE LA STATISTIQUE (NIGER)", { canonical: "INS Niger", i18n: { zh: "尼日尔国家统计研究所", fr: "INS Niger", ru: "ИНС Нигер", es: "INS Níger", ar: "المعهد الوطني للإحصاء (النيجر)" } }],
  ["DG DEFIS - EUROPEAN COMMISSION DIRECTORATE-GENERAL FOR DEFENCE INDUSTRY AND SPACE", { canonical: "DG DEFIS", i18n: { zh: "欧盟国防工业与空间总局", fr: "DG DEFIS", ru: "ГД DEFIS", es: "DG DEFIS", ar: "المديرية العامة للدفاع الصناعي والفضاء" } }],
  ["ANTI - DOPING AGENCY OF KENYA", { canonical: "ADAK", i18n: { zh: "肯尼亚反兴奋剂机构", fr: "ADA Kenya", ru: "Антидопинговое агентство Кении", es: "ADA Kenia", ar: "وكالة مكافحة المنشطات الكينية" } }],
  ["SOCIAL HEALTH AUTHORITY (SHA)", { canonical: "SHA", i18n: { zh: "社会卫生局", fr: "SHA", ru: "Управление здравоохранения", es: "SHA", ar: "هيئة الصحة الاجتماعية" } }],
  ["DEPARTMENT OF LOCAL INFRASTRUCTURE DEVELOPMENT AND AGRICULTURAL ROADS NEPAL", { canonical: "Nepal Roads Dept", i18n: { zh: "尼泊尔地方基础设施与农业道路部", fr: "Département des routes du Népal", ru: "Департамент дорог Непала", es: "Depto. de Carreteras de Nepal", ar: "إدارة الطرق في نيبال" } }],
  ["CONFEDERAÇÃO BRASILEIRA DE CANOAGEM/PR", { canonical: "CBC", i18n: { zh: "巴西皮划艇联合会", fr: "Confédération brésilienne de canoë", ru: "Федерация каноэ Бразилии", es: "Confederación Brasileña de Canotaje", ar: "الاتحاد البرازيلي للكانوي" } }],
  ["COLEGIO PEDRO II", { canonical: "Colégio Pedro II", i18n: { zh: "佩德罗二世学院", fr: "Collège Pedro II", ru: "Колледж Педро II", es: "Colegio Pedro II", ar: "كلية بيدرو الثاني" } }],
  ["CENTRAIS DE ABASTECIMENTO DO DISTRITO FEDERAL S A", { canonical: "CEASA-DF", i18n: { zh: "巴西利亚联邦区供应中心", fr: "CEASA-DF", ru: "Центр снабжения DF", es: "CEASA-DF", ar: "مركز التوريد بالمنطقة الاتحادية" } }],
  ["BRB BANCO DE BRASILIA SA", { canonical: "BRB", i18n: { zh: "巴西利亚银行", fr: "BRB", ru: "БРБ Банк", es: "BRB", ar: "بنك برازيليا" } }],
]);

// ── 国家名称中文映射（用于按国家聚合机构时的 i18n 生成）──
// 覆盖国际公共采购数据库中常见的 80+ 个国家
export const COUNTRY_ZH: Record<string, string> = {
  // ── 非洲 ──
  "Uganda": "乌干达", "Kenya": "肯尼亚", "Nigeria": "尼日利亚", "Ghana": "加纳",
  "Tanzania": "坦桑尼亚", "United Republic of Tanzania": "坦桑尼亚",
  "Ethiopia": "埃塞俄比亚", "Rwanda": "卢旺达", "Mozambique": "莫桑比克",
  "Senegal": "塞内加尔", "Cameroon": "喀麦隆", "Côte d'Ivoire": "科特迪瓦",
  "Ivory Coast": "科特迪瓦",
  "Burkina Faso": "布基纳法索", "Mali": "马里", "Malawi": "马拉维",
  "Zambia": "赞比亚", "Zimbabwe": "津巴布韦", "Madagascar": "马达加斯加",
  "Angola": "安哥拉", "Botswana": "博茨瓦纳", "Namibia": "纳米比亚",
  "South Africa": "南非", "Egypt": "埃及", "Morocco": "摩洛哥",
  "Tunisia": "突尼斯", "Algeria": "阿尔及利亚", "Sudan": "苏丹",
  "Democratic Republic of the Congo": "刚果（金）",
  "Congo, Democratic Republic of the": "刚果（金）",
  "Republic of the Congo": "刚果（布）", "Congo": "刚果（布）",
  "Guinea": "几内亚", "Sierra Leone": "塞拉利昂", "Niger": "尼日尔",
  "Chad": "乍得", "Mauritius": "毛里求斯", "Eswatini": "斯威士兰",
  "Swaziland": "斯威士兰",
  "Lesotho": "莱索托", "Gambia": "冈比亚", "Liberia": "利比里亚",
  "Mauritania": "毛里塔尼亚", "Burundi": "布隆迪", "Djibouti": "吉布提",
  "Somalia": "索马里", "Cabo Verde": "佛得角", "Cape Verde": "佛得角",
  "Togo": "多哥", "Benin": "贝宁", "Gabon": "加蓬",
  "Equatorial Guinea": "赤道几内亚", "Eritrea": "厄立特里亚",
  "South Sudan": "南苏丹", "Seychelles": "塞舌尔",
  "Central African Republic": "中非共和国",
  // ── 亚洲 ──
  "Philippines": "菲律宾", "The Philippines": "菲律宾",
  "Philippine": "菲律宾", "Republic of the Philippines": "菲律宾",
  "PHL": "菲律宾",
  "India": "印度", "IND": "印度", "Nepal": "尼泊尔",
  "Bangladesh": "孟加拉国", "Sri Lanka": "斯里兰卡", "Indonesia": "印度尼西亚",
  "Vietnam": "越南", "Viet Nam": "越南",
  "Cambodia": "柬埔寨", "Myanmar": "缅甸", "Myanmar/Burma": "缅甸",
  "Burma": "缅甸", "Burma/Myanmar": "缅甸",
  "MMR": "缅甸",
  "Pakistan": "巴基斯坦",
  "Mongolia": "蒙古", "Laos": "老挝",
  "Lao People's Democratic Republic": "老挝",
  "Thailand": "泰国", "Malaysia": "马来西亚", "China": "中国",
  "Afghanistan": "阿富汗", "Bhutan": "不丹", "Maldives": "马尔代夫",
  "Timor-Leste": "东帝汶",
  // ── 拉丁美洲 ──
  "Brazil": "巴西", "Colombia": "哥伦比亚", "Peru": "秘鲁",
  "Bolivia": "玻利维亚",
  "Plurinational State of Bolivia": "玻利维亚",
  "Ecuador": "厄瓜多尔", "Paraguay": "巴拉圭", "Honduras": "洪都拉斯",
  "Guatemala": "危地马拉", "Mexico": "墨西哥", "Argentina": "阿根廷",
  "Chile": "智利", "Panama": "巴拿马", "Dominican Republic": "多米尼加",
  "Jamaica": "牙买加", "Guyana": "圭亚那", "Suriname": "苏里南",
  "Belize": "伯利兹", "El Salvador": "萨尔瓦多", "Nicaragua": "尼加拉瓜",
  "Uruguay": "乌拉圭", "Trinidad and Tobago": "特立尼达和多巴哥",
  "Barbados": "巴巴多斯", "Haiti": "海地",
  "Saint Lucia": "圣卢西亚",
  // ── 中东 ──
  "Jordan": "约旦", "Iraq": "伊拉克", "Yemen": "也门",
  "Lebanon": "黎巴嫩", "West Bank and Gaza": "西岸和加沙",
  "Syria": "叙利亚",
  // ── 欧洲 ──
  "Ukraine": "乌克兰", "Moldova": "摩尔多瓦", "Georgia": "格鲁吉亚",
  "Armenia": "亚美尼亚", "Azerbaijan": "阿塞拜疆", "Turkey": "土耳其",
  "Türkiye": "土耳其",
  "Serbia": "塞尔维亚", "Kosovo": "科索沃",
  "North Macedonia": "北马其顿",
  "Albania": "阿尔巴尼亚", "Montenegro": "黑山",
  "Bosnia and Herzegovina": "波黑",
  "Belarus": "白俄罗斯", "Kyrgyzstan": "吉尔吉斯斯坦",
  "Tajikistan": "塔吉克斯坦", "Uzbekistan": "乌兹别克斯坦",
  "Turkmenistan": "土库曼斯坦", "Kazakhstan": "哈萨克斯坦",
  // ── 大洋洲 ──
  "Papua New Guinea": "巴布亚新几内亚", "Fiji": "斐济",
  "Samoa": "萨摩亚", "Vanuatu": "瓦努阿图", "Tonga": "汤加",
  "Solomon Islands": "所罗门群岛",
  // ── 其他 ──
  "Russia": "俄罗斯", "Russian Federation": "俄罗斯",
  "United States": "美国", "United Kingdom": "英国",
  "France": "法国", "Germany": "德国", "Japan": "日本",
  "Australia": "澳大利亚", "Canada": "加拿大",
  "Italy": "意大利", "Spain": "西班牙", "Portugal": "葡萄牙",
  "Netherlands": "荷兰", "Belgium": "比利时", "Switzerland": "瑞士",
  "Austria": "奥地利", "Sweden": "瑞典", "Norway": "挪威",
  "Denmark": "丹麦", "Finland": "芬兰", "Poland": "波兰",
  "Czech Republic": "捷克", "Czechia": "捷克",
  "Hungary": "匈牙利", "Romania": "罗马尼亚", "Greece": "希腊",
  "Israel": "以色列", "Saudi Arabia": "沙特阿拉伯",
  "United Arab Emirates": "阿联酋",
  "Iran": "伊朗",
  // ── 斜杠变体 / 非标准格式 ──
  "Lao PDR": "老挝",
  "The Netherlands": "荷兰",
  "Netherlands, The": "荷兰",
  "Brasil": "巴西",
  "Turkiye": "土耳其",
  // ── ISO 3166-1 alpha-2 代码（数据库可能存储 ISO 代码而非英文全名）──
  "AF": "阿富汗", "AL": "阿尔巴尼亚", "DZ": "阿尔及利亚", "AO": "安哥拉",
  "AR": "阿根廷", "AM": "亚美尼亚", "AU": "澳大利亚", "AT": "奥地利",
  "AZ": "阿塞拜疆", "BD": "孟加拉国", "BY": "白俄罗斯", "BE": "比利时",
  "BJ": "贝宁", "BO": "玻利维亚", "BA": "波黑", "BW": "博茨瓦纳",
  "BR": "巴西", "BF": "布基纳法索", "BI": "布隆迪", "KH": "柬埔寨",
  "CM": "喀麦隆", "CA": "加拿大", "CF": "中非共和国", "TD": "乍得",
  "CL": "智利", "CN": "中国", "CO": "哥伦比亚", "CR": "哥斯达黎加",
  "HR": "克罗地亚", "CU": "古巴", "CY": "塞浦路斯", "CZ": "捷克",
  "DK": "丹麦", "DJ": "吉布提", "DO": "多米尼加", "EC": "厄瓜多尔",
  "EG": "埃及", "SV": "萨尔瓦多", "GQ": "赤道几内亚", "ER": "厄立特里亚",
  "EE": "爱沙尼亚", "ET": "埃塞俄比亚", "FJ": "斐济", "FI": "芬兰",
  "FR": "法国", "GA": "加蓬", "GM": "冈比亚", "GE": "格鲁吉亚",
  "DE": "德国", "GH": "加纳", "GR": "希腊", "GT": "危地马拉",
  "GN": "几内亚", "GY": "圭亚那", "HT": "海地", "HN": "洪都拉斯",
  "HU": "匈牙利", "IN": "印度", "ID": "印度尼西亚", "IR": "伊朗",
  "IQ": "伊拉克", "IL": "以色列", "IT": "意大利", "JM": "牙买加",
  "JP": "日本", "JO": "约旦", "KZ": "哈萨克斯坦", "KE": "肯尼亚",
  "KW": "科威特", "KG": "吉尔吉斯斯坦", "LA": "老挝", "LV": "拉脱维亚",
  "LB": "黎巴嫩", "LS": "莱索托", "LR": "利比里亚", "LY": "利比亚",
  "LT": "立陶宛", "MK": "北马其顿", "MG": "马达加斯加", "MW": "马拉维",
  "MY": "马来西亚", "ML": "马里", "MR": "毛里塔尼亚", "MU": "毛里求斯",
  "MX": "墨西哥", "MD": "摩尔多瓦", "MN": "蒙古", "ME": "黑山",
  "MA": "摩洛哥", "MZ": "莫桑比克", "MM": "缅甸", "NA": "纳米比亚",
  "NP": "尼泊尔", "NL": "荷兰", "NZ": "新西兰", "NI": "尼加拉瓜",
  "NE": "尼日尔", "NG": "尼日利亚", "NO": "挪威", "OM": "阿曼",
  "PK": "巴基斯坦", "PA": "巴拿马", "PY": "巴拉圭", "PE": "秘鲁",
  "PH": "菲律宾", "PL": "波兰", "PT": "葡萄牙", "QA": "卡塔尔",
  "RO": "罗马尼亚", "RU": "俄罗斯", "RW": "卢旺达", "SA": "沙特阿拉伯",
  "SN": "塞内加尔", "RS": "塞尔维亚", "SL": "塞拉利昂", "SG": "新加坡",
  "SK": "斯洛伐克", "SI": "斯洛文尼亚", "SO": "索马里", "ZA": "南非",
  "ES": "西班牙", "LK": "斯里兰卡", "SD": "苏丹", "SR": "苏里南",
  "SZ": "斯威士兰", "SE": "瑞典", "CH": "瑞士", "SY": "叙利亚",
  "TW": "台湾", "TJ": "塔吉克斯坦", "TZ": "坦桑尼亚", "TH": "泰国",
  "TG": "多哥", "TT": "特立尼达和多巴哥", "TN": "突尼斯", "TR": "土耳其",
  "UG": "乌干达", "UA": "乌克兰", "AE": "阿联酋", "GB": "英国",
  "US": "美国", "UY": "乌拉圭", "UZ": "乌兹别克斯坦", "VE": "委内瑞拉",
  "VN": "越南", "YE": "也门", "ZM": "赞比亚", "ZW": "津巴布韦",
};

// ── 巴西葡萄牙语机构类型前缀映射 ──
export const BR_PREFIX_MAP: Array<[RegExp, (rest: string) => PatternI18nResult]> = [
  // 市级政府
  [/^MUNICIPIO (?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `MUNICIPIO DE ${rest}`,
    i18n: { zh: `${rest}市`, fr: `Municipalité de ${rest}`, ru: `Муниципалитет ${rest}`, es: `Municipio de ${rest}`, ar: `بلدية ${rest}` },
  })],
  // 州/市级厅局
  [/^SECRETARIA (?:DE|DA|DO|DE ESTADO DA|DE ESTADO DO)\s+(.+)/i, (rest) => ({
    canonical: `SECRETARIA DE ${rest}`,
    i18n: { zh: `${rest}厅`, fr: `Secrétariat de ${rest}`, ru: `Секретариат ${rest}`, es: `Secretaría de ${rest}`, ar: `أمانة ${rest}` },
  })],
  // 市级基金
  [/^FUNDO MUNICIPAL DE\s+(.+)/i, (rest) => ({
    canonical: `FUNDO MUNICIPAL DE ${rest}`,
    i18n: { zh: `${rest}市基金`, fr: `Fonds municipal de ${rest}`, ru: `Муниципальный фонд ${rest}`, es: `Fondo municipal de ${rest}`, ar: `صندوق بلدية ${rest}` },
  })],
  // 州级基金
  [/^FUNDO ESTADUAL DE\s+(.+)/i, (rest) => ({
    canonical: `FUNDO ESTADUAL DE ${rest}`,
    i18n: { zh: `${rest}州基金`, fr: `Fonds étatique de ${rest}`, ru: `Региональный фонд ${rest}`, es: `Fondo estatal de ${rest}`, ar: `صندوق ولاية ${rest}` },
  })],
  // 州政府
  [/^ESTADO (?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `ESTADO DE ${rest}`,
    i18n: { zh: `${rest}州`, fr: `État de ${rest}`, ru: `Штат ${rest}`, es: `Estado de ${rest}`, ar: `ولاية ${rest}` },
  })],
  // 军事司令部
  [/^COMANDO (?:DO|DA|DE)\s+(.+)/i, (rest) => ({
    canonical: `COMANDO DO ${rest}`,
    i18n: { zh: `${rest}司令部`, fr: `Commandement de ${rest}`, ru: `Командование ${rest}`, es: `Comando de ${rest}`, ar: `قيادة ${rest}` },
  })],
  // 医院
  [/^HOSPITAL (?:DAS|DO|DE|DA)\s+(.+)/i, (rest) => ({
    canonical: `HOSPITAL DO ${rest}`,
    i18n: { zh: `${rest}医院`, fr: `Hôpital de ${rest}`, ru: `Больница ${rest}`, es: `Hospital de ${rest}`, ar: `مستشفى ${rest}` },
  })],
  // 法院/法庭
  [/^TRIBUNAL\s+(.+)/i, (rest) => ({
    canonical: `TRIBUNAL ${rest}`,
    i18n: { zh: `${rest}法院`, fr: `Tribunal de ${rest}`, ru: `Суд ${rest}`, es: `Tribunal de ${rest}`, ar: `محكمة ${rest}` },
  })],
  // 大学
  [/^UNIVERSIDADE\s+(.+)/i, (rest) => ({
    canonical: `UNIVERSIDADE ${rest}`,
    i18n: { zh: `${rest}大学`, fr: `Université de ${rest}`, ru: `Университет ${rest}`, es: `Universidad de ${rest}`, ar: `جامعة ${rest}` },
  })],
  // 委员会/理事会
  [/^CONSELHO\s+(.+)/i, (rest) => ({
    canonical: `CONSELHO ${rest}`,
    i18n: { zh: `${rest}委员会`, fr: `Conseil de ${rest}`, ru: `Совет ${rest}`, es: `Consejo de ${rest}`, ar: `مجلس ${rest}` },
  })],
  // 部门
  [/^DEPARTAMENTO\s+(.+)/i, (rest) => ({
    canonical: `DEPARTAMENTO ${rest}`,
    i18n: { zh: `${rest}部门`, fr: `Département de ${rest}`, ru: `Департамент ${rest}`, es: `Departamento de ${rest}`, ar: `إدارة ${rest}` },
  })],
  // 基金会
  [/^FUNDACAO\s+(?:PARA O |DO |DA |DE |DISTRITO )?(.+)/i, (rest) => ({
    canonical: `FUNDACAO ${rest}`,
    i18n: { zh: `${rest}基金会`, fr: `Fondation ${rest}`, ru: `Фонд ${rest}`, es: `Fundación ${rest}`, ar: `مؤسسة ${rest}` },
  })],
  // 自治服务
  [/^SERVICO AUTONOMO\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `SERVICO AUTONOMO DE ${rest}`,
    i18n: { zh: `${rest}自治服务`, fr: `Service autonome de ${rest}`, ru: `Автономная служба ${rest}`, es: `Servicio autónomo de ${rest}`, ar: `خدمة مستقلة لـ${rest}` },
  })],
  // 司法
  [/^JUSTICA\s+(.+)/i, (rest) => ({
    canonical: `JUSTICA ${rest}`,
    i18n: { zh: `${rest}司法`, fr: `Justice de ${rest}`, ru: `Правосудие ${rest}`, es: `Justicia de ${rest}`, ar: `عدالة ${rest}` },
  })],
  // 警察
  [/^POLICIA\s+(.+)/i, (rest) => ({
    canonical: `POLICIA ${rest}`,
    i18n: { zh: `${rest}警察`, fr: `Police de ${rest}`, ru: `Полиция ${rest}`, es: `Policía de ${rest}`, ar: `شرطة ${rest}` },
  })],
  // 副厅
  [/^SUBSECRETARIA\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `SUBSECRETARIA DE ${rest}`,
    i18n: { zh: `${rest}副厅`, fr: `Sous-secrétariat de ${rest}`, ru: `Субсекретариат ${rest}`, es: `Subsecretaría de ${rest}`, ar: `أمانة فرعية لـ${rest}` },
  })],
  // 区公所
  [/^SUBPREFEITURA\s+(.+)/i, (rest) => ({
    canonical: `SUBPREFEITURA ${rest}`,
    i18n: { zh: `${rest}区公所`, fr: `Sous-préfecture de ${rest}`, ru: `Субпрефектура ${rest}`, es: `Subprefectura de ${rest}`, ar: `نائب بلدية ${rest}` },
  })],
  // 市议会
  [/^CAMARA MUNICIPAL\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `CAMARA MUNICIPAL DE ${rest}`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil municipal de ${rest}`, ru: `Городской совет ${rest}`, es: `Concejo municipal de ${rest}`, ar: `مجلس بلدية ${rest}` },
  })],
  // 联合体
  [/^CONSORCIO\s+(.+)/i, (rest) => ({
    canonical: `CONSORCIO ${rest}`,
    i18n: { zh: `${rest}联合体`, fr: `Consortium de ${rest}`, ru: `Консорциум ${rest}`, es: `Consorcio de ${rest}`, ar: `اتحاد ${rest}` },
  })],
  // 工业/企业
  [/^INDUSTRIA\s+(.+)/i, (rest) => ({
    canonical: `INDUSTRIA ${rest}`,
    i18n: { zh: `${rest}工业`, fr: `Industrie de ${rest}`, ru: `Промышленность ${rest}`, es: `Industria de ${rest}`, ar: `صناعة ${rest}` },
  })],
  // 协会
  [/^ASSOCIACAO\s+(.+)/i, (rest) => ({
    canonical: `ASSOCIACAO ${rest}`,
    i18n: { zh: `${rest}协会`, fr: `Association de ${rest}`, ru: `Ассоциация ${rest}`, es: `Asociación de ${rest}`, ar: `جمعية ${rest}` },
  })],
  // 公司/企业
  [/^EMPRESA\s+(.+)/i, (rest) => ({
    canonical: `EMPRESA ${rest}`,
    i18n: { zh: `${rest}公司`, fr: `Entreprise de ${rest}`, ru: `Предприятие ${rest}`, es: `Empresa de ${rest}`, ar: `شركة ${rest}` },
  })],
  // 研究所/学院
  [/^INSTITUTO\s+(.+)/i, (rest) => ({
    canonical: `INSTITUTO ${rest}`,
    i18n: { zh: `${rest}研究所`, fr: `Institut de ${rest}`, ru: `Институт ${rest}`, es: `Instituto de ${rest}`, ar: `معهد ${rest}` },
  })],
  // 公设辩护人
  [/^DEFENSORIA\s+(.+)/i, (rest) => ({
    canonical: `DEFENSORIA ${rest}`,
    i18n: { zh: `${rest}公设辩护人`, fr: `Défenseur de ${rest}`, ru: `Защитник ${rest}`, es: `Defensoría de ${rest}`, ar: `مدافع ${rest}` },
  })],
  // 造币厂
  [/^CASA DA MOEDA/i, () => ({
    canonical: 'CASA DA MOEDA DO BRASIL',
    i18n: { zh: '巴西造币厂', fr: 'Monnaie du Brésil', ru: 'Монетный двор Бразилии', es: 'Casa de la Moneda de Brasil', ar: 'دار سك العملة البرازيلية' },
  })],
];

// ── 巴西扩展模式（部委、州/市厅局、国有公司等）──
export const BR_EXTRA_PREFIX_MAP: Array<[RegExp, (rest: string) => PatternI18nResult]> = [
  // 部委: MINISTERIO DA SAUDE → 卫生部
  [/^MINISTERIO (?:DA|DE|DO|DOS)\s+(.+)/i, (rest) => ({
    canonical: `MINISTERIO ${rest}`,
    i18n: { zh: `${rest}部`, fr: `Ministère de ${rest}`, ru: `Министерство ${rest}`, es: `Ministerio de ${rest}`, ar: `وزارة ${rest}` },
  })],
  // 市级厅局: SECRETARIA MUNICIPAL DE EDUCACAO
  [/^SECRETARIA MUNICIPAL\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `SECRETARIA MUNICIPAL DE ${rest}`,
    i18n: { zh: `${rest}市教育局`, fr: `Secrétariat municipal de ${rest}`, ru: `Муниципальный секретариат ${rest}`, es: `Secretaría municipal de ${rest}`, ar: `أمانة بلدية ${rest}` },
  })],
  // 州级厅局: SECRETARIA ESTADUAL DE DEFESA CIVIL
  [/^SECRETARIA ESTADUAL\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `SECRETARIA ESTADUAL DE ${rest}`,
    i18n: { zh: `${rest}州教育局`, fr: `Secrétariat d'État de ${rest}`, ru: `Государственный секретариат ${rest}`, es: `Secretaría estatal de ${rest}`, ar: `أمانة ولاية ${rest}` },
  })],
  // 带地名前缀的厅局: SAO PAULO SECRETARIA DA SEGURANCA
  [/^(?:GOVERNO\s+(?:DO|DA)\s+)?[A-Z]+(?:\s+[A-Z]+)*\s+SECRETARIA\s+(?:DE\s+|DA\s+|DO\s+|DOS\s+|DE\s+ESTADO\s+DA\s+|DE\s+ESTADO\s+DO\s+)?(.+)/i, (rest) => ({
    canonical: `SECRETARIA DE ${rest}`,
    i18n: { zh: `${rest}厅`, fr: `Secrétariat de ${rest}`, ru: `Секретариат ${rest}`, es: `Secretaría de ${rest}`, ar: `أمانة ${rest}` },
  })],
  // 国有公司: COMPANHIA AGUAS DE JOINVILLE
  [/^COMPANHIA\s+(?:DE|DA|DO|DOS|MUNICIPAL DE|NACIONAL DE|BRASILEIRA DE)?\s*(.+)/i, (rest) => ({
    canonical: `COMPANHIA ${rest}`,
    i18n: { zh: `${rest}公司`, fr: `Compagnie de ${rest}`, ru: `Компания ${rest}`, es: `Compañía de ${rest}`, ar: `شركة ${rest}` },
  })],
  // 国家机构: AGENCIA NACIONAL DE...
  [/^AGENCIA (?:NACIONAL|MUNICIPAL)\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `AGENCIA DE ${rest}`,
    i18n: { zh: `${rest}局`, fr: `Agence de ${rest}`, ru: `Агентство ${rest}`, es: `Agencia de ${rest}`, ar: `وكالة ${rest}` },
  })],
  // 自治机构: AUTARQUIA MUNICIPAL DE...
  [/^AUTARQUIA\s+(?:MUNICIPAL|ESTADUAL)?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `AUTARQUIA DE ${rest}`,
    i18n: { zh: `${rest}自治机构`, fr: `Autorité de ${rest}`, ru: `Автономия ${rest}`, es: `Autarquía de ${rest}`, ar: `هيئة ${rest}` },
  })],
  // 协调机构: COORDENADORIA DE FOMENTO...
  [/^COORDENADORIA\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `COORDENADORIA DE ${rest}`,
    i18n: { zh: `${rest}协调处`, fr: `Coordination de ${rest}`, ru: `Координация ${rest}`, es: `Coordinación de ${rest}`, ar: `تنسيق ${rest}` },
  })],
  // 服务中心: CENTRO DE SERVICOS...
  [/^CENTRO\s+(?:NACIONAL|MUNICIPAL|ESTADUAL)?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `CENTRO DE ${rest}`,
    i18n: { zh: `${rest}中心`, fr: `Centre de ${rest}`, ru: `Центр ${rest}`, es: `Centro de ${rest}`, ar: `مركز ${rest}` },
  })],
  // 网络/联合体: REDE MUNICIPAL...
  [/^REDE\s+(?:MUNICIPAL|ESTADUAL|NACIONAL)?\s*(.+)/i, (rest) => ({
    canonical: `REDE ${rest}`,
    i18n: { zh: `${rest}网络`, fr: `Réseau ${rest}`, ru: `Сеть ${rest}`, es: `Red ${rest}`, ar: `شبكة ${rest}` },
  })],
  // 监管局: SUPERINTENDENCIA...
  [/^SUPERINTENDENCIA\s+(?:DE|DA|DO|EST\.)?\s*(.+)/i, (rest) => ({
    canonical: `SUPERINTENDENCIA ${rest}`,
    i18n: { zh: `${rest}监管局`, fr: `Surintendance de ${rest}`, ru: `Суперинтенденция ${rest}`, es: `Superintendencia de ${rest}`, ar: `إشراف ${rest}` },
  })],
  // 市级服务: SERVICO MUNICIPAL DE...
  [/^SERVICO MUNICIPAL\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `SERVICO MUNICIPAL DE ${rest}`,
    i18n: { zh: `${rest}市政服务`, fr: `Service municipal de ${rest}`, ru: `Муниципальная служба ${rest}`, es: `Servicio municipal de ${rest}`, ar: `خدمة بلدية ${rest}` },
  })],
  // 公共部门: MINISTERIO PUBLICO...
  [/^MINISTERIO PUBLICO\s+(?:DA|DE)\s+(.+)/i, (rest) => ({
    canonical: `MINISTERIO PUBLICO DE ${rest}`,
    i18n: { zh: `${rest}检察院`, fr: `Ministère public de ${rest}`, ru: `Прокуратура ${rest}`, es: `Ministerio Público de ${rest}`, ar: `نيابة ${rest}` },
  })],
  // DNIT (国家交通部)
  [/^DNIT/i, () => ({
    canonical: 'DNIT',
    i18n: { zh: '巴西国家交通部', fr: 'DNIT', ru: 'ДНИТ', es: 'DNIT', ar: 'الإدارة الوطنية للبنية التحتية للنقل' },
  })],
  // TECPAR (巴拉那技术研究院)
  [/^TECPAR/i, () => ({
    canonical: 'TECPAR',
    i18n: { zh: '巴拉那技术研究院', fr: 'TECPAR', ru: 'ТЕКПАР', es: 'TECPAR', ar: 'معهد بارانا للتكنولوجيا' },
  })],
  // FURNAS (巴西电力公司)
  [/^FURNAS/i, () => ({
    canonical: 'FURNAS',
    i18n: { zh: '巴西富尔纳斯电力', fr: 'FURNAS', ru: 'ФУРНАС', es: 'FURNAS', ar: 'شركة فورناس للطاقة' },
  })],
  // (UO) ESP- 巴西特殊机构: (UO) ESP-CIA.DO METROPOLIT...
  [/^\(UO\)\s+ESP[-.]\s*(.+)/i, (rest) => ({
    canonical: `(UO) ESP ${rest}`,
    i18n: { zh: `${rest}（圣保罗州政府单位）`, fr: `(UO) ESP ${rest}`, ru: `(UO) ESP ${rest}`, es: `(UO) ESP ${rest}`, ar: `(UO) ESP ${rest}` },
  })],
  // HOSPITAL 更宽泛模式: HOSPITAL NOSSA SENHORA, HOSPITAL MUNICIPAL DR...
  [/^HOSPITAL\s+(.+)/i, (rest) => ({
    canonical: `HOSPITAL ${rest}`,
    i18n: { zh: `${rest}医院`, fr: `Hôpital ${rest}`, ru: `Больница ${rest}`, es: `Hospital ${rest}`, ar: `مستشفى ${rest}` },
  })],
  // SECRETARIA 更宽泛模式: SECRETARIA DAS CIDADES
  [/^SECRETARIA\s+(.+)/i, (rest) => ({
    canonical: `SECRETARIA ${rest}`,
    i18n: { zh: `${rest}厅`, fr: `Secrétariat ${rest}`, ru: `Секретариат ${rest}`, es: `Secretaría ${rest}`, ar: `أمانة ${rest}` },
  })],
  // ADVOCACIA-GERAL (总检察长办公室)
  [/^ADVOCACIA[- ]GERAL\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `ADVOCACIA-GERAL ${rest}`,
    i18n: { zh: `${rest}总检察长办公室`, fr: `Advocacie générale ${rest}`, ru: `Генеральная прокуратура ${rest}`, es: `Abogacía General ${rest}`, ar: `نيابة عامة ${rest}` },
  })],
  // ASSEMBLEIA (议会)
  [/^ASSEMBLEIA\s+(?:LEGISLATIVA|NACIONAL)?\s*(?:DE|DA|DO|DO ESTADO)?\s*(.+)/i, (rest) => ({
    canonical: `ASSEMBLEIA ${rest}`,
    i18n: { zh: `${rest}议会`, fr: `Assemblée ${rest}`, ru: `Ассамблея ${rest}`, es: `Asamblea ${rest}`, ar: `جمعية ${rest}` },
  })],
  // DIRETORIA (局/处)
  [/^DIRETORIA\s+(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `DIRETORIA ${rest}`,
    i18n: { zh: `${rest}局`, fr: `Direction ${rest}`, ru: `Дирекция ${rest}`, es: `Dirección ${rest}`, ar: `مديرية ${rest}` },
  })],
  // COMITE/COMITÊ (委员会)
  [/^COMIT[EÊ]\s+(.+)/i, (rest) => ({
    canonical: `COMITE ${rest}`,
    i18n: { zh: `${rest}委员会`, fr: `Comité ${rest}`, ru: `Комитет ${rest}`, es: `Comité ${rest}`, ar: `لجنة ${rest}` },
  })],
  // FUNDO MUNICIPAL 更宽泛
  [/^FUNDO\s+(?:MUNICIPAL|ESTADUAL)?\s*(?:DA|DE|DO)?\s*(.+)/i, (rest) => ({
    canonical: `FUNDO ${rest}`,
    i18n: { zh: `${rest}基金`, fr: `Fonds ${rest}`, ru: `Фонд ${rest}`, es: `Fondo ${rest}`, ar: `صندوق ${rest}` },
  })],
  // SERVICO 更宽泛
  [/^SERVICO\s+(.+)/i, (rest) => ({
    canonical: `SERVICO ${rest}`,
    i18n: { zh: `${rest}服务`, fr: `Service ${rest}`, ru: `Служба ${rest}`, es: `Servicio ${rest}`, ar: `خدمة ${rest}` },
  })],
  // URBANIZADORA (城市化公司)
  [/^URBANIZADORA\s+(.+)/i, (rest) => ({
    canonical: `URBANIZADORA ${rest}`,
    i18n: { zh: `${rest}城市化公司`, fr: `Urbanisateur ${rest}`, ru: `Урбанизация ${rest}`, es: `Urbanizadora ${rest}`, ar: `شركة التعمير ${rest}` },
  })],
  // NAV BRASIL
  [/^NAV BRASIL/i, () => ({
    canonical: 'NAV BRASIL',
    i18n: { zh: '巴西航空导航服务', fr: 'NAV BRASIL', ru: 'НАВ БРАЗИЛ', es: 'NAV BRASIL', ar: 'خدمات الملاحة الجوية البرازيلية' },
  })],
  // SUP. EST. (州监管局缩写)
  [/^SUP\.\s*EST\.\s*(?:DE)?\s*(.+)/i, (rest) => ({
    canonical: `SUP. EST. ${rest}`,
    i18n: { zh: `${rest}州监管局`, fr: `Sup. État ${rest}`, ru: `Суп. штата ${rest}`, es: `Sup. Estatal ${rest}`, ar: `إشراف الولاية ${rest}` },
  })],
  // CISMEV CONSORCIO (already covered by CONSORCIO but let's be specific)
  // SAME/FM (医疗服务)
  [/^SAME\/FM/i, () => ({
    canonical: 'SAME/FM',
    i18n: { zh: '弗朗西斯科·莫拉托医疗服务', fr: 'SAME/FM', ru: 'САМЕ/ФМ', es: 'SAME/FM', ar: 'خدمةSAME/FM الطبية' },
  })],
  // SESC (社会服务)
  [/^SERVICO SOCIAL DO COMERCIO/i, () => ({
    canonical: 'SESC',
    i18n: { zh: '巴西商业社会服务', fr: 'SESC', ru: 'СЕСК', es: 'SESC', ar: 'الخدمة الاجتماعية للتجارة' },
  })],
  // PREFEITURA (市长办公室/市政府)
  [/^(.+)\s+PREFEITURA/i, (rest) => ({
    canonical: `${rest} PREFEITURA`,
    i18n: { zh: `${rest}市政府`, fr: `Mairie de ${rest}`, ru: `Мэрия ${rest}`, es: `Alcaldía de ${rest}`, ar: `بلدية ${rest}` },
  })],
  [/^PREFEITURA\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `PREFEITURA DE ${rest}`,
    i18n: { zh: `${rest}市政府`, fr: `Mairie de ${rest}`, ru: `Мэрия ${rest}`, es: `Alcaldía de ${rest}`, ar: `بلدية ${rest}` },
  })],
  // CAMARA DE VEREADORES (市议会)
  [/^(.+)\s+CAMARA (?:MUNICIPAL|DE VEREADORES)/i, (rest) => ({
    canonical: `${rest} Câmara Municipal`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil municipal de ${rest}`, ru: `Городской совет ${rest}`, es: `Concejo municipal de ${rest}`, ar: `مجلس بلدية ${rest}` },
  })],
  // SUPERIOR TRIBUNAL (高等法院)
  [/^SUPERIOR\s+TRIBUNAL\s+(?:DE|DO|DA)?\s*(.+)/i, (rest) => ({
    canonical: `SUPERIOR TRIBUNAL ${rest}`,
    i18n: { zh: `${rest}高等法院`, fr: `Tribunal supérieur ${rest}`, ru: `Высший суд ${rest}`, es: `Tribunal Superior ${rest}`, ar: `المحكمة العليا ${rest}` },
  })],
  // AGENCIA 更宽泛: AGENCIA DE MODERNIZACAO...
  [/^AGENCIA\s+(.+)/i, (rest) => ({
    canonical: `AGENCIA ${rest}`,
    i18n: { zh: `${rest}局`, fr: `Agence ${rest}`, ru: `Агентство ${rest}`, es: `Agencia ${rest}`, ar: `وكالة ${rest}` },
  })],
  // CIA. (公司缩写): CIA.DE ENTREPOSTOS...
  [/^CIA\.?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `CIA ${rest}`,
    i18n: { zh: `${rest}公司`, fr: `Compagnie ${rest}`, ru: `Компания ${rest}`, es: `Compañía ${rest}`, ar: `شركة ${rest}` },
  })],
  // ENTIDADE (机构实体)
  [/^ENTIDADE\s+(.+)/i, (rest) => ({
    canonical: `ENTIDADE ${rest}`,
    i18n: { zh: `${rest}机构`, fr: `Entité ${rest}`, ru: `Организация ${rest}`, es: `Entidad ${rest}`, ar: `كيان ${rest}` },
  })],
  // FUND / FUNDACAO 更宽泛
  [/^FUND(?:ACAO)?\s*(?:DE|DA|DO|DISTRITO)?\s*(.+)/i, (rest) => ({
    canonical: `FUNDACAO ${rest}`,
    i18n: { zh: `${rest}基金会`, fr: `Fondation ${rest}`, ru: `Фонд ${rest}`, es: `Fundación ${rest}`, ar: `مؤسسة ${rest}` },
  })],
  // NGCDF (肯尼亚选区发展基金)
  [/^NGCDF\s+(.+)/i, (rest) => ({
    canonical: `NGCDF ${rest}`,
    i18n: { zh: `${rest}选区发展基金`, fr: `Fonds de développement ${rest}`, ru: `Фонд развития ${rest}`, es: `Fondo de desarrollo ${rest}`, ar: `صندوق التنمية ${rest}` },
  })],
  // INSTITUICAO (机构)
  [/^INSTITUICAO\s+(.+)/i, (rest) => ({
    canonical: `INSTITUICAO ${rest}`,
    i18n: { zh: `${rest}机构`, fr: `Institution ${rest}`, ru: `Учреждение ${rest}`, es: `Institución ${rest}`, ar: `مؤسسة ${rest}` },
  })],
  // PODER JUDICIARIO 更宽泛 (RIO GRANDE DO SUL PODER JUDICIARIO)
  [/^(.+)\s+PODER JUDICIARIO/i, (rest) => ({
    canonical: `${rest} Poder Judiciário`,
    i18n: { zh: `${rest}司法机关`, fr: `Pouvoir judiciaire de ${rest}`, ru: `Судебная власть ${rest}`, es: `Poder Judicial de ${rest}`, ar: `السلطة القضائية ${rest}` },
  })],
  // MINISTERIO PUBLICO 更宽泛
  [/^MINISTERIO PUBLICO\s+(.+)/i, (rest) => ({
    canonical: `MINISTERIO PUBLICO ${rest}`,
    i18n: { zh: `${rest}检察院`, fr: `Ministère public ${rest}`, ru: `Прокуратура ${rest}`, es: `Ministerio Público ${rest}`, ar: `نيابة ${rest}` },
  })],
  // CONS. / CONSORCIO 更宽泛
  [/^(?:CIS[A-Z]+|CONS\.?|CONDERG)\s*[-.]?\s*(?:CONS\.?|DE DESENV\.?|INTERMU(?:ICIPAL)?)?\s*(?:DE\s+)?(?:SAUDE|PUBLICO|INTERMUNICIPAL)?\s*(.+)/i, (rest) => ({
    canonical: `CONSORCIO ${rest}`,
    i18n: { zh: `${rest}联合体`, fr: `Consortium ${rest}`, ru: `Консорциум ${rest}`, es: `Consorcio ${rest}`, ar: `اتحاد ${rest}` },
  })],
  // 地名前缀 + TRIBUNAL: SAO PAULO TRIBUNAL DE JUSTICA
  [/^(?:[A-Z]+\s+)*TRIBUNAL\s+(?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `TRIBUNAL ${rest}`,
    i18n: { zh: `${rest}法院`, fr: `Tribunal ${rest}`, ru: `Суд ${rest}`, es: `Tribunal ${rest}`, ar: `محكمة ${rest}` },
  })],
  // SUPREMO TRIBUNAL FEDERAL (最高法院)
  [/^SUPREMO\s+TRIBUNAL\s+FEDERAL/i, () => ({
    canonical: 'SUPREMO TRIBUNAL FEDERAL',
    i18n: { zh: '巴西联邦最高法院', fr: 'Supreme Tribunal fédéral', ru: 'Верховный федеральный суд', es: 'Supremo Tribunal Federal', ar: 'المحكمة الاتحادية العليا' },
  })],
  // 地名前缀 + DEPARTAMENTO: PORTO ALEGRE DEPARTAMENTO MUNICIPAL...
  [/^(?:[A-Z]+\s+)*DEPARTAMENTO\s+(?:MUNICIPAL|ESTADUAL|NACIONAL)?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `DEPARTAMENTO ${rest}`,
    i18n: { zh: `${rest}部门`, fr: `Département ${rest}`, ru: `Департамент ${rest}`, es: `Departamento ${rest}`, ar: `إدارة ${rest}` },
  })],
  // 地名前缀 + ASSEMBLEIA: RIO GRANDE DO SUL ASSEMBLEIA LEGISLATIVA
  [/^(?:[A-Z]+\s+)+ASSEMBLEIA\s+(?:LEGISLATIVA|NACIONAL)?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `ASSEMBLEIA ${rest}`,
    i18n: { zh: `${rest}议会`, fr: `Assemblée ${rest}`, ru: `Ассамблея ${rest}`, es: `Asamblea ${rest}`, ar: `جمعية ${rest}` },
  })],
  // CORPO DE BOMBEIROS (消防队)
  [/^CORPO DE BOMBEIROS\s+(?:MILITAR\s+)?(?:DO|DA|DE)\s+(.+)/i, (rest) => ({
    canonical: `CORPO DE BOMBEIROS ${rest}`,
    i18n: { zh: `${rest}消防队`, fr: `Corps de pompiers ${rest}`, ru: `Пожарная часть ${rest}`, es: `Cuerpo de bomberos ${rest}`, ar: `فريق الإطفاء ${rest}` },
  })],
  // PROCURADORIA GERAL (总检察署)
  [/^PROCURADORIA GERAL\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `PROCURADORIA GERAL ${rest}`,
    i18n: { zh: `${rest}总检察署`, fr: `Procureur général ${rest}`, ru: `Генеральная прокуратура ${rest}`, es: `Procuraduría General ${rest}`, ar: `النيابة العامة ${rest}` },
  })],
  // BANCO CENTRAL (中央银行)
  [/^BANCO CENTRAL\s+(?:DO|DE)\s+(.+)/i, (rest) => ({
    canonical: `BANCO CENTRAL ${rest}`,
    i18n: { zh: `${rest}中央银行`, fr: `Banque centrale ${rest}`, ru: `Центральный банк ${rest}`, es: `Banco Central ${rest}`, ar: `البنك المركزي ${rest}` },
  })],
  // PRESIDENCIA DA REPUBLICA (总统府)
  [/^PRESIDENCIA DA REPUBLICA/i, () => ({
    canonical: 'Presidência da República',
    i18n: { zh: '巴西总统府', fr: 'Présidence de la République', ru: 'Президентура Республики', es: 'Presidencia de la República', ar: 'رئاسة الجمهورية' },
  })],
  // FACULDADE (学院)
  [/^FACULDADE\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `FACULDADE ${rest}`,
    i18n: { zh: `${rest}学院`, fr: `Faculté ${rest}`, ru: `Факультет ${rest}`, es: `Facultad ${rest}`, ar: `كلية ${rest}` },
  })],
  // SANTA CASA (慈善医院)
  [/^SANTA CASA\s+(?:DE|DA)\s+(.+)/i, (rest) => ({
    canonical: `SANTA CASA ${rest}`,
    i18n: { zh: `${rest}慈善医院`, fr: `Santa Casa ${rest}`, ru: `Санта Каса ${rest}`, es: `Santa Casa ${rest}`, ar: `سانتا كاسا ${rest}` },
  })],
  // CAMARA DE VEREADORES (市议会) 更宽泛
  [/^CAMARA DE VEREADORES\s+(?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `CÂMARA ${rest}`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil municipal ${rest}`, ru: `Городской совет ${rest}`, es: `Concejo municipal ${rest}`, ar: `مجلس البلدية ${rest}` },
  })],
  // SANEAMENTO ( sanitation)
  [/^SANEAMENTO\s+(?:AMBIENTAL\s+)?(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `SANEAMENTO ${rest}`,
    i18n: { zh: `${rest}环卫`, fr: `Assainissement ${rest}`, ru: `Санитария ${rest}`, es: `Saneamiento ${rest}`, ar: `الصرف الصحي ${rest}` },
  })],
  // GABINETE DO GOVERNADOR (州长办公室)
  [/^GABINETE DO GOVERNADOR/i, () => ({
    canonical: 'Gabinete do Governador',
    i18n: { zh: '州长办公室', fr: "Cabinet du gouverneur", ru: 'Канцелярия губернатора', es: 'Gabinete del Gobernador', ar: 'مكتب الحاكم' },
  })],
  // CONTROLADORIA GERAL (总审计署)
  [/^CONTROLADORIA GERAL\s+(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `CONTROLADORIA GERAL ${rest}`,
    i18n: { zh: `${rest}总审计署`, fr: `Contrôleur général ${rest}`, ru: `Контрольная палата ${rest}`, es: `Contraloría General ${rest}`, ar: `جهاز الرقابة ${rest}` },
  })],
  // 复合机构名 (BMZ, EC, GIZ) - 取第一个机构名翻译
  [/^([A-Z]+),\s*/i, (rest) => ({
    canonical: `${rest}(joint)`,
    i18n: { zh: `${rest}等联合` },
  })],
  // 地名前缀 + PROCURADORIA/DEFENSORIA
  [/^(?:[A-Z]+\s+)+PROCURADORIA GERAL\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `PROCURADORIA GERAL ${rest}`,
    i18n: { zh: `${rest}总检察署`, fr: `Procureur général ${rest}`, ru: `Генпрокуратура ${rest}`, es: `Procuraduría ${rest}`, ar: `النيابة العامة ${rest}` },
  })],
  [/^(?:[A-Z]+\s+)+DEFENSORIA\s+(?:PUBLICA\s+)?(?:DE|DA|DO|DO ESTADO)?\s*(.+)/i, (rest) => ({
    canonical: `DEFENSORIA ${rest}`,
    i18n: { zh: `${rest}公设辩护人`, fr: `Défenseur ${rest}`, ru: `Защитник ${rest}`, es: `Defensoría ${rest}`, ar: `مدافع ${rest}` },
  })],
  // 地名前缀 + MINISTERIO PUBLICO
  [/^(?:[A-Z]+\s+)+MINISTERIO PUBLICO/i, () => ({
    canonical: 'MINISTERIO PUBLICO',
    i18n: { zh: '检察院', fr: 'Ministère public', ru: 'Прокуратура', es: 'Ministerio Público', ar: 'النيابة العامة' },
  })],
  // 地名前缀 + CONSORCIO/FUNDO
  [/^(?:[A-Z]+\s+)+CONSORCIO\s+(?:INTERMU(?:NICIPAL)?)?\s*(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `CONSORCIO ${rest}`,
    i18n: { zh: `${rest}联合体`, fr: `Consortium ${rest}`, ru: `Консорциум ${rest}`, es: `Consorcio ${rest}`, ar: `اتحاد ${rest}` },
  })],
  [/^(?:[A-Z]+\s+)+FUNDO\s+(?:MUNICIPAL\s+)?(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `FUNDO ${rest}`,
    i18n: { zh: `${rest}基金`, fr: `Fonds ${rest}`, ru: `Фонд ${rest}`, es: `Fondo ${rest}`, ar: `صندوق ${rest}` },
  })],
  // 连字符前缀模式: PMSP - COMPANHIA, FMDE-FUNDO, SANEBAVI - SANEAMENTO
  [/^[A-Z]+\s*[-–—]\s*(.+)/i, (rest) => {
    // 递归匹配去掉前缀后的部分
    const inner = translateByPattern(rest);
    if (inner) return inner;
    return { canonical: rest, i18n: { zh: rest } };
  }],
  // BATALHAO (营)
  [/^(\d+)\s+BATALHAO\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `BATALHAO ${rest}`,
    i18n: { zh: `${rest}营`, fr: `Bataillon ${rest}`, ru: `Батальон ${rest}`, es: `Batallón ${rest}`, ar: `كتيبة ${rest}` },
  })],
  // ADMINISTRACAO (管理局)
  [/^ADMINISTRACAO\s+(?:DE|DA|DO)\s+(.+)/i, (rest) => ({
    canonical: `ADMINISTRACAO ${rest}`,
    i18n: { zh: `${rest}管理局`, fr: `Administration ${rest}`, ru: `Управление ${rest}`, es: `Administración ${rest}`, ar: `إدارة ${rest}` },
  })],
  // PREVIDENCIA (养老金)
  [/^(.+)\s+PREVIDENCIA/i, (rest) => ({
    canonical: `${rest} Previdência`,
    i18n: { zh: `${rest}养老金`, fr: `Prévoyance ${rest}`, ru: `Пенсия ${rest}`, es: `Previsión ${rest}`, ar: `تقاعد ${rest}` },
  })],
  // COLEGIO (学院/学校)
  [/^COLEGIO\s+(.+)/i, (rest) => ({
    canonical: `Colégio ${rest}`,
    i18n: { zh: `${rest}学院`, fr: `Collège ${rest}`, ru: `Колледж ${rest}`, es: `Colegio ${rest}`, ar: `كلية ${rest}` },
  })],
  // CASA MILITAR (军事办公室)
  [/^CASA MILITAR\s+(?:DO|DA|DE)\s+(.+)/i, (rest) => ({
    canonical: `CASA MILITAR ${rest}`,
    i18n: { zh: `${rest}军事办公室`, fr: `Maison militaire ${rest}`, ru: `Военная канцелярия ${rest}`, es: `Casa Militar ${rest}`, ar: `المكتب العسكري ${rest}` },
  })],
  // CAIXA BENEFICENTE (慈善基金)
  [/^CAIXA BENEFICENTE\s+(?:DA|DE|DO)\s+(.+)/i, (rest) => ({
    canonical: `CAIXA BENEFICENTE ${rest}`,
    i18n: { zh: `${rest}慈善基金`, fr: `Caisse bienfaisante ${rest}`, ru: `Благотворительный фонд ${rest}`, es: `Caja Beneficente ${rest}`, ar: `صندوق خيري ${rest}` },
  })],
  // MUTUA (互助会)
  [/^MUTUA\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `MUTUA ${rest}`,
    i18n: { zh: `${rest}互助会`, fr: `Mutuelle ${rest}`, ru: `Взаимопомощь ${rest}`, es: `Mutua ${rest}`, ar: `جمعية تعاونية ${rest}` },
  })],
  // ASSOC/ASSOCIACAO 更宽泛
  [/^ASSOC(?:IACAO)?\s+(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `ASSOCIAÇÃO ${rest}`,
    i18n: { zh: `${rest}协会`, fr: `Association ${rest}`, ru: `Ассоциация ${rest}`, es: `Asociación ${rest}`, ar: `جمعية ${rest}` },
  })],
  // BANCO (银行)
  [/^(.+)\s+BANCO\s+(?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `BANCO ${rest}`,
    i18n: { zh: `${rest}银行`, fr: `Banque ${rest}`, ru: `Банк ${rest}`, es: `Banco ${rest}`, ar: `بنك ${rest}` },
  })],
  // PORTOS (港口)
  [/^PORTOS\s+(.+)/i, (rest) => ({
    canonical: `PORTOS ${rest}`,
    i18n: { zh: `${rest}港口`, fr: `Ports ${rest}`, ru: `Порты ${rest}`, es: `Puertos ${rest}`, ar: `موانئ ${rest}` },
  })],
  // LIMPEZA PUBLICA (环卫)
  [/^(.+)\s+LIMPEZA PUBLICA/i, (rest) => ({
    canonical: `${rest} Limpeza Pública`,
    i18n: { zh: `${rest}环卫`, fr: `Nettoyage ${rest}`, ru: `Чистота ${rest}`, es: `Limpieza ${rest}`, ar: `نظافة ${rest}` },
  })],
  // AGUA (水务)
  [/^AGUA\s+DE\s+(.+)/i, (rest) => ({
    canonical: `ÁGUA ${rest}`,
    i18n: { zh: `${rest}水务`, fr: `Eau ${rest}`, ru: `Водоснабжение ${rest}`, es: `Agua ${rest}`, ar: `مياه ${rest}` },
  })],
  // INST/INSTITUTO 缩写
  [/^INST(?:\.|ITUTO)?\s*(?:\.?\s*NAC\.?\s*)?(?:DE\s+)?(.+)/i, (rest) => ({
    canonical: `INSTITUTO ${rest}`,
    i18n: { zh: `${rest}研究所`, fr: `Institut ${rest}`, ru: `Институт ${rest}`, es: `Instituto ${rest}`, ar: `معهد ${rest}` },
  })],
  // CAMARA 独立使用 (PIRACICABA CAMARA)
  [/^(.+)\s+CAMARA$/i, (rest) => ({
    canonical: `${rest} Câmara`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil ${rest}`, ru: `Совет ${rest}`, es: `Concejo ${rest}`, ar: `مجلس ${rest}` },
  })],
  // UNIVERSIDADE 更宽泛 (FESURV - UNIVERSIDADE DE RIO VERDE 通过连字符前缀已处理)
  // BATALHAO 更宽泛
  [/^(\d+)\s+BATALHAO\s+(.+)/i, (rest) => ({
    canonical: `BATALHAO ${rest}`,
    i18n: { zh: `${rest}营`, fr: `Bataillon ${rest}`, ru: `Батальон ${rest}`, es: `Batallón ${rest}`, ar: `كتيبة ${rest}` },
  })],
  // HELVTAS 带连字符: Helvetas - Madagascar
  [/^HELVTAS\s*[-–—]\s*(.+)/i, (rest) => ({
    canonical: `Helvetas ${rest}`,
    i18n: { zh: `瑞士Helvetas(${rest})`, fr: `Helvetas ${rest}`, ru: `Хельветас ${rest}`, es: `Helvetas ${rest}`, ar: `هيلفيتاس ${rest}` },
  })],
];

// ── 肯尼亚政府机构 ──
export const KENYA_PREFIX_MAP: Array<[RegExp, (rest: string) => PatternI18nResult]> = [
  [/^(.+)\s+COUNTY GOVERNMENT/i, (rest) => ({
    canonical: `${rest} COUNTY GOVERNMENT`,
    i18n: { zh: `${rest}县政府`, fr: `Gouvernement du comté de ${rest}`, ru: `Правительство округа ${rest}`, es: `Gobierno del condado de ${rest}`, ar: `حكومة مقاطعة ${rest}` },
  })],
  [/^KENYA\s+(.+)/i, (rest) => ({
    canonical: `KENYA ${rest}`,
    i18n: { zh: `肯尼亚${rest}`, fr: `Kenya ${rest}`, ru: `Кения ${rest}`, es: `Kenia ${rest}`, ar: `كينيا ${rest}` },
  })],
  // 肯尼亚学校: ST. ALBERTS GIRLS HIGH SCHOOL ULANDA
  [/^(.+)\s+(?:GIRLS|BOYS)\s+(?:HIGH\s+)?SCHOOL/i, (rest) => ({
    canonical: `${rest} School`,
    i18n: { zh: `${rest}中学`, fr: `École ${rest}`, ru: `Школа ${rest}`, es: `Escuela ${rest}`, ar: `مدرسة ${rest}` },
  })],
  // 肯尼亚水务: KISUMU WATER AND SANITATION COMPANY
  [/^(.+)\s+WATER AND SANITATION/i, (rest) => ({
    canonical: `${rest} Water & Sanitation`,
    i18n: { zh: `${rest}水务公司`, fr: `Eau et assainissement ${rest}`, ru: `Водоснабжение ${rest}`, es: `Agua y saneamiento ${rest}`, ar: `المياه والصرف الصحي ${rest}` },
  })],
  // COUNTY COMMISSIONER/ASSEMBLY
  [/^COUNTY\s+(COMMISSIONER|ASSEMBLY|SERVICE)\s*(.+)/i, (rest) => ({
    canonical: `COUNTY ${rest}`,
    i18n: { zh: `县政府${rest}`, fr: `Comté ${rest}`, ru: `Округ ${rest}`, es: `Condado ${rest}`, ar: `مقاطعة ${rest}` },
  })],
  // Endebess NG-CDF (肯尼亚国家选区发展基金)
  [/^(.+)\s+NG[- ]CDF/i, (rest) => ({
    canonical: `${rest} NG-CDF`,
    i18n: { zh: `${rest}选区发展基金`, fr: `Fonds de développement de ${rest}`, ru: `Фонд развития ${rest}`, es: `Fondo de desarrollo de ${rest}`, ar: `صندوق التنمية ${rest}` },
  })],
];

// ── 国际机构 ──
export const INTL_PREFIX_MAP: Array<[RegExp, (rest: string) => PatternI18nResult]> = [
  [/^UN[\s-]+(.+)/i, (rest) => ({
    canonical: `UN ${rest}`,
    i18n: { zh: `联合国${rest}`, fr: `ONU ${rest}`, ru: `ООН ${rest}`, es: `ONU ${rest}`, ar: `الأمم المتحدة ${rest}` },
  })],
  [/^MINISTRY OF\s+(.+)/i, (rest) => ({
    canonical: `MINISTRY OF ${rest}`,
    i18n: { zh: `${rest}部`, fr: `Ministère de ${rest}`, ru: `Министерство ${rest}`, es: `Ministerio de ${rest}`, ar: `وزارة ${rest}` },
  })],
  [/^STATE DEPARTMENT (?:OF|FOR)\s+(.+)/i, (rest) => ({
    canonical: `STATE DEPARTMENT OF ${rest}`,
    i18n: { zh: `${rest}州部门`, fr: `Département d'État de ${rest}`, ru: `Госдепартамент ${rest}`, es: `Departamento de Estado de ${rest}`, ar: `وزارة الخارجية لـ${rest}` },
  })],
  [/^EMBASSY OF\s+(.+)/i, (rest) => ({
    canonical: `EMBASSY OF ${rest}`,
    i18n: { zh: `${rest}大使馆`, fr: `Ambassade de ${rest}`, ru: `Посольство ${rest}`, es: `Embajada de ${rest}`, ar: `سفارة ${rest}` },
  })],
  [/^EUROPEAN\s+(.+)/i, (rest) => ({
    canonical: `EUROPEAN ${rest}`,
    i18n: { zh: `欧洲${rest}`, fr: `Européen ${rest}`, ru: `Европейский ${rest}`, es: `Europeo ${rest}`, ar: `الأوروبي ${rest}` },
  })],
  // United Nations 长名: United Nations Development Programme (Pakistan)
  [/^United Nations\s+(.+)/i, (rest) => ({
    canonical: `UN ${rest}`,
    i18n: { zh: `联合国${rest}`, fr: `ONU ${rest}`, ru: `ООН ${rest}`, es: `ONU ${rest}`, ar: `الأمم المتحدة ${rest}` },
  })],
  // UNDP/UNICEF/WHO 带后缀: UNDP - United Nations Development Programme (Nepal)
  [/^(UNDP|UNICEF|WHO|FAO|UNOPS|UNHCR)\s*[-–—]\s*(.+)/i, (rest) => ({
    canonical: rest,
    i18n: { zh: rest },
  })],
  // NATIONAL GOVERNMENT CONSTITUENCY DEVELOPMENT FUND
  [/^NATIONAL GOVERNMENT CONSTITUENCY DEVELOPMENT FUND\s*(.+)/i, (rest) => ({
    canonical: `NGCDF ${rest}`,
    i18n: { zh: `${rest}选区发展基金`, fr: `Fonds de développement ${rest}`, ru: `Фонд развития ${rest}`, es: `Fondo de desarrollo ${rest}`, ar: `صندوق التنمية ${rest}` },
  })],
  // NG-CDF / NG CDF 变体
  [/^NG[- ]CDF\s*(.+)/i, (rest) => ({
    canonical: `NG-CDF ${rest}`,
    i18n: { zh: `${rest}选区发展基金`, fr: `Fonds de développement ${rest}`, ru: `Фонд развития ${rest}`, es: `Fondo de desarrollo ${rest}`, ar: `صندوق التنمية ${rest}` },
  })],
  // 肯尼亚学校补充: ST. THERESA / ST. PAUL'S / CHEBARA BOYS SECONDARY SCHOOL / ORIWO BOYS
  [/^(.+)\s+(?:SECONDARY|SEC)\s+SCHOOL/i, (rest) => ({
    canonical: `${rest} School`,
    i18n: { zh: `${rest}中学`, fr: `École ${rest}`, ru: `Школа ${rest}`, es: `Escuela ${rest}`, ar: `مدرسة ${rest}` },
  })],
  [/^ST\.?\s+(.+)/i, (rest) => ({
    canonical: `St. ${rest}`,
    i18n: { zh: `圣${rest}`, fr: `St. ${rest}`, ru: `Св. ${rest}`, es: `San ${rest}`, ar: `القديس ${rest}` },
  })],
  [/^(.+)\s+BOYS$/i, (rest) => ({
    canonical: `${rest} Boys School`,
    i18n: { zh: `${rest}男子学校`, fr: `École de garçons ${rest}`, ru: `Школа для мальчиков ${rest}`, es: `Escuela de niños ${rest}`, ar: `مدرسة البنين ${rest}` },
  })],
  // UNIVERSITY COLLEGE
  [/^(.+)\s+UNIVERSITY COLLEGE/i, (rest) => ({
    canonical: `${rest} University College`,
    i18n: { zh: `${rest}大学学院`, fr: `Collège universitaire ${rest}`, ru: `Университетский колледж ${rest}`, es: `Colegio universitario ${rest}`, ar: `كلية جامعية ${rest}` },
  })],
  // TRAINING COLLEGE
  [/^(.+)\s+TRAINING COLLEGE/i, (rest) => ({
    canonical: `${rest} Training College`,
    i18n: { zh: `${rest}师范学院`, fr: `Collège de formation ${rest}`, ru: `Педагогический колледж ${rest}`, es: `Colegio de formación ${rest}`, ar: `كلية تدريب ${rest}` },
  })],
  // 肯尼亚/国际 Authority/Commission/Committee/Board/Council/Tribunal/Fund
  [/^(.+)\s+AUTHORITY$/i, (rest) => ({
    canonical: `${rest} Authority`,
    i18n: { zh: `${rest}管理局`, fr: `Autorité ${rest}`, ru: `Управление ${rest}`, es: `Autoridad ${rest}`, ar: `هيئة ${rest}` },
  })],
  [/^(.+)\s+COMMISSION$/i, (rest) => ({
    canonical: `${rest} Commission`,
    i18n: { zh: `${rest}委员会`, fr: `Commission ${rest}`, ru: `Комиссия ${rest}`, es: `Comisión ${rest}`, ar: `مفوضية ${rest}` },
  })],
  [/^(.+)\s+COMMITTEE$/i, (rest) => ({
    canonical: `${rest} Committee`,
    i18n: { zh: `${rest}委员会`, fr: `Comité ${rest}`, ru: `Комитет ${rest}`, es: `Comité ${rest}`, ar: `لجنة ${rest}` },
  })],
  [/^(.+)\s+BOARD$/i, (rest) => ({
    canonical: `${rest} Board`,
    i18n: { zh: `${rest}理事会`, fr: `Conseil ${rest}`, ru: `Совет ${rest}`, es: `Junta ${rest}`, ar: `مجلس ${rest}` },
  })],
  [/^(.+)\s+COUNCIL$/i, (rest) => ({
    canonical: `${rest} Council`,
    i18n: { zh: `${rest}议会`, fr: `Conseil ${rest}`, ru: `Совет ${rest}`, es: `Consejo ${rest}`, ar: `مجلس ${rest}` },
  })],
  [/^(.+)\s+TRIBUNAL$/i, (rest) => ({
    canonical: `${rest} Tribunal`,
    i18n: { zh: `${rest}法庭`, fr: `Tribunal ${rest}`, ru: `Трибунал ${rest}`, es: `Tribunal ${rest}`, ar: `محكمة ${rest}` },
  })],
  [/^(.+)\s+FUND$/i, (rest) => ({
    canonical: `${rest} Fund`,
    i18n: { zh: `${rest}基金`, fr: `Fonds ${rest}`, ru: `Фонд ${rest}`, es: `Fondo ${rest}`, ar: `صندوق ${rest}` },
  })],
  [/^(.+)\s+TRUST$/i, (rest) => ({
    canonical: `${rest} Trust`,
    i18n: { zh: `${rest}信托`, fr: `Fiducie ${rest}`, ru: `Траст ${rest}`, es: `Fideicomiso ${rest}`, ar: `صندوق ائتماني ${rest}` },
  })],
  [/^(.+)\s+UNION$/i, (rest) => ({
    canonical: `${rest} Union`,
    i18n: { zh: `${rest}联盟`, fr: `Union ${rest}`, ru: `Союз ${rest}`, es: `Unión ${rest}`, ar: `اتحاد ${rest}` },
  })],
  [/^(.+)\s+SOCIETY$/i, (rest) => ({
    canonical: `${rest} Society`,
    i18n: { zh: `${rest}学会`, fr: `Société ${rest}`, ru: `Общество ${rest}`, es: `Sociedad ${rest}`, ar: `جمعية ${rest}` },
  })],
  [/^(.+)\s+COOPERATIVE$/i, (rest) => ({
    canonical: `${rest} Cooperative`,
    i18n: { zh: `${rest}合作社`, fr: `Coopérative ${rest}`, ru: `Кооператив ${rest}`, es: `Cooperativa ${rest}`, ar: `تعاونية ${rest}` },
  })],
  [/^(.+)\s+DIVISION$/i, (rest) => ({
    canonical: `${rest} Division`,
    i18n: { zh: `${rest}司`, fr: `Division ${rest}`, ru: `Отдел ${rest}`, es: `División ${rest}`, ar: `شعبة ${rest}` },
  })],
  [/^(.+)\s+OFFICE$/i, (rest) => ({
    canonical: `${rest} Office`,
    i18n: { zh: `${rest}办公室`, fr: `Bureau ${rest}`, ru: `Канцелярия ${rest}`, es: `Oficina ${rest}`, ar: `مكتب ${rest}` },
  })],
  [/^(.+)\s+PROGRAMME$/i, (rest) => ({
    canonical: `${rest} Programme`,
    i18n: { zh: `${rest}项目`, fr: `Programme ${rest}`, ru: `Программа ${rest}`, es: `Programa ${rest}`, ar: `برنامج ${rest}` },
  })],
  [/^(.+)\s+PROGRAM$/i, (rest) => ({
    canonical: `${rest} Program`,
    i18n: { zh: `${rest}项目`, fr: `Programme ${rest}`, ru: `Программа ${rest}`, es: `Programa ${rest}`, ar: `برنامج ${rest}` },
  })],
  [/^(.+)\s+NETWORK$/i, (rest) => ({
    canonical: `${rest} Network`,
    i18n: { zh: `${rest}网络`, fr: `Réseau ${rest}`, ru: `Сеть ${rest}`, es: `Red ${rest}`, ar: `شبكة ${rest}` },
  })],
  [/^(.+)\s+INSTITUTION$/i, (rest) => ({
    canonical: `${rest} Institution`,
    i18n: { zh: `${rest}机构`, fr: `Institution ${rest}`, ru: `Учреждение ${rest}`, es: `Institución ${rest}`, ar: `مؤسسة ${rest}` },
  })],
  // Water & Sewerage Company
  [/^(.+)\s+WATER\s*(?:&|AND)\s*SEWERAGE/i, (rest) => ({
    canonical: `${rest} Water & Sewerage`,
    i18n: { zh: `${rest}水务公司`, fr: `Eau et assainissement ${rest}`, ru: `Водоснабжение ${rest}`, es: `Agua y alcantarillado ${rest}`, ar: `المياه والصرف الصحي ${rest}` },
  })],
  // 美国农业部等: United States Department of Agriculture
  [/^United States Department of\s+(.+)/i, (rest) => ({
    canonical: `US Department of ${rest}`,
    i18n: { zh: `美国${rest}部`, fr: `Département d'État ${rest}`, ru: `Департамент США ${rest}`, es: `Departamento de EE.UU. ${rest}`, ar: `وزارة الولايات المتحدة ${rest}` },
  })],
  // 其他国际机构: Lux-Dev, Helvetas, Deutsche Welthungerhilfe, Clinton Health, FSD Africa, Rwanda Women's Network, Family Health International, Wyss Academy, Other, NPO, SAUDE - IS
  [/^LUX[- ]DEV/i, () => ({
    canonical: 'Lux-Dev', i18n: { zh: '卢森堡发展署', fr: 'Lux-Dev', ru: 'Люксембург-Дев', es: 'Lux-Dev', ar: 'وكالة لوكسمبرغ للتنمية' },
  })],
  [/^HELVTAS/i, () => ({
    canonical: 'Helvetas', i18n: { zh: '瑞士 Helvetas', fr: 'Helvetas', ru: 'Хельветас', es: 'Helvetas', ar: 'هيلفيتاس' },
  })],
  [/^FSD AFRICA/i, () => ({
    canonical: 'FSD Africa', i18n: { zh: '非洲金融可持续发展基金', fr: 'FSD Africa', ru: 'ФОНД Африка', es: 'FSD África', ar: 'مؤسسة FSD أفريقيا' },
  })],
];

/**
 * 按模式匹配生成机构翻译
 * @param agencyName 原始机构名
 * @returns 翻译结果，未匹配返回 null
 */
export function translateByPattern(agencyName: string): PatternI18nResult | null {
  const trimmed = agencyName.trim();
  if (!trimmed) return null;

  // 按优先级尝试：精确缩写 > 巴西 > 肯尼亚 > 国际
  const upper = trimmed.toUpperCase();
  const exactMatch = KNOWN_ACRONYMS.get(upper);
  if (exactMatch) return exactMatch;

  const allMaps = [BR_PREFIX_MAP, BR_EXTRA_PREFIX_MAP, KENYA_PREFIX_MAP, INTL_PREFIX_MAP];
  for (const map of allMaps) {
    for (const [regex, fn] of map) {
      const match = trimmed.match(regex);
      if (match) {
        const rest = match[1]?.trim();
        if (rest) return fn(rest);
      }
    }
  }

  // 通用兆底：对任何未匹配的机构名
  if (trimmed.length > 0) {
    const isEnglish = /[a-zA-Z]/.test(trimmed);
    if (isEnglish) {
      const TYPE_KEYWORDS: Array<[RegExp, string]> = [
        [/\bCOMMITTEE\b/i, "委员会"], [/\bCOMMISSION\b/i, "委员会"],
        [/\bBOARD\b/i, "理事会"], [/\bCOUNCIL\b/i, "议会"],
        [/\bTRIBUNAL\b/i, "法庭"], [/\bMINISTRY\b/i, "部"],
        [/\bDEPARTMENT\b/i, "部门"], [/\bAUTHORITY\b/i, "管理局"],
        [/\bAGENCY\b/i, "机构"], [/\bBUREAU\b/i, "局"],
        [/\bOFFICE\b/i, "办公室"], [/\bDIVISION\b/i, "司"],
        [/\bUNIVERSITY\b/i, "大学"], [/\bCOLLEGE\b/i, "学院"],
        [/\bINSTITUTE\b/i, "研究所"], [/\bINSTITUTION\b/i, "机构"],
        [/\bHOSPITAL\b/i, "医院"], [/\bFOUNDATION\b/i, "基金会"],
        [/\bFUND\b/i, "基金"], [/\bTRUST\b/i, "信托"],
        [/\bASSOCIATION\b/i, "协会"], [/\bFEDERATION\b/i, "联合会"],
        [/\bUNION\b/i, "联盟"], [/\bSOCIETY\b/i, "学会"],
        [/\bCOOPERATIVE\b/i, "合作社"], [/\bCORPORATION\b/i, "公司"],
        [/\bCOMPANY\b/i, "公司"], [/\bBANK\b/i, "银行"],
        [/\bCENTER\b/i, "中心"], [/\bCENTRE\b/i, "中心"],
        [/\bCOURT\b/i, "法院"], [/\bPARLIAMENT\b/i, "议会"],
        [/\bCONGRESS\b/i, "国会"], [/\bEMBASSY\b/i, "大使馆"],
        [/\bCONSULATE\b/i, "领事馆"], [/\bPROGRAMME\b/i, "项目"],
        [/\bPROGRAM\b/i, "项目"], [/\bNETWORK\b/i, "网络"],
      ];
      for (const [regex, typeZh] of TYPE_KEYWORDS) {
        if (regex.test(trimmed)) {
          const namePart = trimmed.replace(regex, "").trim().replace(/\s+/g, " ");
          if (namePart) return { canonical: trimmed, i18n: { zh: `${namePart}${typeZh}` } };
          else return { canonical: trimmed, i18n: { zh: typeZh } };
        }
      }
      return { canonical: trimmed, i18n: { zh: trimmed } };
    } else {
      return { canonical: trimmed, i18n: { zh: trimmed } };
    }
  }

  return null;
}

// ── 机构类型聚合分类 ──
// 返回 null 表示该机构不应聚合（是特定重要机构如 UNDP/WHO）
// 返回 typeKey + i18n 表示应聚合到该类型
export const TYPE_PATTERNS: Array<[RegExp, { typeKey: string; i18n: Record<string, string> }]> = [
  // 巴西市政府 (1922 个 → 聚合为 1 个)
  [/^MUNICIPIO\s+(?:DE|DO|DA)\s+/i, { typeKey: "MUNICIPIO_BR", i18n: { zh: "巴西各市政府", fr: "Municipalités du Brésil", ru: "Муниципалитеты Бразилии", es: "Municipios de Brasil", ar: "بلديات البرازيل" } }],
  // 巴西各市基金 (118 个 → 聚合为 1 个)
  [/^FUNDO\s+(?:MUNICIPAL|ESTADUAL)/i, { typeKey: "FUNDO_BR", i18n: { zh: "巴西各市基金", fr: "Fonds municipaux du Brésil", ru: "Муниципальные фонды Бразилии", es: "Fondos municipales de Brasil", ar: "الصناديق البلدية البرازيلية" } }],
  // 巴西各市厅局 (84 个 → 聚合为 1 个)
  [/^SECRETARIA\s+(?:DE|DA|DO|DE\s+ESTADO|MUNICIPAL|ESTADUAL)/i, { typeKey: "SECRETARIA_BR", i18n: { zh: "巴西各市厅局", fr: "Secrétariats du Brésil", ru: "Секретариаты Бразилии", es: "Secretarías de Brasil", ar: "أمانات البرازيل" } }],
  [/SECRETARIA\s+(?:DE|DA|DO)\s+/i, { typeKey: "SECRETARIA_BR", i18n: { zh: "巴西各市厅局", fr: "Secrétariats du Brésil", ru: "Секретариаты Бразилии", es: "Secretarías de Brasil", ar: "أمانات البرازيل" } }],
  // 巴西各市议会 (77 个 → 聚合为 1 个)
  [/CAMARA\s+(?:DE\s+)?(?:VEREADORES|MUNICIPAL)/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  // BUG 修复：翻译后 canonical 变为 "CAMARA DE XXX" 或 "CÂMARA XXX"，原规则无法匹配
  // 例："CAMARA MUNICIPAL DE PATROCINIO" → 翻译为 "CAMARA DE PATROCINIO" → 原规则不匹配
  // 注意：必须用 (?:CAMARA|CÂMARA) 而非 [CÂA]MARA（Â 是独立 Unicode 字符，字符类无法匹配）
  [/(?:CAMARA|CÂMARA)\s+(?:DE|DA|DO|DOS|DAS)\s+/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  // BUG 修复：翻译后 "CAMARA DE VEREADORES DE XXX" → "CÂMARA XXX"（无介词），需要兜底匹配
  [/(?:CAMARA|CÂMARA)\s+\S/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  [/CAMARA$/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  // 巴西各市基金会 (70 个 → 聚合为 1 个)
  [/^FUNDACAO|^FUND\s/i, { typeKey: "FUNDACAO_BR", i18n: { zh: "巴西各市基金会", fr: "Fondations du Brésil", ru: "Фонды Бразилии", es: "Fundaciones de Brasil", ar: "مؤسسات البرازيل" } }],
  // BUG 修复：翻译后 "FUNDO MUNICIPAL DE XXX" → "FUNDO XXX"，原规则 /^FUNDO\s+(?:MUNICIPAL|ESTADUAL)/ 无法匹配
  [/^FUNDO\s+(?!MUNICIPAL|ESTADUAL)\S/i, { typeKey: "FUNDO_BR", i18n: { zh: "巴西各市基金", fr: "Fonds municipaux du Brésil", ru: "Муниципальные фонды Бразилии", es: "Fondos municipales de Brasil", ar: "الصناديق البلدية البرازيلية" } }],
  // 巴西各市研究所 (55 个 → 聚合为 1 个)
  [/^INSTITUTO\s/i, { typeKey: "INSTITUTO_BR", i18n: { zh: "巴西各市研究所", fr: "Instituts du Brésil", ru: "Институты Бразилии", es: "Institutos de Brasil", ar: "معاهد البرازيل" } }],
  // 巴西各市联合体 (49 个 → 聚合为 1 个)
  [/^CONSORCIO|^CIS[A-Z]/i, { typeKey: "CONSORCIO_BR", i18n: { zh: "巴西各市联合体", fr: "Consortiums du Brésil", ru: "Консорциумы Бразилии", es: "Consorcios de Brasil", ar: "اتحادات البرازيل" } }],
  // 巴西各市法院 (41 个 → 聚合为 1 个)
  [/TRIBUNAL/i, { typeKey: "TRIBUNAL_BR", i18n: { zh: "巴西各市法院", fr: "Tribunaux du Brésil", ru: "Суды Бразилии", es: "Tribunales de Brasil", ar: "محاكم البرازيل" } }],
  // 巴西各市服务 (36 个 → 聚合为 1 个)
  [/^SERVICO\s/i, { typeKey: "SERVICO_BR", i18n: { zh: "巴西各市服务机构", fr: "Services du Brésil", ru: "Службы Бразилии", es: "Servicios de Brasil", ar: "خدمات البرازيل" } }],
  // 巴西各市部门 (25 个 → 聚合为 1 个)
  [/DEPARTAMENTO/i, { typeKey: "DEPARTAMENTO_BR", i18n: { zh: "巴西各市部门", fr: "Départements du Brésil", ru: "Департаменты Бразилии", es: "Departamentos de Brasil", ar: "إدارات البرازيل" } }],
  // 巴西各市公司 (15 个 → 聚合为 1 个)
  [/^COMPANHIA/i, { typeKey: "COMPANHIA_BR", i18n: { zh: "巴西各市国有公司", fr: "Compagnies du Brésil", ru: "Компании Бразилии", es: "Compañías de Brasil", ar: "شركات البرازيل" } }],
  // 巴西各市政府 (6 个 PREFEITURA → 聚合到 MUNICIPIO_BR)
  [/PREFEITURA/i, { typeKey: "MUNICIPIO_BR", i18n: { zh: "巴西各市政府", fr: "Municipalités du Brésil", ru: "Муниципалитеты Бразилии", es: "Municipios de Brasil", ar: "بلديات البرازيل" } }],
  // 巴西各市协会 (14 个 → 聚合为 1 个)
  [/^ASSOC/i, { typeKey: "ASSOC_BR", i18n: { zh: "巴西各市协会", fr: "Associations du Brésil", ru: "Ассоциации Бразилии", es: "Asociaciones de Brasil", ar: "جمعيات البرازيل" } }],
  // 巴西各市企业 (13 个 → 聚合为 1 个)
  [/^EMPRESA/i, { typeKey: "EMPRESA_BR", i18n: { zh: "巴西各市企业", fr: "Entreprises du Brésil", ru: "Предприятия Бразилии", es: "Empresas de Brasil", ar: "شركات البرازيل" } }],
  // 巴西各市部委 (13 个 → 聚合为 1 个)
  [/^MINISTERIO/i, { typeKey: "MINISTERIO_BR", i18n: { zh: "巴西各部委", fr: "Ministères du Brésil", ru: "Министерства Бразилии", es: "Ministerios de Brasil", ar: "وزارات البرازيل" } }],
  // 巴西各市医院 (10 个 → 聚合为 1 个)
  [/^HOSPITAL/i, { typeKey: "HOSPITAL_BR", i18n: { zh: "巴西各市医院", fr: "Hôpitaux du Brésil", ru: "Больницы Бразилии", es: "Hospitales de Brasil", ar: "مستشفيات البرازيل" } }],
  // 巴西各州政府 (8 个 → 聚合为 1 个)
  [/^ESTADO\s+(?:DE|DO|DA)\s+/i, { typeKey: "ESTADO_BR", i18n: { zh: "巴西各州政府", fr: "Gouvernements d'État du Brésil", ru: "Правительства штатов Бразилии", es: "Gobiernos estatales de Brasil", ar: "حكومات الولايات البرازيلية" } }],
  // 巴西各市局 (14 个 → 聚合为 1 个)
  [/^AGENCIA/i, { typeKey: "AGENCIA_BR", i18n: { zh: "巴西各市局", fr: "Agences du Brésil", ru: "Агентства Бразилии", es: "Agencias de Brasil", ar: "وكالات البرازيل" } }],
  // 肯尼亚县政府 (15 个 → 聚合为 1 个)
  [/COUNTY/i, { typeKey: "COUNTY_KE", i18n: { zh: "肯尼亚各县政府", fr: "Gouvernements de comté du Kenya", ru: "Правительства округов Кении", es: "Gobiernos de condado de Kenia", ar: "حكومات مقاطعات كينيا" } }],
  // 肯尼亚选区基金 (9 个 → 聚合为 1 个)
  [/NG[- ]?CDF|NATIONAL\s+GOVERNMENT\s+CONSTITUENCY/i, { typeKey: "NGCDF_KE", i18n: { zh: "肯尼亚选区发展基金", fr: "Fonds de développement des circonscriptions du Kenya", ru: "Фонды развития округов Кении", es: "Fondos de desarrollo de circunscripciones de Kenia", ar: "صناديق التنمية الانتخابية الكينية" } }],
  // 肯尼亚学校 (7 个 → 聚合为 1 个)
  [/SCHOOL|COLLEGE/i, { typeKey: "SCHOOL_KE", i18n: { zh: "肯尼亚各学校", fr: "Écoles du Kenya", ru: "Школы Кении", es: "Escuelas de Kenia", ar: "مدارس كينيا" } }],
  // 联合国系统 (4 个 → 聚合为 1 个)
  [/^UN[\s-]|^UNITED\s+NATIONS/i, { typeKey: "UN_SYSTEM", i18n: { zh: "联合国系统", fr: "Système des Nations Unies", ru: "Система ООН", es: "Sistema de las Naciones Unidas", ar: "منظومة الأمم المتحدة" } }],
  // 各国部委 (9 个 → 聚合为 1 个)
  [/^MINISTRY\s+OF/i, { typeKey: "MINISTRY_INTL", i18n: { zh: "各国政府部委", fr: "Ministères gouvernementaux", ru: "Министерства", es: "Ministerios", ar: "وزارات" } }],
  // 巴西各市消防 (4 个 → 聚合为 1 个)
  [/BOMBEIROS/i, { typeKey: "BOMBEIROS_BR", i18n: { zh: "巴西各市消防", fr: "Pompiers du Brésil", ru: "Пожарные Бразилии", es: "Bomberos de Brasil", ar: "إطفاء البرازيل" } }],
  // 巴西各市环卫 (1 个 → 聚合为 1 个)
  [/SANEAMENTO/i, { typeKey: "SANEAMENTO_BR", i18n: { zh: "巴西各市环卫", fr: "Assainissement du Brésil", ru: "Водоснабжение Бразилии", es: "Saneamiento de Brasil", ar: "الصرف الصحي البرازيلي" } }],

  // 巴西军事机构 (5+ 个 → 聚合为 1 个)
  [/^COMANDO\s/i, { typeKey: "MILITARY_BR", i18n: { zh: "巴西军事机构", fr: "Institutions militaires du Brésil", ru: "Военные учреждения Бразилии", es: "Instituciones militares de Brasil", ar: "المؤسسات العسكرية البرازيلية" } }],
  // 国际开发银行 (5+ 个 → 聚合为 1 个)
  [/^(WorldBank|WORLDBANK|Asian Development Bank|AfDB|adb_global|isdb_global|ISDB|ISDB_GLOBAL|AIIB|BNDES)$/i, { typeKey: "DEV_BANKS", i18n: { zh: "国际开发银行", fr: "Banques de développement", ru: "Банки развития", es: "Bancos de desarrollo", ar: "بنوك التنمية" } }],
  // 巴西大学 (5+ 个 → 聚合为 1 个)
  [/^UNIVERSIDADE/i, { typeKey: "UNIVERSITY_BR", i18n: { zh: "巴西各大学", fr: "Universités du Brésil", ru: "Университеты Бразилии", es: "Universidades de Brasil", ar: "جامعات البرازيل" } }],

];

// ── 国际通用机构类型聚合（补充巴西/肯尼亚之外的全球常见机构类型）──
export const INTL_TYPE_PATTERNS: Array<[RegExp, { typeKey: string; i18n: Record<string, string> }]> = [
  // 市议会/市政委员会（全球通用）
  [/\b(?:City|Municipal|Town)\s+Council\b/i, { typeKey: "CITY_COUNCIL_INTL", i18n: { zh: "各市议会", fr: "Conseils municipaux", ru: "Городские советы", es: "Concejos municipales", ar: "المجالس البلدية" } }],
  [/\b(?:City|Municipal)\s+Government\b/i, { typeKey: "CITY_COUNCIL_INTL", i18n: { zh: "各市政府", fr: "Gouvernements municipaux", ru: "Муниципальные правительства", es: "Gobiernos municipales", ar: "الحكومات البلدية" } }],
  // 省/州级政府
  [/\b(?:Provincial|State)\s+Government\b/i, { typeKey: "PROVINCIAL_GOVT_INTL", i18n: { zh: "各省/州政府", fr: "Gouvernements provinciaux/étatiques", ru: "Провинциальные/штатные правительства", es: "Gobiernos provinciales/estatales", ar: "الحكومات الإقليمية/الولائية" } }],
  // 各类 Council（County/District/Regional/National/Local Council 等）
  [/\b(?:County|District|Regional|National|Local|Provincial|State|Federal|Central|National)\s+Council\b/i, { typeKey: "COUNCIL_INTL", i18n: { zh: "各议会", fr: "Conseils", ru: "Советы", es: "Consejos", ar: "المجالس" } }],
  // 其他 Council（后缀形式，如 "XX Council"）
  [/\bCouncil\b/i, { typeKey: "COUNCIL_INTL", i18n: { zh: "各议会", fr: "Conseils", ru: "Советы", es: "Consejos", ar: "المجالس" } }],
  // 国家部委
  [/\bMinistry\s+of\b/i, { typeKey: "MINISTRY_INTL", i18n: { zh: "各国部委", fr: "Ministères", ru: "Министерства", es: "Ministerios", ar: "الوزارات" } }],
  [/\bDepartment\s+of\b/i, { typeKey: "DEPARTMENT_INTL", i18n: { zh: "各部门", fr: "Départements", ru: "Департаменты", es: "Departamentos", ar: "الإدارات" } }],
  // 管理局/委员会
  [/\bAuthority\b/i, { typeKey: "AUTHORITY_INTL", i18n: { zh: "各管理局", fr: "Autorités", ru: "Управления", es: "Autoridades", ar: "الهيئات" } }],
  // Committee（委员会）- 最常见的政府机构类型之一
  [/\bCommittee\b/i, { typeKey: "COMMITTEE_INTL", i18n: { zh: "各委员会", fr: "Comités", ru: "Комитеты", es: "Comités", ar: "اللجان" } }],
  [/\bCommission\b/i, { typeKey: "COMMISSION_INTL", i18n: { zh: "各委员会", fr: "Commissions", ru: "Комиссии", es: "Comisiones", ar: "اللجان" } }],
  // Board（理事会/委员会）
  [/\bBoard\b/i, { typeKey: "BOARD_INTL", i18n: { zh: "各理事会", fr: "Conseils", ru: "Советы", es: "Juntas", ar: "المجالس" } }],
  // Tribunal（法庭/仲裁庭）
  [/\bTribunal\b/i, { typeKey: "TRIBUNAL_INTL", i18n: { zh: "各法庭", fr: "Tribunaux", ru: "Трибуналы", es: "Tribunales", ar: "المحاكم" } }],
  // 大学/学院
  [/\bUniversity\b/i, { typeKey: "UNIVERSITY_INTL", i18n: { zh: "各大学", fr: "Universités", ru: "Университеты", es: "Universidades", ar: "الجامعات" } }],
  [/\bCollege\b/i, { typeKey: "COLLEGE_INTL", i18n: { zh: "各学院", fr: "Collèges", ru: "Колледжи", es: "Colegios", ar: "الكليات" } }],
  // 医院
  [/\bHospital\b/i, { typeKey: "HOSPITAL_INTL", i18n: { zh: "各医院", fr: "Hôpitaux", ru: "Больницы", es: "Hospitales", ar: "المستشفيات" } }],
  // 基金会
  [/\bFoundation\b/i, { typeKey: "FOUNDATION_INTL", i18n: { zh: "各基金会", fr: "Fondations", ru: "Фонды", es: "Fundaciones", ar: "المؤسسات" } }],
  // 基金
  [/\bFund\b/i, { typeKey: "FUND_INTL", i18n: { zh: "各基金", fr: "Fonds", ru: "Фонды", es: "Fondos", ar: "الصناديق" } }],
  // 协会/联盟
  [/\bAssociation\b/i, { typeKey: "ASSOCIATION_INTL", i18n: { zh: "各协会", fr: "Associations", ru: "Ассоциации", es: "Asociaciones", ar: "الجمعيات" } }],
  [/\bFederation\b/i, { typeKey: "FEDERATION_INTL", i18n: { zh: "各联合会", fr: "Fédérations", ru: "Федерации", es: "Federaciones", ar: "الاتحادات" } }],
  [/\bUnion\b/i, { typeKey: "UNION_INTL", i18n: { zh: "各联盟", fr: "Unions", ru: "Союзы", es: "Uniones", ar: "الاتحادات" } }],
  [/\bSociety\b/i, { typeKey: "SOCIETY_INTL", i18n: { zh: "各学会", fr: "Sociétés", ru: "Общества", es: "Sociedades", ar: "الجمعيات" } }],
  // 合作社
  [/\bCooperative\b|\bCo-op\b/i, { typeKey: "COOPERATIVE_INTL", i18n: { zh: "各合作社", fr: "Coopératives", ru: "Кооперативы", es: "Cooperativas", ar: "التعاونيات" } }],
  // 信托
  [/\bTrust\b/i, { typeKey: "TRUST_INTL", i18n: { zh: "各信托", fr: "Fiducies", ru: "Трасты", es: "Fideicomisos", ar: "الصناديق الاستئمانية" } }],
  // 公司/企业
  [/\b(?:Corporation|Corp)\b/i, { typeKey: "CORPORATION_INTL", i18n: { zh: "各公司", fr: "Sociétés", ru: "Корпорации", es: "Corporaciones", ar: "الشركات" } }],
  [/\b(?:Ltd|Limited)\b/i, { typeKey: "COMPANY_INTL", i18n: { zh: "各有限公司", fr: "Sociétés limitées", ru: "ООО", es: "S.L.", ar: "شركة ذات مسؤولية محدودة" } }],
  // 银行
  [/\bBank\b/i, { typeKey: "BANK_INTL", i18n: { zh: "各银行", fr: "Banques", ru: "Банки", es: "Bancos", ar: "البنوك" } }],
  // 研究所/研究院
  [/\bInstitute\b/i, { typeKey: "INSTITUTE_INTL", i18n: { zh: "各研究所", fr: "Instituts", ru: "Институты", es: "Institutos", ar: "المعاهد" } }],
  [/\bInstitution\b/i, { typeKey: "INSTITUTION_INTL", i18n: { zh: "各机构", fr: "Institutions", ru: "Учреждения", es: "Instituciones", ar: "المؤسسات" } }],
  // 中心
  [/\bCenter\b|\bCentre\b/i, { typeKey: "CENTER_INTL", i18n: { zh: "各中心", fr: "Centres", ru: "Центры", es: "Centros", ar: "المراكز" } }],
  // 局/署
  [/\bBureau\b/i, { typeKey: "BUREAU_INTL", i18n: { zh: "各局", fr: "Bureaux", ru: "Бюро", es: "Oficinas", ar: "المكاتب" } }],
  [/\bAgency\b/i, { typeKey: "AGENCY_INTL", i18n: { zh: "各机构", fr: "Agences", ru: "Агентства", es: "Agencias", ar: "الوكالات" } }],
  // 办公室
  [/\bOffice\b/i, { typeKey: "OFFICE_INTL", i18n: { zh: "各办公室", fr: "Bureaux", ru: "Канцелярии", es: "Oficinas", ar: "المكاتب" } }],
  // 部门/司
  [/\bDivision\b/i, { typeKey: "DIVISION_INTL", i18n: { zh: "各司", fr: "Divisions", ru: "Отделы", es: "Divisiones", ar: "الشعب" } }],
  // 法院/法庭
  [/\bCourt\b/i, { typeKey: "COURT_INTL", i18n: { zh: "各法院", fr: "Tribunaux", ru: "Суды", es: "Tribunales", ar: "المحاكم" } }],
  // 议会/国会
  [/\bParliament\b/i, { typeKey: "PARLIAMENT_INTL", i18n: { zh: "各国议会", fr: "Parlements", ru: "Парламенты", es: "Parlamentos", ar: "البرلمانات" } }],
  [/\bCongress\b/i, { typeKey: "CONGRESS_INTL", i18n: { zh: "各国国会", fr: "Congrès", ru: "Конгрессы", es: "Congresos", ar: "المجالس النيابية" } }],
  // 大使馆/领事馆
  [/\bEmbassy\b/i, { typeKey: "EMBASSY_INTL", i18n: { zh: "各大使馆", fr: "Ambassades", ru: "Посольства", es: "Embajadas", ar: "السفارات" } }],
  [/\bConsulate\b/i, { typeKey: "CONSULATE_INTL", i18n: { zh: "各领事馆", fr: "Consulats", ru: "Консульства", es: "Consulados", ar: "القنصليات" } }],
  // 项目/计划
  [/\b(?:Programme|Program)\b/i, { typeKey: "PROGRAMME_INTL", i18n: { zh: "各项目", fr: "Programmes", ru: "Программы", es: "Programas", ar: "البرامج" } }],
  // 网络
  [/\bNetwork\b/i, { typeKey: "NETWORK_INTL", i18n: { zh: "各网络", fr: "Réseaux", ru: "Сети", es: "Redes", ar: "الشبكات" } }],
  // 非政府组织
  [/\bNGO\b/i, { typeKey: "NGO_INTL", i18n: { zh: "各非政府组织", fr: "ONG", ru: "НПО", es: "ONG", ar: "المنظمات غير الحكومية" } }],
  // 红十字会/红新月会
  [/\bRed\s+Cross\b/i, { typeKey: "RED_CROSS_INTL", i18n: { zh: "各红十字会", fr: "Croix-Rouge", ru: "Красный Крест", es: "Cruz Roja", ar: "الصليب الأحمر" } }],
  [/\bRed\s+Crescent\b/i, { typeKey: "RED_CROSS_INTL", i18n: { zh: "各红新月会", fr: "Croissant-Rouge", ru: "Красный Полумесяц", es: "Media Luna Roja", ar: "الهلال الأحمر" } }],
  // 警察/警务（常见小型政府机构）
  [/\bPolice\b/i, { typeKey: "POLICE_INTL", i18n: { zh: "各警察机构", fr: "Police", ru: "Полиция", es: "Policía", ar: "الشرطة" } }],
  // 监察/监管机构
  [/\bInspectorate\b/i, { typeKey: "INSPECTORATE_INTL", i18n: { zh: "各监察机构", fr: "Inspection", ru: "Инспекция", es: "Inspección", ar: "التفتيش" } }],
  [/\bRegulatory\b/i, { typeKey: "REGULATORY_INTL", i18n: { zh: "各监管机构", fr: "Régulateurs", ru: "Регуляторы", es: "Reguladores", ar: "الهيئات التنظيمية" } }],
  // 选举委员会
  [/\bElectoral\b/i, { typeKey: "ELECTORAL_INTL", i18n: { zh: "各选举机构", fr: "Élections", ru: "Избирательные", es: "Electoral", ar: "الانتخابات" } }],
  // 水务局
  [/\bWater\b/i, { typeKey: "WATER_INTL", i18n: { zh: "各水务机构", fr: "Eau", ru: "Водоснабжение", es: "Agua", ar: "المياه" } }],
  // 电力/能源
  [/\b(?:Electricity|Power|Energy)\b/i, { typeKey: "ENERGY_INTL", i18n: { zh: "各电力能源机构", fr: "Énergie", ru: "Энергетика", es: "Energía", ar: "الطاقة" } }],
  // 道路/公路
  [/\b(?:Roads|Highway|Highways)\b/i, { typeKey: "ROADS_INTL", i18n: { zh: "各道路机构", fr: "Routes", ru: "Дороги", es: "Carreteras", ar: "الطرق" } }],
];

// ── INTL 类型英文标签（用于国家级聚合时的可读 display name）──
export const INTL_TYPE_EN: Record<string, string> = {
  "CITY_COUNCIL_INTL": "City Councils",
  "PROVINCIAL_GOVT_INTL": "Provincial Governments",
  "COUNCIL_INTL": "Councils",
  "MINISTRY_INTL": "Ministries",
  "DEPARTMENT_INTL": "Departments",
  "AUTHORITY_INTL": "Authorities",
  "COMMITTEE_INTL": "Committees",
  "COMMISSION_INTL": "Commissions",
  "BOARD_INTL": "Boards",
  "TRIBUNAL_INTL": "Tribunals",
  "UNIVERSITY_INTL": "Universities",
  "COLLEGE_INTL": "Colleges",
  "HOSPITAL_INTL": "Hospitals",
  "FOUNDATION_INTL": "Foundations",
  "FUND_INTL": "Funds",
  "ASSOCIATION_INTL": "Associations",
  "FEDERATION_INTL": "Federations",
  "UNION_INTL": "Unions",
  "SOCIETY_INTL": "Societies",
  "COOPERATIVE_INTL": "Cooperatives",
  "TRUST_INTL": "Trusts",
  "CORPORATION_INTL": "Corporations",
  "COMPANY_INTL": "Companies",
  "BANK_INTL": "Banks",
  "INSTITUTE_INTL": "Institutes",
  "INSTITUTION_INTL": "Institutions",
  "CENTER_INTL": "Centers",
  "BUREAU_INTL": "Bureaus",
  "AGENCY_INTL": "Agencies",
  "OFFICE_INTL": "Offices",
  "DIVISION_INTL": "Divisions",
  "COURT_INTL": "Courts",
  "PARLIAMENT_INTL": "Parliaments",
  "CONGRESS_INTL": "Congresses",
  "EMBASSY_INTL": "Embassies",
  "CONSULATE_INTL": "Consulates",
  "PROGRAMME_INTL": "Programmes",
  "NETWORK_INTL": "Networks",
  "NGO_INTL": "NGOs",
  "RED_CROSS_INTL": "Red Cross/Red Crescent",
  "POLICE_INTL": "Police",
  "INSPECTORATE_INTL": "Inspectorates",
  "REGULATORY_INTL": "Regulatory Authorities",
  "ELECTORAL_INTL": "Electoral Bodies",
  "WATER_INTL": "Water Authorities",
  "ENERGY_INTL": "Energy Authorities",
  "ROADS_INTL": "Roads Authorities",
};
