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

/** 各页面多语言 metadata 注册表 */
const PAGE_METADATA: Record<string, Record<Locale, PageMetadata>> = {
  showroom: {
    zh: { title: "全球智能展厅 | Supply OS", description: "浏览全球优质供应链资源与展会信息" },
    en: { title: "Global Showrooms | Supply OS", description: "Browse global supply chain resources and exhibition information" },
    fr: { title: "Showrooms Globaux | Supply OS", description: "Parcourir les ressources de la chaîne d'approvisionnement mondiale" },
    ru: { title: "Глобальные выставочные залы | Supply OS", description: "Просмотр мировых ресурсов цепочки поставок" },
    es: { title: "Salas de Exhibición Globales | Supply OS", description: "Explorar recursos de cadena de suministro global" },
    ar: { title: "معارض عالمية | Supply OS", description: "تصفح موارد سلسلة التوريد العالمية" },
  },
  procurement: {
    zh: { title: "采购搜索 | Supply OS", description: "搜索全球招标采购信息" },
    en: { title: "Procurement Search | Supply OS", description: "Search global bidding and procurement information" },
    fr: { title: "Recherche Achats | Supply OS", description: "Rechercher des informations sur les appels d'offres mondiaux" },
    ru: { title: "Поиск закупок | Supply OS", description: "Поиск информации о глобальных тендерах" },
    es: { title: "Búsqueda de Compras | Supply OS", description: "Buscar información de licitaciones globales" },
    ar: { title: "بحث المشتريات | Supply OS", description: "البحث في معلومات المناقصات العالمية" },
  },
  supplier: {
    zh: { title: "供应商目录 | Supply OS", description: "查找全球认证供应商" },
    en: { title: "Supplier Directory | Supply OS", description: "Find certified suppliers worldwide" },
    fr: { title: "Répertoire Fournisseurs | Supply OS", description: "Trouver des fournisseurs certifiés dans le monde" },
    ru: { title: "Каталог поставщиков | Supply OS", description: "Найти сертифицированных поставщиков по всему миру" },
    es: { title: "Directorio de Proveedores | Supply OS", description: "Encontrar proveedores certificados en todo el mundo" },
    ar: { title: "دليل الموردين | Supply OS", description: "البحث عن الموردين المعتمدين حول العالم" },
  },
  training: {
    zh: { title: "研修班 | Supply OS", description: "供应链研修培训课程报名" },
    en: { title: "Training Camp | Supply OS", description: "Supply chain training course registration" },
    fr: { title: "Camp de Formation | Supply OS", description: "Inscription aux cours de formation sur la chaîne d'approvisionnement" },
    ru: { title: "Учебный лагерь | Supply OS", description: "Регистрация на курсы по цепочке поставок" },
    es: { title: "Campo de Entrenamiento | Supply OS", description: "Registro de cursos de formación en cadena de suministro" },
    ar: { title: "معسكر التدريب | Supply OS", description: "التسجيل في دورات تدريب سلسلة التوريد" },
  },
  services: {
    zh: { title: "服务生态 | Supply OS", description: "了解供应链相关服务" },
    en: { title: "Ecosystem Services | Supply OS", description: "Explore supply chain related services" },
    fr: { title: "Services Écosystème | Supply OS", description: "Découvrir les services liés à la chaîne d'approvisionnement" },
    ru: { title: "Экосистема услуг | Supply OS", description: "Услуги, связанные с цепочкой поставок" },
    es: { title: "Servicios del Ecosistema | Supply OS", description: "Explorar servicios relacionados con la cadena de suministro" },
    ar: { title: "خدمات النظام البيئي | Supply OS", description: "استكشاف الخدمات المتعلقة بسلسلة التوريد" },
  },
  learning: {
    zh: { title: "学习资源 | Supply OS", description: "供应链学习资料与教程" },
    en: { title: "Learning Resources | Supply OS", description: "Supply chain learning materials and tutorials" },
    fr: { title: "Ressources d'Apprentissage | Supply OS", description: "Matériel et tutoriels d'apprentissage sur la chaîne d'approvisionnement" },
    ru: { title: "Учебные ресурсы | Supply OS", description: "Учебные материалы по цепочке поставок" },
    es: { title: "Recursos de Aprendizaje | Supply OS", description: "Materiales y tutoriales de aprendizaje en cadena de suministro" },
    ar: { title: "موارد التعلم | Supply OS", description: "مواد ودروس تعليمية لسلسلة التوريد" },
  },
  membership: {
    zh: { title: "会员计划 | Supply OS", description: "升级会员获取高级功能" },
    en: { title: "Membership Plans | Supply OS", description: "Upgrade membership for premium features" },
    fr: { title: "Plans d'Adhésion | Supply OS", description: "Mettre à niveau l'adhésion pour des fonctionnalités premium" },
    ru: { title: "Планы членства | Supply OS", description: "Повысить членство для премиум-функций" },
    es: { title: "Planes de Membresía | Supply OS", description: "Actualizar membresía para funciones premium" },
    ar: { title: "خطط العضوية | Supply OS", description: "ترقية العضوية للحصول على ميزات مميزة" },
  },
  qualification: {
    zh: { title: "供应商资质申请 | Supply OS", description: "申请成为认证供应商" },
    en: { title: "Supplier Qualification | Supply OS", description: "Apply to become a certified supplier" },
    fr: { title: "Qualification Fournisseur | Supply OS", description: "Postuler pour devenir un fournisseur certifié" },
    ru: { title: "Квалификация поставщика | Supply OS", description: "Подать заявку на сертифицированного поставщика" },
    es: { title: "Calificación de Proveedor | Supply OS", description: "Solicitar ser un proveedor certificado" },
    ar: { title: "تأهيل المورد | Supply OS", description: "التقدم لتصبح مورداً معتمداً" },
  },
  crm: {
    zh: { title: "CRM 客户管理 | Supply OS", description: "管理您的客户关系与销售线索" },
    en: { title: "CRM Client Management | Supply OS", description: "Manage your customer relationships and sales leads" },
    fr: { title: "Gestion CRM | Supply OS", description: "Gérer vos relations clients et pistes de vente" },
    ru: { title: "CRM Управление клиентами | Supply OS", description: "Управление взаимоотношениями с клиентами" },
    es: { title: "Gestión CRM | Supply OS", description: "Gestionar relaciones con clientes y leads de ventas" },
    ar: { title: "إدارة CRM | Supply OS", description: "إدارة علاقات العملاء وعملاء المبيعات" },
  },
};

/**
 * 获取指定页面的多语言 metadata
 * @param pageKey - 页面标识（与 PAGE_METADATA 的 key 对应）
 * @param locale - 当前语言
 */
export function getPageMetadata(pageKey: string, locale: Locale): PageMetadata {
  return PAGE_METADATA[pageKey]?.[locale] ?? PAGE_METADATA[pageKey]?.en ?? { title: "Supply OS", description: "" };
}
