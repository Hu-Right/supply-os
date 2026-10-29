/**
 * 页面 Metadata 多语言工具
 *
 * @module lib/i18n/metadata
 * @description 为 generateMetadata 提供 locale 感知的 title/description。
 *              解决所有页面硬编码中文的问题，使浏览器标签页、分享卡片
 *              对英语/法语/阿语用户显示对应语言。
 */
import type { Locale } from "@/core/i18n/types";

export interface PageMetadata {
  title: string;
  description: string;
}

const BRAND = {
  zh: "云境·国际采购平台",
  en: "Yunjing",
  fr: "Yunjing",
  ru: "Yunjing",
  es: "Yunjing",
  ar: "يونجينغ",
  pt: "Yunjing",
} as const;

/** 统一浏览器标签页标题三段式（全站默认标题：段内未声明页面名的页用它） */
export const BROWSER_TITLE = {
  zh: "云境·国际采购平台 | 云境OS | OS",
  en: "Yunjing International Procurement Platform | Yunjing OS | OS",
  fr: "Plateforme d'Achats Internationaux Yunjing | Yunjing OS | OS",
  ru: "Международная платформа закупок Юньцзин | Yunjing OS | OS",
  es: "Plataforma de Compras Internacionales Yunjing | Yunjing OS | OS",
  ar: "منصة المشتريات الدولية يونجينغ | Yunjing OS | OS",
  pt: "Plataforma Internacional de Compras Yunjing | Yunjing OS | OS",
} as const;

/** 网站名 —— 审核口径：浏览器标签页标题首位必须是网站名，任何页面不得省略 */
export const SITE_NAME = BRAND.zh;

/**
 * 标签页标题模板（配在根 layout 的 title.template）。
 * 子页面 metadata 只写页面名，Next 自动拼成「网站名 | 页面名」，
 * 因此新增页面无需重复拼网站名，也不会出现网站名落在末尾的标题。
 */
export const BROWSER_TITLE_TEMPLATE = `${SITE_NAME} | %s`;

/**
 * 各页面多语言 metadata 注册表
 * 注：下面各语言的 title 都是「完整标签页标题」（已以网站名开头），
 *     若用作页面 metadata.title，会被根 layout 的 template 再拼一次网站名；
 *     页面级标题只写页面名，需要完全接管时才用 { absolute: ... }。
 */
