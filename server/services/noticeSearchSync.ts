/**
 * 搜索宽表同步服务 — Barrel Re-export（向后兼容层）
 * Notice Search Wide Table Sync — Barrel Re-export
 *
 * @module server/services/noticeSearchSync
 * @description 数据加载/行构建/调度逻辑已拆分至 server/services/search-sync/ 目录。
 *              本文件仅保留 re-export 以维持向后兼容，消费方无需修改导入路径。
 *
 * 拆分后的文件结构：
 *   services/search-sync/
 *   ├── wide-row-builder.ts  ← 数据加载 + 行构建 + deadline 对账 + 批量写入
 *   ├── sync-scheduler.ts    ← 全量回填 / 增量同步 / 按ID同步 / 定时器
 *   └── index.ts             ← 统一导出
 */
export {
  fullBackfill, incrementalWideSync, syncWideIds,
  isWideTableReady, startWideTableSync,
} from "./search-sync";
