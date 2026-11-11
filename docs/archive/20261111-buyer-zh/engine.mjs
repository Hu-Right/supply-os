/**
 * 买家中文名离线生成引擎（无外部 LLM）
 *
 * 流程：清洗 → 噪声判定 → 语种识别 → 结构翻译（词典 + 语序重排）→ 音译兜底 → 纯度校验
 */
import { translitWord, foldLatin, cyrToLatin } from "./translit.mjs";

// ── 停用词（直接丢弃，不影响语义）────────────────────────────────────
const STOP = new Set([
  "of","de","du","des","di","del","della","delle","degli","dei","la","le","les","lo","il","l",
  "el","los","las","y","e","and","et","en","in","for","pour","para","per","do","da","dos","das",
  "the","a","an","al","à","au","aux","den","der","die","das","van","von","zu","og","i","na","naar",
  "und","et","och","on","at","by","with","where","which","au","aux","a","d","l","og","ved","pa","til","av","med","the2","что","и","в","на","по",
]);

// ── 机构/职能词典（多语）────────────────────────────────────────────
const GLOSS = {
  locale:"地方",
  sanitaria:"卫生",
  azienda:"局",
  italiana:"意大利",
  radiotelevisione:"广播电视",
  imprimerie:"印刷局",
  "federal":"联邦",
  "protection":"保护",
  "harassment":"骚扰",
  "omudsman":"申诉专员",
  "purchase":"采购",
  "campus":"校区",
  "integrated":"综合",
  "lycee":"中学",
  "licey":"中学",
  "bronnoysund":"布伦尼松德",
  "registerenheten":"登记局",
  // 组织类型
  ministry:"部", ministere:"部", ministerio:"部", ministero:"部", ministerstwo:"部",
  kementerian:"部", ministerie:"部", min:"部",
  department:"局", departement:"局", departamento:"局", departament:"局", dipartimento:"局",
  jabatan:"局", avdeling:"局", afdeling:"局", departemen:"局",
  secretariat:"秘书处", secretaria:"秘书处", segreteria:"秘书处", sekretariat:"秘书处",
  directorate:"局", direction:"局", direccion:"局", direzione:"局", dyrekcja:"局",
  directorat:"局", direktorat:"局",
  agency:"局", agence:"局", agencia:"局", agenzia:"局", agencja:"局", agensi:"局", agentur:"局",
  authority:"管理局", autorite:"管理局", autoridad:"管理局", autorita:"管理局",
  administracion:"管理局", amministrazione:"管理局", administrasjon:"管理局", administracja:"管理局",
  administration:"管理局", verwaltung:"管理局",
  commission:"委员会", comision:"委员会", commissione:"委员会", komisja:"委员会", suruhanjaya:"委员会",
  committee:"委员会", comite:"委员会", comitato:"委员会", komitet:"委员会", jawatankuasa:"委员会",
  council:"委员会", conseil:"委员会", consejo:"委员会", consiglio:"委员会", rada:"委员会",
  råd:"委员会", majlis:"委员会", dewan:"委员会",
  board:"委员会", junta:"委员会", direccion:"局",
  office:"办公室", oficina:"办公室", ufficio:"办公室", biuro:"办公室", pejabat:"办公室", kontor:"办公室",
  bureau:"局", biuroo:"局", byrå:"局",
  institute:"研究所", institut:"研究所", instituto:"研究所", istituto:"研究所", instytut:"研究所",
  institution:"机构", institucion:"机构", istituzione:"机构", instytucja:"机构",
  university:"大学", universite:"大学", universidad:"大学", universita:"大学",
  uniwersytet:"大学", universiti:"大学", universitet:"大学", hochschule:"学院",
  college:"学院", colegio:"学院", collegio:"学院", szkola:"学校",
  school:"学校", escuela:"学校", scuola:"学校", skole:"学校", sekolahan:"学校",
  hospital:"医院", hopital:"医院", hospital:"医院", ospedale:"医院", szpital:"医院", sjukehus:"医院",
  clinic:"诊所", clinica:"诊所",
  center:"中心", centre:"中心", centro:"中心", centrum:"中心", pusat:"中心", senter:"中心", sentrum:"中心",
  foundation:"基金会", fondation:"基金会", fundacion:"基金会", fondazione:"基金会",
  fundacja:"基金会", yayasan:"基金会", stiftelse:"基金会",
  fund:"基金", fonds:"基金", fondo:"基金", fundo:"基金", fundusz:"基金", dana:"基金", fond:"基金",
  bank:"银行", banque:"银行", banco:"银行",
  company:"公司", companhia:"公司", compagnia:"公司", spolka:"公司", syarikat:"公司",
  selskap:"公司", gesellschaft:"公司", firma:"公司",
  corporation:"公司", corporacion:"公司", corporazione:"公司", korporasi:"公司",
  enterprise:"企业", empresa:"企业", impresa:"企业", przedsiebiorstwo:"企业", unternehmen:"企业",
  establishment:"机构", entity:"机构", entidad:"机构", entita:"机构", podmiot:"机构",
  association:"协会", asociacion:"协会", associazione:"协会", stowarzyszenie:"协会", persatuan:"协会",
  federation:"联合会", federacion:"联合会", federazione:"联合会", federasi:"联合会",
  union:"联盟", union:"联盟", unione:"联盟", unia:"联盟", unie:"联盟",
  cooperative:"合作社", cooperative2:"合作社", cooperativa:"合作社", spoldzielnia:"合作社", koperasi:"合作社",
  chamber:"商会", chambre:"商会", camara:"商会", camera:"商会", izba:"商会", dewan2:"商会",
  society:"协会", societe:"公司", sociedad:"公司", societa:"公司", spolek:"协会",
  academy:"学院", academia:"学院", accademia:"学院", akademia:"学院", akademi:"学院",
  polytechnic:"理工学院", polytechnique:"理工学院", politecnico:"理工学院", politechnika:"理工学院",
  library:"图书馆", bibliotheque:"图书馆", biblioteca:"图书馆", biblioteka:"图书馆",
  museum:"博物馆", musee:"博物馆", museo:"博物馆", muzeum:"博物馆", muzium:"博物馆",
  theatre:"剧院", theater:"剧院", theatre2:"剧院", teatro:"剧院", teatr:"剧院",
  police:"警察局", policia:"警察局", polizia:"警察局", policja:"警察局", polis:"警察局",
  army:"陆军", armee:"陆军", ejercito:"陆军", esercito:"陆军", armia:"陆军", tentera:"军队",
  navy:"海军", airforce:"空军",
  guard:"卫队", garde:"卫队", guardia:"卫队", gwardia:"卫队", pengawal:"卫队",
  court:"法院", tribunal:"法院", cour:"法院", corte:"法院", sad:"法院", mahkamah:"法院",
  prison:"监狱", penitentiary:"监狱", gefangnis:"监狱",
  parliament:"议会", parlement:"议会", parlamento:"议会", parlament:"议会", parlimen:"议会",
  assembly:"议会", assemblee:"议会", asamblea:"议会", assemblea:"议会",
  municipality:"市", municipalite:"市", municipalidad:"市", municipio:"市", gemeinde:"市",
  kommune:"市", gmina:"市", kommun:"市", kotamadya:"市",
  prefecture:"省", prefectura:"省", prefettura:"省", prefeitura:"市政府",
  province:"省", provincia:"省", provinsi:"省", prowincja:"省", provincie:"省",
  region:"大区", region2:"大区", region3:"大区", region4:"大区", regione:"大区", wilayah:"大区",
  district:"区", distrito:"区", distretto:"区", dzielnica:"区", daerah:"区", distrikt:"区",
  county:"县", comte:"县", condado:"县", fylke:"郡", powiat:"县",
  city:"市", ville:"市", ciudad:"市", citta:"市", miasto:"市", bandar:"市", by:"市", stad:"市",
  town:"镇", commune:"镇", comuna:"镇", comune:"市", gmina2:"镇", landsby:"镇",
  village:"村", pueblo:"村", village2:"村", dorpie:"村", desa:"村", kampung:"村",
  borough:"区", arrondissement:"区", bezirk:"区", quartier:"区",
  parish:"教区", parroquia:"教区", parrocchia:"教区",
  state:"州", estado:"州", stato:"州", stan:"州", negeri:"州", delstat:"州",
  government:"政府", gouvernement:"政府", gobierno:"政府", governo:"政府", regjering:"政府",
  governorship:"省政府", prefecture2:"省",
  authority2:"管理局",
  // 领域
  health:"卫生", sante:"卫生", salud:"卫生", sanita:"卫生", salute:"卫生", zdrowie:"卫生",
  kesihatan:"卫生", helse:"卫生", gesundheit:"卫生", health2:"卫生",
  medical:"医疗", medical2:"医疗", medico:"医疗", medyczny:"医疗", perubatan:"医疗",
  education:"教育", educacion:"教育", istruzione:"教育", edukacja:"教育", pendidikan:"教育",
  utdanning:"教育", bildung:"教育", ensino:"教育", education2:"教育",
  transport:"交通", transports:"交通", transporte:"交通", transport2:"交通", transport3:"交通",
  pengangkutan:"交通", samferdsel:"交通", verkehr:"交通",
  infrastructure:"基础设施", infraestructura:"基础设施", infrastruktura:"基础设施", infrastruktur:"基础设施",
  water:"水利", eau:"水利", agua:"水利", acqua:"水利", woda:"水利", air:"水利", vann:"水利",
  wasser:"水利", hidrica:"水利", hidrico:"水利",
  energy:"能源", energie:"能源", energia:"能源", energi:"能源", energie2:"能源",
  electricity:"电力", electricite:"电力", electricidad:"电力", elettricita:"电力",
  elektrycznosc:"电力", elektrisitet:"电力", strom:"电力", ketenagalistrikan:"电力",
  power:"电力", strom2:"电力",
  environment:"环境", environnement:"环境", medioambiente:"环境", ambiente:"环境",
  srodowisko:"环境", alam:"环境", miljo:"环境", umwelt:"环境",
  agriculture:"农业", agricultura:"农业", agricoltura:"农业", rolnictwo:"农业",
  pertanian:"农业", landbruk:"农业", landwirtschaft:"农业",
  forestry:"林业", forets:"林业", foresteria:"林业", foreste:"林业", lesnictwo:"林业",
  perhutanan:"林业", skog:"林业",
  fisheries:"渔业", peche:"渔业", pesca:"渔业", rybolowstwo:"渔业", perikanan:"渔业",
  livestock:"畜牧业", ganaderia:"畜牧业", husbandry:"畜牧业", ternakan:"畜牧业",
  health3:"卫生",
  public:"公共", pubblica:"公共", publico:"公共", publiczny:"公共", awam:"公共", offentlig:"公共",
  works:"工程", travaux:"工程", obras:"工程", opere:"工程", roboty:"工程", kerja:"工程",
  services:"服务", servicios:"服务", servizi:"服务", uslugi:"服务", perkhidmatan:"服务",
  tjenester:"服务", dienstleistungen:"服务", servicos:"服务",
  social:"社会", sociale:"社会", sosial:"社会", soziale:"社会",
  security:"安全", securite:"安全", seguridad:"安全", sicurezza:"安全", bezpieczenstwo:"安全",
  keselamatan:"安全", sikkerhet:"安全", sicherheit:"安全",
  defence:"国防", defense:"国防", defensa:"国防", difesa:"国防", obrona:"国防",
  pertahanan:"国防", forsvar:"国防", verteidigung:"国防",
  justice:"司法", justicia:"司法", giustizia:"司法", sprawiedliwosc:"司法", keadilan:"司法",
  finance:"财政", finances:"财政", finanzas:"财政", finanze:"财政", finanse:"财政",
  kewangan:"财政", finans:"财政", finanz:"财政",
  economy:"经济", economie:"经济", economia:"经济", gospodarka:"经济", ekonomi:"经济",
  planning:"规划", planification:"规划", planificacion:"规划", pianificazione:"规划",
  planowanie:"规划", perancangan:"规划", planlegging:"规划", planung:"规划",
  interior:"内政", intérieur:"内政", interior2:"内政", interno:"内政", innenministerium:"内政",
  foreign:"外交", étrangeres:"外交", exteriores:"外交", esteri:"外交", luar:"外交",
  affairs:"事务", affaires:"事务", asuntos:"事务", affari:"事务", hal:"事务",
  trade:"贸易", commerce:"贸易", comercio:"贸易", commercio:"贸易", handel:"贸易",
  perdagangan:"贸易", handel2:"贸易",
  industry:"工业", industria:"工业", industri:"工业", industrie:"工业", perindustrian:"工业",
  industrial:"工业",
  development:"发展", developpement:"发展", desarrollo:"发展", sviluppo:"发展",
  rozwoj:"发展", pembangunan:"发展", utvikling:"发展", entwicklung:"发展",
  investment:"投资", inversion:"投资", investimento:"投资", inwestycja:"投资",
  pelaburan:"投资", investering:"投资",
  construction:"建设", construccion:"建设", costruzione:"建设", budowa:"建设",
  pembinaan:"建设", bygg:"建设", bau:"建设",
  engineering:"工程", ingenierie:"工程", ingenieria:"工程", ingegneria:"工程",
  inzynieria:"工程", kejuruteraan:"工程", teknikk:"工程",
  technology:"技术", technologie:"技术", tecnologia:"技术", teknologia:"技术",
  teknologi:"技术", technik:"技术",
  research:"研究", recherche:"研究", investigacion:"研究", ricerca:"研究",
  badania:"研究", penyelidikan:"研究", forskning:"研究", forschung:"研究",
  science:"科学", sciences:"科学", ciencia:"科学", scienza:"科学", nauk:"科学",
  sains:"科学", vitenskap:"科学",
  culture:"文化", cultura:"文化", kultura:"文化", kebudayaan:"文化", kultur:"文化",
  tourism:"旅游", tourisme:"旅游", turismo:"旅游", turystyka:"旅游", pelancongan:"旅游",
  sport:"体育", sports:"体育", deporte:"体育", sport2:"体育", sukan:"体育", idrett:"体育",
  youth:"青年", jeunesse:"青年", juventud:"青年", gioventu:"青年", belia:"青年",
  women:"妇女", femme:"妇女", mujer:"妇女", donna:"妇女", wanita:"妇女", kvinne:"妇女",
  children:"儿童", enfance:"儿童", infancia:"儿童", infanzia:"儿童", kanak:"儿童",
  family:"家庭", famille:"家庭", familia:"家庭", keluarga:"家庭",
  labor:"劳动", travail:"劳动", trabajo:"劳动", lavoro:"劳动", tenaga:"劳动", arbeid:"劳动",
  employment:"就业", emploi:"就业", empleo:"就业", impiego:"就业", pekerjaan:"就业",
  immigration:"移民", immigration2:"移民", inmigracion:"移民", imigrasi:"移民",
  housing:"住房", logement:"住房", vivienda:"住房", abitazione:"住房", perumahan:"住房",
  urban:"城市", urbain:"城市", urbano:"城市", urbana:"城市", bandar2:"城市",
  rural:"农村", rural2:"农村", perdesaan:"农村",
  regional:"区域", regional2:"区域", regional3:"区域", regional4:"区域", wilayah2:"区域",
  local:"地方", locale:"地方", lokal:"地方", lokal2:"地方",
  national:"国家", nacional:"国家", nazionale:"国家", nasional:"国家", nasjonalt:"国家",
  federal:"联邦", federale:"联邦", bundes:"联邦",
  european:"欧洲", europeen:"欧洲", europeo:"欧洲", europejska:"欧洲", eropah:"欧洲",
  international:"国际", internacional:"国际", internationale:"国际", antarabangsa:"国际",
  general:"总", generale:"总", general2:"总", allgemein:"总", am:"总",
  central:"中央", centrale:"中央", sentral:"中央",
  // 设施
  port:"港", porto2:"港", harbour:"港", pelabuhan:"港", havn:"港", hafen:"港",
  airport:"机场", aeroport:"机场", aeropuerto:"机场", aeroporto:"机场", lotnisko:"机场",
  lapangan:"机场", lufthavn:"机场",
  railway:"铁路", ferrocarril:"铁路", ferrovia:"铁路", kolej:"铁路", keretapi:"铁路", jernbane:"铁路",
  road:"道路", routes:"道路", carreteras:"道路", strada:"道路", droga:"道路", jalan:"道路", vei:"道路",
  highway:"公路", motorway:"高速公路", autopista:"高速公路", autostrada:"高速公路",
  bridge:"桥梁", pont:"桥梁", puente:"桥梁", ponte:"桥梁", most:"桥梁", jambatan:"桥梁", bro:"桥梁",
  dam:"水坝", barrage:"水坝", presa:"水坝", diga:"水坝", zapora:"水坝", empangan:"水坝",
  reservoir:"水库", aqueduct:"渡槽", canal:"运河", canal2:"运河",
  sanitation:"环境卫生", assainissement:"环境卫生", saneamiento:"环境卫生", fognatura:"环境卫生",
  waste:"废物", dechets:"废物", residuos:"废物", rifiuti:"废物", odpady:"废物", sampah:"废物",
  sewage:"污水", eaux:"水务", aguas:"水务", acque:"水务",
  irrigation:"灌溉", irrigation2:"灌溉", riego:"灌溉", irrigazione:"灌溉", irygacja:"灌溉",
  pengairan:"灌溉", vanning:"灌溉",
  // 其他常见
  procurement:"采购", achats:"采购", compras:"采购", acquisti:"采购", zakupy:"采购", perolehan:"采购",
  purchasing:"采购", supply:"供应", supplies:"供应", approvisionnement:"供应", suministro:"供应",
  project:"项目", projet:"项目", proyecto:"项目", progetto:"项目", projekt:"项目", projek:"项目",
  programme:"计划", program:"计划", programa:"计划", programme2:"计划", program2:"计划",
  initiative:"倡议", initiative2:"倡议", inicjatywa:"倡议", inisiatif:"倡议",
  contract:"合同", contracts:"合同", contrat:"合同", contratos:"合同", contratto:"合同",
  tender:"招标", tenders:"招标", appel:"招标", licitacion:"招标", appalto:"招标",
  legal:"法律", juridique:"法律", juridico:"法律", giuridico:"法律", prawny:"法律", undang:"法律",
  tax:"税务", impots:"税务", tributos:"税务", fiscale:"税务", podatkowy:"税务", cukai:"税务",
  customs:"海关", douanes:"海关", aduanas:"海关", dogana:"海关", celny:"海关", kastam:"海关",
  statistics:"统计", statistique:"统计", estadistica:"统计", statistica:"统计", statistik:"统计",
  mapping:"测绘", cartography:"测绘", cartografia:"测绘", topografia:"测绘",
  meteorology:"气象", meteorologie:"气象", meteorologia:"气象", metrologi:"气象",
  hydrology:"水文", hidrologia:"水文", hydrologie:"水文",
  broadcasting:"广播", radiodiffusion:"广播", radiodifusion:"广播", penyiaran:"广播",
  television:"电视", television2:"电视", televisio:"电视", televisyen:"电视",
  telecommunications:"电信", telecomunicaciones:"电信", telekomunikacja:"电信", telekomunikasi:"电信",
  postal:"邮政", poste:"邮政", correos:"邮政", poste2:"邮政", poczta:"邮政", pos:"邮政",
  aviation:"航空", aviation2:"航空", aviacion:"航空", aviazione:"航空", penerbangan:"航空",
  maritime:"海事", maritime2:"海事", maritimo:"海事", marittimo:"海事", marin:"海事",
  shipping:"航运", navigation:"航运", navigazione:"航运", perkapalan:"航运",
  mining:"矿业", mines:"矿业", mineria:"矿业", miniera:"矿业", gornictwo:"矿业", perlombongan:"矿业",
  oil:"石油", petrol:"石油", petroleo:"石油", petrolio:"石油", ropa:"石油", petroleum:"石油",
  gas:"燃气", gaz:"燃气", elektrownia:"电厂", power2:"电力",
  chemical:"化工", chimie:"化工", quimica:"化工", chimica:"化工", chemia:"化工", kimia:"化工",
  pharmaceutical:"医药", farmaceutica:"医药", farmasi:"医药", farmacja:"医药",
  textile:"纺织", textil:"纺织", tekstil:"纺织",
  food:"食品", alimentation:"食品", alimentos:"食品", alimentare:"食品", makanan:"食品",
  agriculture2:"农业",
  machinery:"机械", machines:"机械", maquinaria:"机械", macchine:"机械", maszyn:"机械", jentera:"机械",
  equipment:"设备", equipement:"设备", equipos:"设备", attrezzature:"设备", peralatan:"设备",
  electronics:"电子", electronique:"电子", electronica:"电子", elektronik:"电子",
  software:"软件", informatique:"信息", informatica:"信息", informatika:"信息", teknologi2:"信息",
  information:"信息", informacion:"信息", informazione:"信息", maklumat:"信息",
  communication:"通信", comunicacion:"通信", comunicazione:"通信", komunikasi:"通信",
  // 企业后缀
  ltd:"有限公司", limited:"有限公司", llc:"有限责任公司", inc:"公司", plc:"公司",
  gmbh:"有限责任公司", ag:"股份公司", sa:"股份公司", sas:"简易股份公司", sarl:"有限责任公司",
  spa:"股份公司", srl:"有限责任公司", ltda:"有限公司", as:"股份公司", ab:"股份公司",
  oy:"公司", bv:"公司", nv:"公司", pty:"公司", kft:"有限责任公司", zrt:"股份公司",
  doo:"有限责任公司", zoo:"有限责任公司", ad:"股份公司", eood:"有限责任公司", ood:"有限责任公司",
  // 连接
  and2:"与", of2:"的",
};