const PAGE_METADATA: Record<string, Record<Locale, PageMetadata>> = {
  procurement: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：搜索联合国机构、各国政府及国际组织的招标与采购公告。" },
    en: { title: BROWSER_TITLE.en, description: "Search bidding and procurement notices from UN agencies, governments, and international organizations." },
    fr: { title: BROWSER_TITLE.fr, description: "Rechercher les avis d'appels d'offres des agences ONU, gouvernements et organisations internationales." },
    ru: { title: BROWSER_TITLE.ru, description: "Поиск тендеров и закупок от агентств ООН, правительств и международных организаций." },
    es: { title: BROWSER_TITLE.es, description: "Buscar licitaciones y anuncios de compras de agencias de la ONU, gobiernos y organizaciones internacionales." },
    ar: { title: BROWSER_TITLE.ar, description: "البحث في إعلانات المناقصات والمشتريات من وكالات الأمم المتحدة والحكومات والمنظمات الدولية." },
    pt: { title: BROWSER_TITLE.pt, description: "Pesquisar licitações e anúncios de compras de agências da ONU, governos e organizações internacionais." },
  },
  supplier: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：查询全球认证供应商信息，按行业、地区、资质筛选。" },
    en: { title: BROWSER_TITLE.en, description: "Find certified suppliers worldwide, filter by industry, region, and qualifications." },
    fr: { title: BROWSER_TITLE.fr, description: "Trouver des fournisseurs certifiés dans le monde, filtrer par industrie, région et qualifications." },
    ru: { title: BROWSER_TITLE.ru, description: "Найти сертифицированных поставщиков по всему миру, фильтр по отрасли, региону и квалификации." },
    es: { title: BROWSER_TITLE.es, description: "Encontrar proveedores certificados en todo el mundo, filtrar por industria, región y calificaciones." },
    ar: { title: BROWSER_TITLE.ar, description: "البحث عن الموردين المعتمدين حول العالم، التصفية حسب الصناعة والمنطقة والمؤهلات." },
    pt: { title: BROWSER_TITLE.pt, description: "Encontre fornecedores certificados no mundo todo, filtre por setor, região e qualificações." },
  },
  training: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：国际公共采购实战培训，联合国采购流程与投标技巧。" },
    en: { title: BROWSER_TITLE.en, description: "Hands-on training in international public procurement, UN procurement processes and bidding skills." },
    fr: { title: BROWSER_TITLE.fr, description: "Formation pratique aux achats publics internationaux, processus d'achat ONU et techniques de soumission." },
    ru: { title: BROWSER_TITLE.ru, description: "Практическое обучение международным государственным закупкам, процессы закупок ООН." },
    es: { title: BROWSER_TITLE.es, description: "Formación práctica en compras públicas internacionales, procesos de compras de la ONU." },
    ar: { title: BROWSER_TITLE.ar, description: "تدريب عملي على المشتريات العامة الدولية، عمليات مشتريات الأمم المتحدة." },
    pt: { title: BROWSER_TITLE.pt, description: "Treinamento prático em compras públicas internacionais, processos de compras da ONU e habilidades de licitação." },
  },
  services: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：投标辅助、国际物流、产品认证等供应链服务一站式对接。" },
    en: { title: BROWSER_TITLE.en, description: "Bidding assistance, international logistics, product certification and supply chain services." },
    fr: { title: BROWSER_TITLE.fr, description: "Assistance aux soumissions, logistique internationale, certification de produits et services de chaîne d'approvisionnement." },
    ru: { title: BROWSER_TITLE.ru, description: "Помощь в тендерах, международная логистика, сертификация продукции." },
    es: { title: BROWSER_TITLE.es, description: "Asistencia en licitaciones, logística internacional, certificación de productos." },
    ar: { title: BROWSER_TITLE.ar, description: "المساعدة في العطاءات، الخدمات اللوجستية الدولية، شهادة المنتج." },
    pt: { title: BROWSER_TITLE.pt, description: "Apoio a licitações, logística internacional, certificação de produtos e serviços de cadeia de suprimentos." },
  },
  learning: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：国际采购指南、投标技巧、行业报告等专业知识库。" },
    en: { title: BROWSER_TITLE.en, description: "International procurement guides, bidding skills, industry reports and professional knowledge base." },
    fr: { title: BROWSER_TITLE.fr, description: "Guides d'achat internationaux, techniques de soumission, rapports sectoriels." },
    ru: { title: BROWSER_TITLE.ru, description: "Руководства по международным закупкам, навыки тендеров, отраслевые отчёты." },
    es: { title: BROWSER_TITLE.es, description: "Guías de compras internacionales, habilidades de licitación, informes de la industria." },
    ar: { title: BROWSER_TITLE.ar, description: "أدلة المشتريات الدولية، مهارات العطاءات، تقارير الصناعة." },
    pt: { title: BROWSER_TITLE.pt, description: "Guias de compras internacionais, habilidades de licitação, relatórios setoriais e base de conhecimento profissional." },
  },
  membership: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：解锁更多采购公告、供应商数据、CRM 功能。" },
    en: { title: BROWSER_TITLE.en, description: "Unlock more procurement notices, supplier data, and CRM features." },
    fr: { title: BROWSER_TITLE.fr, description: "Débloquez plus d'avis de achats, données fournisseurs et fonctionnalités CRM." },
    ru: { title: BROWSER_TITLE.ru, description: "Разблокируйте уведомления о закупках, данные поставщиков и функции CRM." },
    es: { title: BROWSER_TITLE.es, description: "Desbloquear más avisos de compras, datos de proveedores y funciones CRM." },
    ar: { title: BROWSER_TITLE.ar, description: "فتح المزيد من إعلانات المشتريات وبيانات الموردين وميزات CRM." },
    pt: { title: BROWSER_TITLE.pt, description: "Desbloqueie mais anúncios de compras, dados de fornecedores e recursos de CRM." },
  },
  qualification: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台：申请成为认证供应商，获取全球政府采购投标资格。" },
    en: { title: BROWSER_TITLE.en, description: "Apply to become a certified supplier and gain access to global government procurement bidding." },
    fr: { title: BROWSER_TITLE.fr, description: "Postuler pour devenir un fournisseur certifié et accéder aux appels d'offres publics mondiaux." },
    ru: { title: BROWSER_TITLE.ru, description: "Подать заявку на сертифицированного поставщика для участия в глобальных государственных тендерах." },
    es: { title: BROWSER_TITLE.es, description: "Solicitar ser proveedor certificado y acceder a licitaciones gubernamentales globales." },
    ar: { title: BROWSER_TITLE.ar, description: "التقدم لتصبح مورداً معتمداً والوصول إلى مناقصات الحكومة العالمية." },
    pt: { title: BROWSER_TITLE.pt, description: "Candidate-se a fornecedor certificado e acesse licitações de governos do mundo todo." },
  },
  crm: {
    zh: { title: BROWSER_TITLE.zh, description: "云境·国际采购平台 CRM：管理客户关系、跟踪采购商机、记录投标进展。" },
    en: { title: BROWSER_TITLE.en, description: "Manage customer relationships, track procurement opportunities, and record bidding progress." },
    fr: { title: BROWSER_TITLE.fr, description: "Gérer les relations clients, suivre les opportunités d'achat et enregistrer les progrès des soumissions." },
    ru: { title: BROWSER_TITLE.ru, description: "Управление отношениями с клиентами, отслеживание возможностей закупок." },
    es: { title: BROWSER_TITLE.es, description: "Gestionar relaciones con clientes, rastrear oportunidades de compras." },
    ar: { title: BROWSER_TITLE.ar, description: "إدارة علاقات العملاء، تتبع فرص المشتريات." },
    pt: { title: BROWSER_TITLE.pt, description: "Gerencie relacionamentos com clientes, acompanhe oportunidades de compras e registre o progresso das licitações." },
  },
};

/**
 * 获取指定页面的多语言 metadata
 * @param pageKey - 页面标识（与 PAGE_METADATA 的 key 对应）
 * @param locale - 当前语言
 */
export function getPageMetadata(pageKey: string, locale: Locale): PageMetadata {
  return PAGE_METADATA[pageKey]?.[locale] ?? PAGE_METADATA[pageKey]?.en ?? { title: BRAND.zh, description: "" };
}
