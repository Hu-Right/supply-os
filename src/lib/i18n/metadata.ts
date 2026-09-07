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
} as const;

/** 各页面多语言 metadata 注册表 */
const PAGE_METADATA: Record<string, Record<Locale, PageMetadata>> = {
  showroom: {
    zh: { title: `海外展厅 — 全球展示中心 | ${BRAND.zh}`, description: "云境·国际采购平台海外展厅：法兰克福、迪拜、内罗毕、圣保罗、洛杉矶、胡志明市六大永久展示中心。" },
    en: { title: `Global Showrooms | ${BRAND.en}`, description: "Yunjing international procurement platform: 6 permanent overseas showrooms across Frankfurt, Dubai, Nairobi, Sao Paulo, Los Angeles, Ho Chi Minh City." },
    fr: { title: `Showrooms Globaux | ${BRAND.fr}`, description: "6 showrooms permanents à l'étranger: Francfort, Dubaï, Nairobi, São Paulo, Los Angeles, Hô Chi Minh-Ville." },
    ru: { title: `Глобальные выставочные залы | ${BRAND.ru}`, description: "6 постоянных зарубежных выставочных залов: Франкфурт, Дубай, Найроби, Сан-Паулу, Лос-Анджелес, Хошимин." },
    es: { title: `Salas de Exhibición Globales | ${BRAND.es}`, description: "6 salas de exhibición permanentes en el extranjero: Fráncfort, Dubái, Nairobi, São Paulo, Los Ángeles, Ciudad Ho Chi Minh." },
    ar: { title: `معارض عالمية | ${BRAND.ar}`, description: "6 معارض دائمة في الخارج: فرانكفورت، دبي، نيروبي، ساو باولو، لوس أنجلوس، هو تشي منه." },
  },
  procurement: {
    zh: { title: `全球采购公告搜索 | ${BRAND.zh}`, description: "云境·国际采购平台：搜索联合国机构、各国政府及国际组织的招标与采购公告。" },
    en: { title: `Global Procurement Search | ${BRAND.en}`, description: "Search bidding and procurement notices from UN agencies, governments, and international organizations." },
    fr: { title: `Recherche Achats Globaux | ${BRAND.fr}`, description: "Rechercher les avis d'appels d'offres des agences ONU, gouvernements et organisations internationales." },
    ru: { title: `Глобальный поиск закупок | ${BRAND.ru}`, description: "Поиск тендеров и закупок от агентств ООН, правительств и международных организаций." },
    es: { title: `Búsqueda de Compras Globales | ${BRAND.es}`, description: "Buscar licitaciones y anuncios de compras de agencias de la ONU, gobiernos y organizaciones internacionales." },
    ar: { title: `البحث في المشتريات العالمية | ${BRAND.ar}`, description: "البحث في إعلانات المناقصات والمشتريات من وكالات الأمم المتحدة والحكومات والمنظمات الدولية." },
  },
  supplier: {
    zh: { title: `全球供应商目录 | ${BRAND.zh}`, description: "云境·国际采购平台：查询全球认证供应商信息，按行业、地区、资质筛选。" },
    en: { title: `Global Supplier Directory | ${BRAND.en}`, description: "Find certified suppliers worldwide, filter by industry, region, and qualifications." },
    fr: { title: `Répertoire Fournisseurs Mondial | ${BRAND.fr}`, description: "Trouver des fournisseurs certifiés dans le monde, filtrer par industrie, région et qualifications." },
    ru: { title: `Глобальный каталог поставщиков | ${BRAND.ru}`, description: "Найти сертифицированных поставщиков по всему миру, фильтр по отрасли, региону и квалификации." },
    es: { title: `Directorio Global de Proveedores | ${BRAND.es}`, description: "Encontrar proveedores certificados en todo el mundo, filtrar por industria, región y calificaciones." },
    ar: { title: `الدليل العالمي للموردين | ${BRAND.ar}`, description: "البحث عن الموردين المعتمدين حول العالم، التصفية حسب الصناعة والمنطقة والمؤهلات." },
  },
  training: {
    zh: { title: `国际公共采购研修班 | ${BRAND.zh}`, description: "云境·国际采购平台：国际公共采购实战培训，联合国采购流程与投标技巧。" },
    en: { title: `Intl Public Procurement Training | ${BRAND.en}`, description: "Hands-on training in international public procurement, UN procurement processes and bidding skills." },
    fr: { title: `Formation Achats Publics Internationaux | ${BRAND.fr}`, description: "Formation pratique aux achats publics internationaux, processus d'achat ONU et techniques de soumission." },
    ru: { title: `Обучение международным закупкам | ${BRAND.ru}`, description: "Практическое обучение международным государственным закупкам, процессы закупок ООН." },
    es: { title: `Formación en Compras Públicas Intl | ${BRAND.es}`, description: "Formación práctica en compras públicas internacionales, procesos de compras de la ONU." },
    ar: { title: `تدريب المشتريات العامة الدولية | ${BRAND.ar}`, description: "تدريب عملي على المشتريات العامة الدولية، عمليات مشتريات الأمم المتحدة." },
  },
  services: {
    zh: { title: `服务生态 — 投标/物流/认证 | ${BRAND.zh}`, description: "云境·国际采购平台：投标辅助、国际物流、产品认证等供应链服务一站式对接。" },
    en: { title: `Ecosystem Services | ${BRAND.en}`, description: "Bidding assistance, international logistics, product certification and supply chain services." },
    fr: { title: `Services Écosystème | ${BRAND.fr}`, description: "Assistance aux soumissions, logistique internationale, certification de produits et services de chaîne d'approvisionnement." },
    ru: { title: `Экосистема услуг | ${BRAND.ru}`, description: "Помощь в тендерах, международная логистика, сертификация продукции." },
    es: { title: `Servicios del Ecosistema | ${BRAND.es}`, description: "Asistencia en licitaciones, logística internacional, certificación de productos." },
    ar: { title: `خدمات النظام البيئي | ${BRAND.ar}`, description: "المساعدة في العطاءات، الخدمات اللوجستية الدولية، شهادة المنتج." },
  },
  learning: {
    zh: { title: `学习资源中心 — 采购知识库 | ${BRAND.zh}`, description: "云境·国际采购平台：国际采购指南、投标技巧、行业报告等专业知识库。" },
    en: { title: `Learning Resource Center | ${BRAND.en}`, description: "International procurement guides, bidding skills, industry reports and professional knowledge base." },
    fr: { title: `Centre de Ressources | ${BRAND.fr}`, description: "Guides d'achat internationaux, techniques de soumission, rapports sectoriels." },
    ru: { title: `Учебный центр | ${BRAND.ru}`, description: "Руководства по международным закупкам, навыки тендеров, отраслевые отчёты." },
    es: { title: `Centro de Recursos | ${BRAND.es}`, description: "Guías de compras internacionales, habilidades de licitación, informes de la industria." },
    ar: { title: `مركز الموارد التعليمية | ${BRAND.ar}`, description: "أدلة المشتريات الدولية، مهارات العطاءات، تقارير الصناعة." },
  },
  membership: {
    zh: { title: `会员套餐 — 解锁高级功能 | ${BRAND.zh}`, description: "云境·国际采购平台：解锁更多采购公告、供应商数据、CRM 功能。" },
    en: { title: `Membership Plans | ${BRAND.en}`, description: "Unlock more procurement notices, supplier data, and CRM features." },
    fr: { title: `Plans d'Adhésion | ${BRAND.fr}`, description: "Débloquez plus d'avis de achats, données fournisseurs et fonctionnalités CRM." },
    ru: { title: `Планы членства | ${BRAND.ru}`, description: "Разблокируйте уведомления о закупках, данные поставщиков и функции CRM." },
    es: { title: `Planes de Membresía | ${BRAND.es}`, description: "Desbloquear más avisos de compras, datos de proveedores y funciones CRM." },
    ar: { title: `خطط العضوية | ${BRAND.ar}`, description: "فتح المزيد من إعلانات المشتريات وبيانات الموردين وميزات CRM." },
  },
  qualification: {
    zh: { title: `供应商资质认证 — 入驻申请 | ${BRAND.zh}`, description: "云境·国际采购平台：申请成为认证供应商，获取全球政府采购投标资格。" },
    en: { title: `Supplier Qualification | ${BRAND.en}`, description: "Apply to become a certified supplier and gain access to global government procurement bidding." },
    fr: { title: `Qualification Fournisseur | ${BRAND.fr}`, description: "Postuler pour devenir un fournisseur certifié et accéder aux appels d'offres publics mondiaux." },
    ru: { title: `Квалификация поставщика | ${BRAND.ru}`, description: "Подать заявку на сертифицированного поставщика для участия в глобальных государственных тендерах." },
    es: { title: `Calificación de Proveedor | ${BRAND.es}`, description: "Solicitar ser proveedor certificado y acceder a licitaciones gubernamentales globales." },
    ar: { title: `تأهيل المورد | ${BRAND.ar}`, description: "التقدم لتصبح مورداً معتمداً والوصول إلى مناقصات الحكومة العالمية." },
  },
  crm: {
    zh: { title: `CRM 客户管理 — 商机跟踪 | ${BRAND.zh}`, description: "云境·国际采购平台 CRM：管理客户关系、跟踪采购商机、记录投标进展。" },
    en: { title: `CRM Client Management | ${BRAND.en}`, description: "Manage customer relationships, track procurement opportunities, and record bidding progress." },
    fr: { title: `Gestion CRM | ${BRAND.fr}`, description: "Gérer les relations clients, suivre les opportunités d'achat et enregistrer les progrès des soumissions." },
    ru: { title: `CRM Управление клиентами | ${BRAND.ru}`, description: "Управление отношениями с клиентами, отслеживание возможностей закупок." },
    es: { title: `Gestión CRM | ${BRAND.es}`, description: "Gestionar relaciones con clientes, rastrear oportunidades de compras." },
    ar: { title: `إدارة CRM | ${BRAND.ar}`, description: "إدارة علاقات العملاء، تتبع فرص المشتريات." },
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