// ── 补充词典（第二批，覆盖高频专名与方位/复数形态）────────────────
Object.assign(GLOSS, {
  islamic:"伊斯兰", islamique:"伊斯兰", islamico:"伊斯兰", islam:"伊斯兰",
  metropolitana:"大都会", metropolitano:"大都会", metropolitan:"大都会", metropole:"大都会",
  ayuntamiento:"市政府", alcaldia:"市政府", alcadia:"市政府", mairie:"市政府", ratusz:"市政厅",
  deutsche:"德国", deutsch:"德国", german:"德国", allemand:"德国", aleman:"德国",
  co:"公司", corp:"公司", corporation2:"公司", holdings:"控股", holding:"控股",
  group:"集团", grupo:"集团", groupe:"集团", gruppe:"集团", kumpulan:"集团", konsern:"集团",
  fylkeskommune:"郡", fylkesmann:"郡长办公室", kommune2:"市",
  bahagian:"处", bahagian2:"处", unit:"单位", seksyen:"科", cawangan:"分局",
  norte:"北", nord:"北", north:"北", septentrional:"北",
  sul:"南", sud:"南", south:"南", meridional:"南",
  este:"东", east:"东", orientale:"东", oeste:"西", west:"西", occidentale:"西",
  central2:"中央", norte2:"北",
  airlines:"航空", airways:"航空", aviation3:"航空",
  harbours:"港", harbors:"港", ports:"港",
  consortium:"联合体", consorcio:"联合体", consorzio:"联合体", consórcio:"联合体",
  alliance:"联盟", alianza:"联盟", aliança:"联盟", sojusz:"联盟",
  trust:"信托", trust2:"信托", grupa:"集团",
  publics:"公共", publiques:"公共", publicos:"公共", pubblici:"公共",
  internationale:"国际", international2:"国际", internazionale:"国际",
  nationale:"国家", national2:"国家", nacionais:"国家",
  regionale:"区域", regionali:"区域", regionaux:"区域",
  generale2:"总", generali:"总", generaux:"总",
  scolaire:"学校", schulen:"学校", escolar:"学校",
  sanitaire:"卫生", sanitario:"卫生", sanitarias:"卫生", sanitaires:"卫生",
  hospitalier:"医院", hospitaliere:"医院", hospitalarias:"医院",
  universitaire:"大学", universitario:"大学",
  technique:"技术", tecnico:"技术", tecnica:"技术", techniczny:"技术",
  municipal2:"市政", municipale:"市政", municipais:"市政", municipal3:"市政",
  departamental:"省", departmental:"省", departemental:"省",
  provincial2:"省", provinciale:"省", provincial3:"省",
  rural3:"农村", urbaine:"城市", urbain2:"城市",
  scolaire2:"学校",
});

