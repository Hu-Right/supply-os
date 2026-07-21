/**
 * 静态数据统一导出入口
 * Static Data Barrel Re-export Entry
 *
 * @module data/index
 * @description 聚合全部静态数据常量（展厅 / 供应商 / 商机 / 学习资料 / FAQ），
 *              外部通过 `import { Xxx } from "@/data"` 统一引入。
 *              Central re-export hub for all static data constants.
 */

export { EXHIBITION_HALLS } from "./exhibition-halls";
export { SUPPLIERS } from "./suppliers";
export { OPPORTUNITIES } from "./opportunities";
export { LEARNING_MATERIALS, TRAINING_DOWNLOAD_MATERIALS } from "./materials";
export { FAQS } from "./faqs";
