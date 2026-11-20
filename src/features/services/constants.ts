/**
 * 服务市场模块常量 — 静态数据本地入口
 * Services Constants — Local entry for static data
 *
 * @module features/services/constants
 * @description 生态类目/伙伴类型已随 /ecosystem 独立模块迁 features/ecosystem 与
 *              data/ecosystem，本文件只保留自营服务市场数据。
 */
export {
  SERVICES, SUCCESS_STORIES,
} from "@/data/services";
export type {
  ServiceItem, SuccessStoryItem, ServicePhase,
} from "@/data/services";
