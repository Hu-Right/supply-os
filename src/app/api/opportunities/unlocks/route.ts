/**
 * 兼容别名（2026-11-18 更名）：本路由已更名为 /api/opportunities/access-ids
 *
 * @deprecated 旧客户端/已打开页面可能仍调用本路径；保留一个释放周期，
 *             下个版本删除。新代码请直接用 `/api/opportunities/access-ids`。
 * @module src/app/api/opportunities/unlocks
 */
export { GET } from "../access-ids/route";
