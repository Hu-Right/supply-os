/**
 * 页面标题常量（浏览器标签页 / 分享卡片）
 *
 * @module lib/i18n/metadata
 * @description 只保留全站标题与模板这两个常量。
 *
 *              历史上的 `PAGE_METADATA`（7 语言 × 7 页面 title/description 注册表）
 *              与 `getPageMetadata()` 从未被任何页面调用 —— 服务端没有任何地方按 locale
 *              取 metadata，页面 meta 一直是中文常量。保留它只会让人误以为
 *              「多语言 metadata 已接入」，2026-11-18 一并删除；真正要做多语言 meta，
 *              必须先把语言放进 URL（参考 app/(en) 的做法）再按 locale 生成。
 */

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
