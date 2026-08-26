/**
 * 机构类型聚合分类模式
 * Agency Type Aggregation Patterns
 *
 * @module server/data/agency-i18n/type-patterns
 * @description 按机构名模式将其归类到统一类型（如"巴西各市政府"、"肯尼亚各县政府"等）。
 */

// ── 机构类型聚合分类 ──
// 返回 null 表示该机构不应聚合（是特定重要机构如 UNDP/WHO）
// 返回 typeKey + i18n 表示应聚合到该类型
export const TYPE_PATTERNS: Array<[RegExp, { typeKey: string; i18n: Record<string, string> }]> = [
  // 巴西市政府 (1922 个 → 聚合为 1 个)
  [/^MUNICIPIO\s+(?:DE|DO|DA)\s+/i, { typeKey: "MUNICIPIO_BR", i18n: { zh: "巴西各市政府", fr: "Municipalités du Brésil", ru: "Муниципалитеты Бразилии", es: "Municipios de Brasil", ar: "بلديات البرازيل" } }],
  // 巴西各市基金
  [/^FUNDO\s+(?:MUNICIPAL|ESTADUAL)/i, { typeKey: "FUNDO_BR", i18n: { zh: "巴西各市基金", fr: "Fonds municipaux du Brésil", ru: "Муниципальные фонды Бразилии", es: "Fondos municipales de Brasil", ar: "الصناديق البلدية البرازيلية" } }],
  // 巴西各市厅局
  [/^SECRETARIA\s+(?:DE|DA|DO|DE\s+ESTADO|MUNICIPAL|ESTADUAL)/i, { typeKey: "SECRETARIA_BR", i18n: { zh: "巴西各市厅局", fr: "Secrétariats du Brésil", ru: "Секретариаты Бразилии", es: "Secretarías de Brasil", ar: "أمانات البرازيل" } }],
  [/SECRETARIA\s+(?:DE|DA|DO)\s+/i, { typeKey: "SECRETARIA_BR", i18n: { zh: "巴西各市厅局", fr: "Secrétariats du Brésil", ru: "Секретариаты Бразилии", es: "Secretarías de Brasil", ar: "أمانات البرازيل" } }],
  // 巴西各市议会
  [/CAMARA\s+(?:DE\s+)?(?:VEREADORES|MUNICIPAL)/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  // BUG 修复：翻译后 canonical 变为 "CAMARA DE XXX" 或 "CÂMARA XXX"
  [/(?:CAMARA|CÂMARA)\s+(?:DE|DA|DO|DOS|DAS)\s+/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  [/(?:CAMARA|CÂMARA)\s+\S/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  [/CAMARA$/i, { typeKey: "CAMARA_BR", i18n: { zh: "巴西各市议会", fr: "Conseils municipaux du Brésil", ru: "Городские советы Бразилии", es: "Concejos municipales de Brasil", ar: "المجالس البلدية البرازيلية" } }],
  // 巴西各市基金会
  [/^FUNDACAO|^FUND\s/i, { typeKey: "FUNDACAO_BR", i18n: { zh: "巴西各市基金会", fr: "Fondations du Brésil", ru: "Фонды Бразилии", es: "Fundaciones de Brasil", ar: "مؤسسات البرازيل" } }],
  [/^FUNDO\s+(?!MUNICIPAL|ESTADUAL)\S/i, { typeKey: "FUNDO_BR", i18n: { zh: "巴西各市基金", fr: "Fonds municipaux du Brésil", ru: "Муниципальные фонды Бразилии", es: "Fondos municipales de Brasil", ar: "الصناديق البلدية البرازيلية" } }],
  // 巴西各市研究所
  [/^INSTITUTO\s/i, { typeKey: "INSTITUTO_BR", i18n: { zh: "巴西各市研究所", fr: "Instituts du Brésil", ru: "Институты Бразилии", es: "Institutos de Brasil", ar: "معاهد البرازيل" } }],
  // 巴西各市联合体
  [/^CONSORCIO|^CIS[A-Z]/i, { typeKey: "CONSORCIO_BR", i18n: { zh: "巴西各市联合体", fr: "Consortiums du Brésil", ru: "Консорциумы Бразилии", es: "Consorcios de Brasil", ar: "اتحادات البرازيل" } }],
  // 巴西各市法院
  [/TRIBUNAL/i, { typeKey: "TRIBUNAL_BR", i18n: { zh: "巴西各市法院", fr: "Tribunaux du Brésil", ru: "Суды Бразилии", es: "Tribunales de Brasil", ar: "محاكم البرازيل" } }],
  // 巴西各市服务
  [/^SERVICO\s/i, { typeKey: "SERVICO_BR", i18n: { zh: "巴西各市服务机构", fr: "Services du Brésil", ru: "Службы Бразилии", es: "Servicios de Brasil", ar: "خدمات البرازيل" } }],
  // 巴西各市部门
  [/DEPARTAMENTO/i, { typeKey: "DEPARTAMENTO_BR", i18n: { zh: "巴西各市部门", fr: "Départements du Brésil", ru: "Департаменты Бразилии", es: "Departamentos de Brasil", ar: "إدارات البرازيل" } }],
  // 巴西各市公司
  [/^COMPANHIA/i, { typeKey: "COMPANHIA_BR", i18n: { zh: "巴西各市国有公司", fr: "Compagnies du Brésil", ru: "Компании Бразилии", es: "Compañías de Brasil", ar: "شركات البرازيل" } }],
  // 巴西各市政府
  [/PREFEITURA/i, { typeKey: "MUNICIPIO_BR", i18n: { zh: "巴西各市政府", fr: "Municipalités du Brésil", ru: "Муниципалитеты Бразилии", es: "Municipios de Brasil", ar: "بلديات البرازيل" } }],
  // 巴西各市协会
  [/^ASSOC/i, { typeKey: "ASSOC_BR", i18n: { zh: "巴西各市协会", fr: "Associations du Brésil", ru: "Ассоциации Бразилии", es: "Asociaciones de Brasil", ar: "جمعيات البرازيل" } }],
  // 巴西各市企业
  [/^EMPRESA/i, { typeKey: "EMPRESA_BR", i18n: { zh: "巴西各市企业", fr: "Entreprises du Brésil", ru: "Предприятия Бразилии", es: "Empresas de Brasil", ar: "شركات البرازيل" } }],
  // 巴西各市部委
  [/^MINISTERIO/i, { typeKey: "MINISTERIO_BR", i18n: { zh: "巴西各部委", fr: "Ministères du Brésil", ru: "Министерства Бразилии", es: "Ministerios de Brasil", ar: "وزارات البرازيل" } }],
  // 巴西各市医院
  [/^HOSPITAL/i, { typeKey: "HOSPITAL_BR", i18n: { zh: "巴西各市医院", fr: "Hôpitaux du Brésil", ru: "Больницы Бразилии", es: "Hospitales de Brasil", ar: "مستشفيات البرازيل" } }],
  // 巴西各州政府
  [/^ESTADO\s+(?:DE|DO|DA)\s+/i, { typeKey: "ESTADO_BR", i18n: { zh: "巴西各州政府", fr: "Gouvernements d'État du Brésil", ru: "Правительства штатов Бразилии", es: "Gobiernos estatales de Brasil", ar: "حكومات الولايات البرازيلية" } }],
  // 巴西各市局
  [/^AGENCIA/i, { typeKey: "AGENCIA_BR", i18n: { zh: "巴西各市局", fr: "Agences du Brésil", ru: "Агентства Бразилии", es: "Agencias de Brasil", ar: "وكالات البرازيل" } }],
  // 肯尼亚县政府
  [/COUNTY/i, { typeKey: "COUNTY_KE", i18n: { zh: "肯尼亚各县政府", fr: "Gouvernements de comté du Kenya", ru: "Правительства округов Кении", es: "Gobiernos de condado de Kenia", ar: "حكومات مقاطعات كينيا" } }],
  // 肯尼亚选区基金
  [/NG[- ]?CDF|NATIONAL\s+GOVERNMENT\s+CONSTITUENCY/i, { typeKey: "NGCDF_KE", i18n: { zh: "肯尼亚选区发展基金", fr: "Fonds de développement des circonscriptions du Kenya", ru: "Фонды развития округов Кении", es: "Fondos de desarrollo de circunscripciones de Kenia", ar: "صناديق التنمية الانتخابية الكينية" } }],
  // 肯尼亚学校
  [/SCHOOL|COLLEGE/i, { typeKey: "SCHOOL_KE", i18n: { zh: "肯尼亚各学校", fr: "Écoles du Kenya", ru: "Школы Кении", es: "Escuelas de Kenia", ar: "مدارس كينيا" } }],
  // 联合国系统
  [/^UN[\s-]|^UNITED\s+NATIONS/i, { typeKey: "UN_SYSTEM", i18n: { zh: "联合国系统", fr: "Système des Nations Unies", ru: "Система ООН", es: "Sistema de las Naciones Unidas", ar: "منظومة الأمم المتحدة" } }],
  // 各国部委
  [/^MINISTRY\s+OF/i, { typeKey: "MINISTRY_INTL", i18n: { zh: "各国政府部委", fr: "Ministères gouvernementaux", ru: "Министерства", es: "Ministerios", ar: "وزارات" } }],
  // 巴西各市消防
  [/BOMBEIROS/i, { typeKey: "BOMBEIROS_BR", i18n: { zh: "巴西各市消防", fr: "Pompiers du Brésil", ru: "Пожарные Бразилии", es: "Bomberos de Brasil", ar: "إطفاء البرازيل" } }],
  // 巴西各市环卫
  [/SANEAMENTO/i, { typeKey: "SANEAMENTO_BR", i18n: { zh: "巴西各市环卫", fr: "Assainissement du Brésil", ru: "Водоснабжение Бразилии", es: "Saneamiento de Brasil", ar: "الصرف الصحي البرازيلي" } }],
  // 巴西军事机构
  [/^COMANDO\s/i, { typeKey: "MILITARY_BR", i18n: { zh: "巴西军事机构", fr: "Institutions militaires du Brésil", ru: "Военные учреждения Бразилии", es: "Instituciones militares de Brasil", ar: "المؤسسات العسكرية البرازيلية" } }],
  // 国际开发银行
  [/^(WorldBank|WORLDBANK|Asian Development Bank|AfDB|adb_global|isdb_global|ISDB|ISDB_GLOBAL|AIIB|BNDES)$/i, { typeKey: "DEV_BANKS", i18n: { zh: "国际开发银行", fr: "Banques de développement", ru: "Банки развития", es: "Bancos de desarrollo", ar: "بنوك التنمية" } }],
  // 巴西大学
  [/^UNIVERSIDADE/i, { typeKey: "UNIVERSITY_BR", i18n: { zh: "巴西各大学", fr: "Universités du Brésil", ru: "Университеты Бразилии", es: "Universidades de Brasil", ar: "جامعات البرازيل" } }],
];

// ── 国际通用机构类型聚合（补充巴西/肯尼亚之外的全球常见机构类型）──
export const INTL_TYPE_PATTERNS: Array<[RegExp, { typeKey: string; i18n: Record<string, string> }]> = [
  // 市议会/市政委员会
  [/\b(?:City|Municipal|Town)\s+Council\b/i, { typeKey: "CITY_COUNCIL_INTL", i18n: { zh: "各市议会", fr: "Conseils municipaux", ru: "Городские советы", es: "Concejos municipales", ar: "المجالس البلدية" } }],
  [/\b(?:City|Municipal)\s+Government\b/i, { typeKey: "CITY_COUNCIL_INTL", i18n: { zh: "各市政府", fr: "Gouvernements municipaux", ru: "Муниципальные правительства", es: "Gobiernos municipales", ar: "الحكومات البلدية" } }],
  // 省/州级政府
  [/\b(?:Provincial|State)\s+Government\b/i, { typeKey: "PROVINCIAL_GOVT_INTL", i18n: { zh: "各省/州政府", fr: "Gouvernements provinciaux/étatiques", ru: "Провинциальные/штатные правительства", es: "Gobiernos provinciales/estatales", ar: "الحكومات الإقليمية/الولائية" } }],
  // 各类 Council
  [/\b(?:County|District|Regional|National|Local|Provincial|State|Federal|Central|National)\s+Council\b/i, { typeKey: "COUNCIL_INTL", i18n: { zh: "各议会", fr: "Conseils", ru: "Советы", es: "Consejos", ar: "المجالس" } }],
  [/\bCouncil\b/i, { typeKey: "COUNCIL_INTL", i18n: { zh: "各议会", fr: "Conseils", ru: "Советы", es: "Consejos", ar: "المجالس" } }],
  // 国家部委
  [/\bMinistry\s+of\b/i, { typeKey: "MINISTRY_INTL", i18n: { zh: "各国部委", fr: "Ministères", ru: "Министерства", es: "Ministerios", ar: "الوزارات" } }],
  [/\bDepartment\s+of\b/i, { typeKey: "DEPARTMENT_INTL", i18n: { zh: "各部门", fr: "Départements", ru: "Департаменты", es: "Departamentos", ar: "الإدارات" } }],
  // 管理局/委员会
  [/\bAuthority\b/i, { typeKey: "AUTHORITY_INTL", i18n: { zh: "各管理局", fr: "Autorités", ru: "Управления", es: "Autoridades", ar: "الهيئات" } }],
  [/\bCommittee\b/i, { typeKey: "COMMITTEE_INTL", i18n: { zh: "各委员会", fr: "Comités", ru: "Комитеты", es: "Comités", ar: "اللجان" } }],
  [/\bCommission\b/i, { typeKey: "COMMISSION_INTL", i18n: { zh: "各委员会", fr: "Commissions", ru: "Комиссии", es: "Comisiones", ar: "اللجان" } }],
  // Board
  [/\bBoard\b/i, { typeKey: "BOARD_INTL", i18n: { zh: "各理事会", fr: "Conseils", ru: "Советы", es: "Juntas", ar: "المجالس" } }],
  // Tribunal
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
  // 警察/警务
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
