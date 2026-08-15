/**
 * 管理运维路由
 * Admin routes — backward-compatible barrel re-export
 *
 * @module server/routes/admin.routes
 * @deprecated 已拆分至 admin/ 子目录，本文件保留 re-export 以维持向后兼容。
 *             新代码请直接从 ./admin/index 导入。
 * @see admin/index.ts
 */
export { createAdminRouter } from "./admin/index";
