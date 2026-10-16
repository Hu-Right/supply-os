/**
 * 搜索/翻译链路支持的语言列表 —— 全项目唯一来源
 * Supported languages — single source of truth
 *
 * @module server/utils/languages
 * @description 历史上该常量在 wide-row-builder / meilisearch(sync,client) / detail-fetch
 *              各定义一份（同值 "zh,en,fr,ru,es,ar"），任一处漂移即导致宽表列、Meili
 *              索引属性与查询回退口径不一致。收敛到此单源：新增语言只改这里 + 补译名。
 *              保持 string[]（非 as const 窄元组）以兼容 `.includes(locale)` 等按 string 的用法。
 */
export const SUPPORTED_LANGS: string[] = ["zh", "en", "fr", "ru", "es", "ar"];