/** 复辅音/复数容错：查不到就去掉尾部 s/es 再查 */
function glossOf(tok) {
  const t = foldLatin(tok).toLowerCase().replace(/[.,'"()]/g, "");
  if (GLOSS[t]) return GLOSS[t];
  if (t.length > 4 && t.endsWith("es") && GLOSS[t.slice(0, -2)]) return GLOSS[t.slice(0, -2)];
  if (t.length > 3 && t.endsWith("s") && GLOSS[t.slice(0, -1)]) return GLOSS[t.slice(0, -1)];
  return "";
}

// ── 第三批：法/西/意/葡 机构与领域词（行式定义）────────────────────
const EXTRA_WORDS = `
programme|计划
programa|计划
programma|计划
projet|项目
proyecto|项目
progetto|项目
projeto|项目
developpement|发展
desarrollo|发展
sviluppo|发展
desenvolvimento|发展
reconstruction|重建
reconstruccion|重建
ricostruzione|重建
reconstrucao|重建
special|特别
especial|特别
speciale|特别
appui|支持
apoyo|支持
sostegno|支持
apoio|支持
filiere|产业链
secteur|部门
sector|部门
settore|部门
setor|部门
agricole|农业
agricoles|农业
agricola|农业
agricolas|农业
coton|棉花
algodon|棉花
cotone|棉花
societe|公司
sociedad|公司
societa|公司
sociedade|公司
camerounaise|喀麦隆
camerounais|喀麦隆
electricite|电力
electricidad|电力
elettricita|电力
eletricidade|电力
gouverneur|州长
gobernador|州长
governatore|州长
governador|州长
maire|市长
alcalde|市长
sindaco|市长
prefeito|市长
secretaire|秘书
secretario|秘书
segretario|秘书
impots|税务
impuestos|税务
tributi|税务
impostos|税务
jeunesse|青年
juventud|青年
gioventu|青年
juventude|青年
civique|公民
civica|公民
domaine|地产
demanio|地产
cadastre|地籍
catastro|地籍
catasto|地籍
cadastro|地籍
fonciere|土地
foncieres|土地
fondiario|土地
fundiario|土地
habitat|住房
vivienda|住房
abitazione|住房
habitacao|住房
urbain|城市
urbano|城市
urbana|城市
economie|经济
economia|经济
planification|规划
planificacion|规划
pianificazione|规划
planejamento|规划
amenagement|整治
ordenamiento|整治
assetto|整治
territoire|领土
territorio|领土
enseignement|教育
ensenanza|教育
insegnamento|教育
superieur|高等
superior|高等
superiore|高等
recherche|研究
investigacion|研究
ricerca|研究
pesquisa|研究
scientifique|科学
cientifica|科学
scientifica|科学
sante|卫生
salud|卫生
sanita|卫生
saude|卫生
publique|公共
publica|公共
pubblica|公共
commerce|商业
comercio|商业
commercio|商业
industrie|工业
industria|工业
mine|矿业
minas|矿业
miniere|矿业
eau|水利
agua|水利
acqua|水利
energie|能源
energia|能源
obra|工程
obras|工程
opere|工程
publiques|公共
publicas|公共
pubbliche|公共
transport|交通
transporte|交通
trasporto|交通
culture|文化
cultura|文化
sport|体育
deporte|体育
deportes|体育
tourisme|旅游
turismo|旅游
environnement|环境
medio|环境
ambiente|环境
foret|林业
forets|林业
bosques|林业
foreste|林业
peche|渔业
pesca|渔业
elevage|畜牧业
ganaderia|畜牧业
allevamento|畜牧业
defense|国防
defensa|国防
difesa|国防
finances|财政
finanzas|财政
finanze|财政
budget|预算
presupuesto|预算
bilancio|预算
tresor|国库
tesoro|国库
douane|海关
douanes|海关
aduanas|海关
dogana|海关
statistique|统计
estadistica|统计
statistica|统计
recensement|普查
censo|普查
censimento|普查
meteo|气象
meteorologia|气象
irrigation|灌溉
riego|灌溉
irrigazione|灌溉
assainissement|环境卫生
saneamiento|环境卫生
fognatura|环境卫生
urbanisme|城市规划
urbanismo|城市规划
urbanistica|城市规划
logement|住房
femme|妇女
femmes|妇女
mujer|妇女
mujeres|妇女
donna|妇女
mulher|妇女
famille|家庭
familia|家庭
famiglia|家庭
enfance|儿童
infancia|儿童
infanzia|儿童
population|人口
poblacion|人口
popolazione|人口
cooperation|合作
cooperacion|合作
cooperazione|合作
integration|一体化
integracion|一体化
integrazione|一体化
exterieures|对外
exteriores|对外
esteri|对外
relations|关系
relaciones|关系
relazioni|关系
gouvernorat|省
wilaya|省
municipalite|市
municipalidad|市
municipalita|市
arrondissement|区
village|村
aldea|村
villaggio|村
`;

for (const line of EXTRA_WORDS.trim().split("\n")) {
  const i = line.indexOf("|");
  if (i > 0) GLOSS[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

/** 组织类型词（出现在首个词时后置为后缀） */
const ORG_HEAD = new Set(["azienda","ministry","ministere","ministerio","ministero","ministerstwo","kementerian","ministerie",
  "department","departement","departamento","departament","dipartimento","jabatan",
  "secretariat","secretaria","segreteria","sekretariat","directorate","direction","direccion",
  "direzione","agency","agence","agencia","agenzia","agencja","agensi","authority","autorite",
  "autoridad","autorita","administration","administracion","amministrazione","kommune","gmina",
  "municipality","municipalite","municipalidad","municipio","gemeinde","province","provincia",
  "region","regione","district","distrito","distretto","county","comte","condado","fylke",
  "city","ville","ciudad","citta","miasto","commune","comuna","comune","state","estado","stato",
  "government","gouvernement","gobierno","governo","university","universite","universidad",
  "universita","uniwersytet","universiti","hospital","hopital","ospedale","szpital","institute",
  "institut","instituto","istituto","instytut","school","escuela","scuola","college","colegio",
  "bank","banque","banco","fund","fonds","fondo","fundo","foundation","fondation","fundacion",
  "fondazione","office","oficina","ufficio","biuro","pejabat","bureau","center","centre","centro",
  "centrum","pusat","company","corporation","corporacion","enterprise","empresa","impresa",
  "association","asociacion","associazione","federation","federacion","federazione","union",
  "unione","cooperative","cooperativa","chamber","chambre","camara","camera","academy","academia",
  "library","bibliotheque","biblioteca","museum","musee","museo","police","policia","army",
  "armee","ejercito","esercito","court","tribunal","parliament","parlement","parlamento",
  "prefecture","prefeitura","port","porto","airport","aeroport","railway","hospital2","societe","sociedad","societa","sociedade","maire","alcalde","sindaco","prefeito","gouverneur","gobernador","gouvernorat","wilaya"]);

const REJECT_PATTERNS = [
  [/(^|\s)(https?:\/\/|www\.)/i, "url"],
  [/^Error\s*\d{3}/i, "error"],
  [/(FAQS|Sitemap|Contact Support|About us|Privacy Policy|Cookie Policy|Sign in|Log in|Register|Newsletter)/i, "nav"],
  [/\b(is|are|was|were|has|have)\b.*\b(is|are|was|were|has|have)\b/i, "sentence"],
  [/\b(is|are|was|were)\b/i, "sentence2"],
  [/(has decided|is a common|is a mess|is waiting|is the source|are the primary|was established)/i, "sentence3"],
  [/^(the|a|an)\s+(following|list|capital|first|second|third|department|irrigation|district|suburban|cathedral)\b.*\.$/i, "sentence4"],
  [/^\d+$/, "numeric"],
  [/^[.\-_/\\|,;:]+$/, "punct"],
];

/** 清洗：HTML 实体、层级串、登记码、引号 */
export function cleanName(raw) {
  let s = String(raw ?? "").replace(/\u00a0/g, " ");
  s = s.replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  s = s.replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/(^|\s)([ld])['’]/gi, "$1$2 ");
  s = s.replace(/\b([ld])['’]/gi, "$1 ");
  // 西班牙采购平台：名称 + 14 位登记码 + 层级串 → 只留名称
  s = s.replace(/\s+\d{10,}\s+.*$/, "");
  // 层级串 A>B>C → 取第一段
  if (s.includes(">")) s = s.split(">")[0];
  // 去掉尾部长的数字串/编号
  s = s.replace(/[,\s]+\d{6,}.*$/, "");
  s = s.replace(/^the\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[,\-–—:;|]+|[,\-–—:;|]+$/g, "").trim();
  return s;
}

/** 噪声判定；返回原因或空串 */
export function rejectReason(name) {
  const t = name.trim();
  if (!t) return "empty";
  if (t.length < 3) return "tooshort";
  for (const [re, why] of REJECT_PATTERNS) if (re.test(t)) return why;
  if (!/[A-Za-z\u0400-\u04ff\u0370-\u03ff\u0e00-\u0e7f\u0600-\u06ff\u0100-\u024f\u1e00-\u1eff]/.test(t)) return "noletter";
  return "";
}

// ── 越南语：汉越音表 ───────────────────────────────────────────────
const VN_SYL = {
  "việt":"越","nga":"俄","đa":"多","anh":"英","pháp":"法","mỹ":"美","nhật":"日","hàn":"韩","đức":"德","trung2":"中","bắc":"北","ninh":"宁","hà":"河","nội":"内","hải":"海","phòng":"防","nam":"南","trung":"中",
  "tâm":"心","y":"医","tế":"济","giáo":"教","dục":"育","công":"公","ty":"司","tổng":"总",
  "điện":"电","lực":"力","xây":"建","dựng":"筑","giao":"交","thông":"通","nông":"农",
  "nghiệp":"业","thủy":"水","lợi":"利","bệnh":"病","viện":"院","trường":"学","đại":"大",
  "học":"学","ngân":"银","hàng":"行","quản":"管","lý":"理","ban":"班","ủy":"委","nhân":"人",
  "dân":"民","sở":"所","văn":"文","phát":"发","triển":"展","đầu":"头","tư":"资","kế":"计",
  "hoạch":"划","tài":"财","chính":"政","nguyên":"元","môi":"媒","sinh":"生","khoa":"科",
  "kỹ":"技","thuật":"术","thương":"商","mại":"贸","dịch":"易","vụ":"务","xí":"企","hợp":"合",
  "tác":"作","xã":"社","hội":"会","đoàn":"团","thanh":"青","niên":"年","phụ":"妇","nữ":"女",
  "lao":"劳","động":"动","bảo":"保","hiểm":"险","viễn":"远","tin":"信","bưu":"邮","không":"空",
  "cảng":"港","đường":"路","sắt":"铁","cầu":"桥","đô":"都","thị":"市","huyện":"县","tỉnh":"省",
  "phường":"坊","quận":"郡","thôn":"村","khu":"区","cục":"局","chi":"分","nhánh":"支",
  "trạm":"站","đài":"台","xưởng":"厂","nhà":"家","máy":"机","thiết":"设","bị":"备","vật":"物",
  "dược":"药","thể":"体","thao":"操","nghệ":"艺","âm":"音","nhạc":"乐","mỹ":"美","du":"游",
  "lịch":"历","khách":"客","sạn":"馆","xuất":"出","nhập":"入","khẩu":"口","dân2":"民",
  "phòng2":"房","chuyên":"专","ngành":"业","cấp":"级","nước":"水","thoát":"排","vệ":"卫",
  "an":"安","toàn":"全","quốc":"国","gia":"家","phủ":"府","thành":"城","phố":"市","thành phố":"市",
  "quảng":"广","ninh2":"宁","đà":"岘","nẵng":"港","huế":"顺化","cần":"芹","thơ":"苴","đồng":"同",
  "bằng":"平","long":"龙","an2":"安","giang":"江","kiên":"坚","tây":"西","ninh3":"宁",
  "bình":"平","dương":"阳","vũng":"头","tàu":"顿","biên":"边","hòa":"和","định":"定",
  "khánh":"庆","hòa2":"和","nghệ":"艺","tĩnh":"静","quãng":"广","ngãi":"义","phú":"富",
  "yên":"安","thái":"太","nguyên2":"原","lạng":"谅","sơn":"山","cao":"高","bằng2":"平",
  "tuyên":"宣","quang":"光","hà2":"河","giang2":"江","nam2":"南","định2":"定","ninh4":"宁",
  "bến":"便","tre":"知","trà":"茶","vinh":"永","long2":"隆","hậu":"后","sóc":"朔","trăng":"庄",
  "bạc":"薄","liêu":"寮","cà":"哥","mau":"毛","điện2":"电","biên2":"边","lai":"莱","lâm":"林",
  "đồng2":"同","tháp":"塔","tiền":"前","bình2":"平","phước":"福","bà":"婆","rịa":"地",
  "vũng2":"头","tàu2":"顿","hưng":"兴","yên2":"安","thái2":"太","bình3":"平","hải2":"海",
  "dương2":"阳","kiên2":"坚","giang3":"江","hậu2":"后","cần2":"芹","thơ2":"苴",
};

/** 越南语机构前缀（长词优先）→ 中文后缀 */
const VN_ORG = [
  [["ban","quản","lý","dự","án"], "项目管理委员会"],
  [["ban","quản","lý"], "管理委员会"],
  [["ủy","ban","nhân","dân"], "人民委员会"],
  [["tổng","công","ty"], "总公司"],
  [["công","ty","tnhh","mtv"], "一人有限责任公司"],
  [["công","ty","tnhh"], "有限责任公司"],
  [["công","ty","cổ","phần"], "股份公司"],
  [["công","ty"], "公司"],
  [["chi","nhánh"], "分公司"],
  [["liên","doanh"], "合资企业"],
  [["bệnh","viện"], "医院"],
  [["trung","tâm"], "中心"],
  [["trường","đại","học","y"], "医科大学"],
  [["trường","đại","học"], "大学"],
  [["trường","cao","đẳng"], "学院"],
  [["trường","tiểu","học"], "小学"],
  [["trường","trung","học"], "中学"],
  [["trường"], "学校"],
  [["học","viện"], "学院"],
  [["viện"], "研究院"],
  [["ngân","hàng"], "银行"],
  [["bưu","điện"], "邮政局"],
  [["ủy","ban"], "委员会"],
  [["sở"], "厅"],
  [["cục"], "局"],
  [["tổng","cục"], "总局"],
  [["văn","phòng"], "办公室"],
  [["phòng"], "处"],
  [["xí","nghiệp"], "企业"],
  [["hợp","tác","xã"], "合作社"],
  [["nhà","máy"], "工厂"],
  [["cảng"], "港务局"],
  [["bảo","hiểm"], "保险"],
  [["thành","phố"], "市"],
  [["tỉnh"], "省"],
  [["huyện"], "县"],
  [["quận"], "郡"],
  [["xã"], "乡"],
  [["phường"], "坊"],
];

const VN_DIACRITIC = /[ăâđêôơưĂÂĐÊÔƠƯ]/;

/** 越南语多词固定搭配（长词优先，按块翻译后再整体逆序） */
const VN_CHUNK = [
  [["truyền","tải","điện"], "输电"],
  [["điện","lực"], "电力"],
  [["xây","dựng"], "建设"],
  [["công","trình"], "工程"],
  [["chuyên","ngành"], "专业"],
  [["y","tế"], "医疗"],
  [["đa","khoa"], "综合"],
  [["chuyên","khoa"], "专科"],
  [["y","học"], "医学"],
  [["đa","ngành"], "多行业"],
  [["quốc","gia"], "国家"],
  [["miền","bắc"], "北方"],
  [["miền","nam"], "南方"],
  [["miền","trung"], "中部"],
  [["bắc","ninh"], "北宁"],
  [["hà","nội"], "河内"],
  [["hồ","chí","minh"], "胡志明"],
  [["đà","nẵng"], "岘港"],
  [["hải","phòng"], "海防"],
  [["cần","thơ"], "芹苴"],
  [["đồng","nai"], "同奈"],
  [["bà","rịa"], "巴地"],
  [["vũng","tàu"], "头顿"],
  [["quảng","ninh"], "广宁"],
  [["thanh","hóa"], "清化"],
  [["nghệ","an"], "义安"],
  [["thái","nguyên"], "太原"],
  [["việt","nam"], "越南"],
  [["việt","nga"], "越俄"],
  [["nhà","nước"], "国家"],
  [["phi","lợi"], "营利"],
  [["cổ","phần"], "股份"],
  [["trách","nhiệm","hữu","hạn"], "有限责任"],
  [["tự","nguyện"], "志愿"],
  [["dân","sự"], "民用"],
  [["công","nghiệp"], "工业"],
  [["nông","nghiệp"], "农业"],
  [["thương","mại"], "贸易"],
  [["dịch","vụ"], "服务"],
  [["du","lịch"], "旅游"],
  [["giao","thông"], "交通"],
  [["vận","tải"], "运输"],
  [["bưu","chính"], "邮政"],
  [["viễn","thông"], "电信"],
  [["công","nghệ"], "技术"],
  [["thông","tin"], "信息"],
  [["tài","nguyên"], "资源"],
  [["môi","trường"], "环境"],
  [["nước","sạch"], "清洁水"],
  [["cấp","nước"], "供水"],
  [["thoát","nước"], "排水"],
  [["chiếu","sáng"], "照明"],
  [["đầu","tư"], "投资"],
  [["phát","triển"], "发展"],
  [["quản","lý"], "管理"],
  [["khai","thác"], "开发"],
  [["bảo","trì"], "维护"],
  [["kỹ","thuật"], "技术"],
  [["thi","công"], "施工"],
  [["tư","vấn"], "咨询"],
  [["thiết","kế"], "设计"],
  [["giám","sát"], "监理"],
  [["nghiên","cứu"], "研究"],
  [["khoa","học"], "科学"],
  [["giáo","dục"], "教育"],
  [["đào","tạo"], "培训"],
  [["y","dược"], "医药"],
  [["dược","phẩm"], "药品"],
  [["thiết","bị"], "设备"],
  [["vật","tư"], "物资"],
  [["hàng","hải"], "海事"],
  [["hàng","không"], "航空"],
  [["đường","sắt"], "铁路"],
  [["đô","thị"], "城市"],
  [["nông","thôn"], "农村"],
  [["xây","lắp"], "安装"],
  [["thủy","lợi"], "水利"],
  [["thủy","điện"], "水电"],
  [["gia","lai"], "嘉莱"],
  [["đắk","lắk"], "多乐"],
  [["đắk","nông"], "多农"],
  [["sơn","la"], "山罗"],
  [["phú","thọ"], "富寿"],
  [["thanh","hóa"], "清化"],
  [["nghệ","an"], "义安"],
  [["hà","tĩnh"], "河静"],
  [["quảng","trị"], "广治"],
  [["quảng","bình"], "广平"],
  [["quảng","nam"], "广南"],
  [["quảng","ngãi"], "广义"],
  [["quảng","ninh"], "广宁"],
  [["bình","định"], "平定"],
  [["phú","yên"], "富安"],
  [["khánh","hòa"], "庆和"],
  [["ninh","thuận"], "宁顺"],
  [["bình","thuận"], "平顺"],
  [["kon","tum"], "昆嵩"],
  [["lâm","đồng"], "林同"],
  [["bình","phước"], "平福"],
  [["tây","ninh"], "西宁"],
  [["bình","dương"], "平阳"],
  [["đồng","nai"], "同奈"],
  [["vũng","tàu"], "头顿"],
  [["bến","cát"], "边葛"],
  [["chợ","lớn"], "堤岸"],
  [["long","an"], "隆安"],
  [["tiền","giang"], "前江"],
  [["bến","tre"], "槟椥"],
  [["trà","vinh"], "茶荣"],
  [["vĩnh","long"], "永隆"],
  [["đồng","tháp"], "同塔"],
  [["an","giang"], "安江"],
  [["kiên","giang"], "坚江"],
  [["cần","thơ"], "芹苴"],
  [["hậu","giang"], "后江"],
  [["sóc","trăng"], "朔庄"],
  [["bạc","liêu"], "薄寮"],
  [["cà","mau"], "金瓯"],
  [["hải","dương"], "海阳"],
  [["nam","định"], "南定"],
  [["thái","bình"], "太平"],
  [["hà","nam"], "河南"],
  [["ninh","bình"], "宁平"],
  [["vĩnh","phúc"], "永福"],
  [["bắc","giang"], "北江"],
  [["hưng","yên"], "兴安"],
  [["tuyên","quang"], "宣光"],
  [["yên","bái"], "安沛"],
  [["lào","cai"], "老街"],
  [["điện","biên"], "奠边"],
  [["lai","châu"], "莱州"],
  [["hòa","bình"], "和平"],
  [["thừa","thiên","huế"], "承天顺化"],
  [["quân","chủng"], "军种"],
  [["hải","quân"], "海军"],
  [["quân","đội"], "军队"],
  [["hữu","nghị"], "友谊"],
  [["trung","ương"], "中央"],
  [["hạ","tầng","mạng"], "网络基础设施"],
  [["hạ","tầng"], "基础设施"],
  [["nhiệt","điện"], "火电"],
  [["tập","đoàn"], "集团"],
  [["xăng","dầu"], "石油"],
  [["kiểm","soát"], "控制"],
  [["bệnh","tật"], "疾病"],
  [["văn","hóa"], "文化"],
  [["thể","thao"], "体育"],
  [["cà","mau"], "金瓯"],
  [["kiên","giang"], "坚江"],
  [["an","giang"], "安江"],
  [["đồng","tháp"], "同塔"],
  [["vĩnh","long"], "永隆"],
  [["bến","tre"], "槟椥"],
  [["trà","vinh"], "茶荣"],
  [["sóc","trăng"], "朔庄"],
  [["bạc","liêu"], "薄寮"],
  [["hậu","giang"], "后江"],
  [["cần","thơ"], "芹苴"],
  [["đô","thành"], "都市"],
  [["xây","dựng","cơ","bản"], "基本建设"],
  [["cơ","sở","hạ","tầng"], "基础设施"],
  [["phát","triển","nông","thôn"], "农村发展"],
  [["quỹ","đầu","tư"], "投资基金"],
  [["bảo","hiểm","xã","hội"], "社会保险"],
  [["bảo","hiểm","y","tế"], "医疗保险"],
  [["dân","số"], "人口"],
  [["gia","đình"], "家庭"],
  [["trẻ","em"], "儿童"],
  [["phụ","nữ"], "妇女"],
];

function vnChunks(words) {
  const out = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (const [phrase, zh] of VN_CHUNK) {
      if (phrase.every((w, k) => words[i + k] === w)) {
        out.push(zh); i += phrase.length; matched = true; break;
      }
    }
    if (matched) continue;
    const w = words[i];
    out.push(VN_SYL[w] ?? translitWord(w));
    i += 1;
  }
  return out;
}

/** 单段越南语：递归剥离机构前缀，其余按块逆序 */
function vnSegment(words) {
  for (const [phrase, zh] of VN_ORG) {
    if (words.length > phrase.length && phrase.every((w, k) => words[k] === w)) {
      const rest = words.slice(phrase.length);
      // 剩余部分还带机构前缀 → 递归，外层后缀永远在最后
      const hasInner = VN_ORG.some(([ph]) => rest.length > ph.length && ph.every((w, k) => rest[k] === w));
      const inner = hasInner ? vnSegment(rest) : vnChunks(rest).reverse().join("");
      return inner + zh;
    }
  }
  return vnChunks(words).reverse().join("");
}

function translateVietnamese(name) {
  const segments = name.split(/\s+[-–—]\s+/).filter(Boolean);
  return segments
    .map((seg) => {
      const words = seg.toLowerCase().replace(/[.,;:()"']/g, " ").split(/\s+/).filter(Boolean);
      return words.length ? vnSegment(words) : "";
    })
    .filter(Boolean)
    .join("－");
}

function titleGloss(token) {
  const t = token.toLowerCase().replace(/[.,'"()]/g, "");
  return GLOSS[t] ?? "";
}

/** 通用结构翻译 */
/** 西里尔机构词（保/俄/乌常见） */
const CYR_GLOSS = {
  "министерство":"部","міністерство":"部","министерства":"部","на":"的","и":"与","за":"",
  "образование":"教育","образованието":"教育","наука":"科学","науки":"科学","науки2":"科学",
  "науките":"科学","култура":"文化","културата":"文化","здравеопазване":"卫生",
  "здравеопазването":"卫生","охорона":"保护","здоровя":"卫生","охорони":"保护",
  "община":"市","общината":"市","общински":"市政","област":"州","областта":"州",
  "университет":"大学","болница":"医院","болницата":"医院","училище":"学校","училището":"学校",
  "институт":"研究所","института":"研究所","център":"中心","центъра":"中心","центр":"中心",
  "дирекция":"局","дирекцията":"局","агенция":"局","агенцията":"局","служба":"服务局",
  "службата":"服务局","предприятие":"企业","предприятието":"企业","дружество":"公司",
  "дружеството":"公司","акционерно":"股份","акционерное":"股份","общество":"公司",
  "обединение":"联合体","сдружение":"协会","фондация":"基金会","фонд":"基金",
  "камара":"商会","съюз":"联盟","съюза":"联盟","парк":"公园","летище":"机场",
  "пристанище":"港","железопътна":"铁路","пътна":"道路","води":"水利","енергетика":"能源",
  "околна":"环境","среда":"环境","земеделие":"农业","гори":"林业","рибарство":"渔业",
  "отбрана":"国防","правосъдие":"司法","финанси":"财政","икономика":"经济",
  "регионално":"区域","развитие":"发展","инвестиции":"投资","строителство":"建设",
  "транспорт":"交通","съобщения":"通信","информационни":"信息","технологии":"技术",
  "технологиите":"技术","туризъм":"旅游","спорт":"体育","младежта":"青年",
  "култура2":"文化","изкуство":"艺术","театър":"剧院","музей":"博物馆","библиотека":"图书馆",
  "управител":"管理局","управление":"管理局","администрация":"管理局","комисия":"委员会",
  "комитет":"委员会","съвет":"委员会","събрание":"议会","общински2":"市政",
  "държавно":"国有","национално":"国家","национален":"国家","републикански":"共和国",
  "държавен":"国家","град":"市","село":"村","община3":"市","район":"区","окръг":"县",
  "българия":"保加利亚","украйна":"乌克兰","україни":"乌克兰","київ":"基辅","львів":"利沃夫",
  "одеса":"敖德萨","харків":"哈尔科夫","дніпро":"第聂伯","вінниця":"文尼察",
};

function translateGeneric(name) {
  // 括号里的缩写多数是冗余，先摘掉
  let s = name.replace(/\([^)]{2,20}\)/g, " ");
  s = s.replace(/\s*-\s*/g, " - ");
  const tokens = s.split(/[\s,;:()"'/\\|]+/).filter(Boolean);
  const out = [];
  let headSuffix = "";
  const firstKey = tokens[0]?.toLowerCase().replace(/[.,]/g, "");
  if (ORG_HEAD.has(firstKey)) {
    headSuffix = titleGloss(tokens[0]);
    tokens.shift();
  }
  for (const tok of tokens) {
    if (tok === "-") { out.push("－"); continue; }
    const low = tok.toLowerCase();
    if (STOP.has(low)) continue;
    if (low.length === 1) continue;
    if (/^\d+$/.test(tok)) { out.push(tok); continue; }
    if (low === "&") { out.push("与"); continue; }
    const zh = glossOf(low) || CYR_GLOSS[low] || "";
    if (zh) { out.push(zh); continue; }
    // 西里尔：先转拉丁再音译
    const base = /[\u0400-\u04ff]/.test(tok) ? cyrToLatin(tok) : tok;
    const tr = translitWord(base);
    if (tr) out.push(tr);
  }
  let text = out.join("").replace(/－+/g, "－").replace(/^－|－$/g, "");
  if (headSuffix) text += headSuffix;
  return text;
}

/** 中文纯度校验（与 src/lib/services/buyer/normalize 同口径） */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const FOREIGN = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\uf900-\ufaff]/;
const ALLOWED = /^[\u3400-\u4dbf\u4e00-\u9fff0-9（）()“”‘’「」『』《》〈〉·\-—－、，。；：,.:\s]+$/;

export function isPureChinese(s) {
  const v = String(s ?? "").normalize("NFKC").trim();
  if (!v || !HAN.test(v)) return false;
  if (FOREIGN.test(v)) return false;
  return ALLOWED.test(v);
}

const GENERIC = /^(?:(?:有限|股份|责任|集团|控股|实业|科技|贸易|工程|建设|发展|管理|服务|咨询|投资|置业|医疗|教育|文化|旅游|能源|电力|水利|交通|农业|林业|环保|采购|招标|供应)?(?:公司|集团|机构|项目|中心|办公室|管理处|管理局|委员会|部门|部|局|厅|署|学校|学院|大学|医院|银行|基金会|研究所|研究院|合作社|协会|联合会|联盟|平台|站|所))+$/;

export function isTooGeneric(s) {
  const v = String(s ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
  return v ? GENERIC.test(v) : false;
}

/**
 * 主入口：原始名 → { zh, method, reject }
 * method: manual | vietnamese | structural | translit
 */
export function toChinese(rawName) {
  const cleaned = cleanName(rawName);
  const reason = rejectReason(cleaned);
  if (reason) return { zh: "", method: "reject", reject: reason, cleaned };
  const isVN = VN_DIACRITIC.test(cleaned) || /\b(công ty|tổng công ty|ban quản|bệnh viện|trường|sở|ủy ban|chi nhánh|trung tâm)\b/i.test(cleaned);
  let zh = "";
  let method = "structural";
  if (isVN) { zh = translateVietnamese(cleaned); method = "vietnamese"; }
  else { zh = translateGeneric(cleaned); }
  // 音译兜底：结构翻译没产出汉字时整串音译
  if (!HAN.test(zh)) { zh = translitWord(cleaned) || ""; method = "translit"; }
  zh = zh.replace(/\s+/g, "").trim();
  if (zh.length < 3) {
    // 单个缩写词（PRSEC / MINJEC / FEICOM）：整串当词音译，比丢弃更有用
    const single = cleaned.replace(/[^A-Za-z\u0400-\u04ff]/g, "");
    if (single && !/[\s,;:()]/.test(cleaned) && single.length >= 3 && single.length <= 25) {
      const tr = translitWord(/[\u0400-\u04ff]/.test(single) ? cyrToLatin(single) : single);
      if (tr.length >= 3 && isPureChinese(tr)) return { zh: tr, method: "translit", reject: "", cleaned };
    }
    return { zh: "", method: "reject", reject: "tooshort_zh", cleaned };
  }
  if (!isPureChinese(zh)) {
    zh = zh.replace(FOREIGN, "").replace(/[^\u3400-\u4dbf\u4e00-\u9fff0-9（）()、，。；：·\-－]/g, "");
    if (!isPureChinese(zh) || zh.length < 3) return { zh: "", method: "reject", reject: "impure", cleaned };
  }
  if (isTooGeneric(zh)) return { zh: "", method: "reject", reject: "generic", cleaned };
  return { zh, method, reject: "", cleaned };
}
