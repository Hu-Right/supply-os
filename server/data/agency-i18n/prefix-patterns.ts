/**
 * 机构名前缀模式映射（巴西 / 肯尼亚 / 国际）
 * Agency Name Prefix Pattern Maps
 *
 * @module server/data/agency-i18n/prefix-patterns
 * @description RegExp + 工厂函数模式，用于按命名模式动态生成翻译。
 *              注意：连字符前缀递归模式（原 BR_EXTRA_PREFIX_MAP 中的 /^[A-Z]+\s*[-–—]/）
n *              已移至 translate.ts 的 translateByPattern() 中处理，以避免循环依赖。
 */
import type { PatternI18nResult } from "./types";

// ── 巴西葡萄牙语机构类型前缀映射 ──
export const BR_PREFIX_MAP: Array<[RegExp, (rest: string) => PatternI18nResult]> = [
  // 市级政府
  [/^MUNICIPIO (?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `MUNICIPIO DE ${rest}`,
    i18n: { zh: `${rest}市`, fr: `Municipalité de ${rest}`, ru: `Муниципалитет ${rest}`, es: `Municipio de ${rest}`, ar: `بلدية ${rest}` },
  })],
  // 州/市级厅局
  [/^SECRETARIA (?:DE|DA|DO|DE ESTADO (?:DE|DA|DO))\s+(.+)/i, (rest) => ({
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
// 注意：连字符前缀递归模式（/^[A-Z]+\s*[-–—]/）已移至 translate.ts
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
  // (UO) ESP- 巴西特殊机构
  [/^\(UO\)\s+ESP[-.]\s*(.+)/i, (rest) => ({
    canonical: `(UO) ESP ${rest}`,
    i18n: { zh: `${rest}（圣保罗州政府单位）`, fr: `(UO) ESP ${rest}`, ru: `(UO) ESP ${rest}`, es: `(UO) ESP ${rest}`, ar: `(UO) ESP ${rest}` },
  })],
  // HOSPITAL 更宽泛模式
  [/^HOSPITAL\s+(.+)/i, (rest) => ({
    canonical: `HOSPITAL ${rest}`,
    i18n: { zh: `${rest}医院`, fr: `Hôpital ${rest}`, ru: `Больница ${rest}`, es: `Hospital ${rest}`, ar: `مستشفى ${rest}` },
  })],
  // SECRETARIA 更宽泛模式
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
  // AGENCIA 更宽泛
  [/^AGENCIA\s+(.+)/i, (rest) => ({
    canonical: `AGENCIA ${rest}`,
    i18n: { zh: `${rest}局`, fr: `Agence ${rest}`, ru: `Агентство ${rest}`, es: `Agencia ${rest}`, ar: `وكالة ${rest}` },
  })],
  // CIA. (公司缩写)
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
  // PODER JUDICIARIO 更宽泛
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
  // 地名前缀 + TRIBUNAL
  [/^(?:[A-Z]+\s+)*TRIBUNAL\s+(?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `TRIBUNAL ${rest}`,
    i18n: { zh: `${rest}法院`, fr: `Tribunal ${rest}`, ru: `Суд ${rest}`, es: `Tribunal ${rest}`, ar: `محكمة ${rest}` },
  })],
  // SUPREMO TRIBUNAL FEDERAL (最高法院)
  [/^SUPREMO\s+TRIBUNAL\s+FEDERAL/i, () => ({
    canonical: 'SUPREMO TRIBUNAL FEDERAL',
    i18n: { zh: '巴西联邦最高法院', fr: 'Supreme Tribunal fédéral', ru: 'Верховный федеральный суд', es: 'Supremo Tribunal Federal', ar: 'المحكمة الاتحادية العليا' },
  })],
  // 地名前缀 + DEPARTAMENTO
  [/^(?:[A-Z]+\s+)*DEPARTAMENTO\s+(?:MUNICIPAL|ESTADUAL|NACIONAL)?\s*(?:DE|DA|DO)?\s*(.+)/i, (rest) => ({
    canonical: `DEPARTAMENTO ${rest}`,
    i18n: { zh: `${rest}部门`, fr: `Département ${rest}`, ru: `Департамент ${rest}`, es: `Departamento ${rest}`, ar: `إدارة ${rest}` },
  })],
  // 地名前缀 + ASSEMBLEIA
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
  // CAMARA DE VEREADORES 更宽泛
  [/^CAMARA DE VEREADORES\s+(?:DE|DO|DA)\s+(.+)/i, (rest) => ({
    canonical: `CÂMARA ${rest}`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil municipal ${rest}`, ru: `Городской совет ${rest}`, es: `Concejo municipal ${rest}`, ar: `مجلس البلدية ${rest}` },
  })],
  // SANEAMENTO (sanitation)
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
  // 复合机构名 (BMZ, EC, GIZ)
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
  // CAMARA 独立使用
  [/^(.+)\s+CAMARA$/i, (rest) => ({
    canonical: `${rest} Câmara`,
    i18n: { zh: `${rest}市议会`, fr: `Conseil ${rest}`, ru: `Совет ${rest}`, es: `Concejo ${rest}`, ar: `مجلس ${rest}` },
  })],
  // BATALHAO 更宽泛
  [/^(\d+)\s+BATALHAO\s+(.+)/i, (rest) => ({
    canonical: `BATALHAO ${rest}`,
    i18n: { zh: `${rest}营`, fr: `Bataillon ${rest}`, ru: `Батальон ${rest}`, es: `Batallón ${rest}`, ar: `كتيبة ${rest}` },
  })],
  // HELVTAS 带连字符
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
  // 肯尼亚学校
  [/^(.+)\s+(?:GIRLS|BOYS)\s+(?:HIGH\s+)?SCHOOL/i, (rest) => ({
    canonical: `${rest} School`,
    i18n: { zh: `${rest}中学`, fr: `École ${rest}`, ru: `Школа ${rest}`, es: `Escuela ${rest}`, ar: `مدرسة ${rest}` },
  })],
  // 肯尼亚水务
  [/^(.+)\s+WATER AND SANITATION/i, (rest) => ({
    canonical: `${rest} Water & Sanitation`,
    i18n: { zh: `${rest}水务公司`, fr: `Eau et assainissement ${rest}`, ru: `Водоснабжение ${rest}`, es: `Agua y saneamiento ${rest}`, ar: `المياه والصرف الصحي ${rest}` },
  })],
  // COUNTY COMMISSIONER/ASSEMBLY
  [/^COUNTY\s+(COMMISSIONER|ASSEMBLY|SERVICE)\s*(.+)/i, (rest) => ({
    canonical: `COUNTY ${rest}`,
    i18n: { zh: `县政府${rest}`, fr: `Comté ${rest}`, ru: `Округ ${rest}`, es: `Condado ${rest}`, ar: `مقاطعة ${rest}` },
  })],
  // Endebess NG-CDF
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
  // United Nations 长名
  [/^United Nations\s+(.+)/i, (rest) => ({
    canonical: `UN ${rest}`,
    i18n: { zh: `联合国${rest}`, fr: `ONU ${rest}`, ru: `ООН ${rest}`, es: `ONU ${rest}`, ar: `الأمم المتحدة ${rest}` },
  })],
  // UNDP/UNICEF/WHO 带后缀
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
  // 肯尼亚学校补充
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
  // 肯尼亚/国际后缀模式
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
  // 美国农业部等
  [/^United States Department of\s+(.+)/i, (rest) => ({
    canonical: `US Department of ${rest}`,
    i18n: { zh: `美国${rest}部`, fr: `Département d'État ${rest}`, ru: `Департамент США ${rest}`, es: `Departamento de EE.UU. ${rest}`, ar: `وزارة الولايات المتحدة ${rest}` },
  })],
  // 其他国际机构
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
