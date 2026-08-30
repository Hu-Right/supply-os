/**
 * 静态数据统一导出入口
 * Static Data Barrel Re-export Entry
 *
 * @module data/index
 * @description 聚合全部静态数据常量（展厅 / 商机 / 学习资料 / FAQ），
 *              外部通过 `import { Xxx } from "@/data"` 统一引入。
 *              供应商目录已切换为 DB 真实数据（GET /api/suppliers），不再提供静态常量。
 *              Central re-export hub for all static data constants.
 */

export { EXHIBITION_HALLS } from "./exhibition-halls";
export { OPPORTUNITIES } from "./opportunities";
export { LEARNING_MATERIALS, TRAINING_DOWNLOAD_MATERIALS, TRAINING_MATERIAL_BUNDLES } from "./materials";
export { FAQS } from "./faqs";
// 注意：services 数据依赖 lucide-react 图标组件，不走本桶文件导出
// （避免所有 @/data 消费方被迫加载图标库），请直接 import "@/data/services"。
