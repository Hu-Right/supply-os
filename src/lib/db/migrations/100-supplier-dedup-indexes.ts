/**
 * 100: supplier 防重查询补索引（在线 DDL，钉死算法与锁级别）
 * supplier-dedup-indexes
 *
 * 背景（2026-09-26 实库取证）：
 *   `supplier` 是 supply-os 与 intelligence-daily 共用的外部表，共 54 列、约 6.77 万行。
 *   企业注册/编辑的**防重入口**是等值查信用代码：
 *     SupplierDirectoryRepo.findByCreditCode → `WHERE credit_code = ? AND merged_id IS NULL`
 *   而 INFORMATION_SCHEMA.STATISTICS 实测：**该表上没有任何包含 credit_code 的索引**
 *   （已有索引只有 type/tenant/merged_id/verify_status/claim_status/business_type_code/coop_status
 *    与主键、以及 products+product_keywords 的 FULLTEXT）。等值防重只能全表扫。
 *   另：company 是"信用代码缺失时的次选防重键"（findByCompanyBest），该列同样无索引。
 *
 * 本迁移做两件事：给 credit_code 建普通索引、给 company 建 64 字符前缀索引
 * （company 是 VARCHAR(200) utf8mb4，全长索引字节数偏大且前 64 字符已足够区分公司名）。
 *
 * 安全性（遵循本项目"启动期 DDL 必须钉算法 + 短锁等待"的教训）：
 *   - 显式 `ALGORITHM=INPLACE, LOCK=NONE`：8.0 加二级索引支持，且**不允许静默降级**为 COPY；
 *     若 MySQL 判定不适用会立即报错，而不是悄悄持 SHARED_NO_WRITE 阻塞在线写入。
 *   - 专用连接上 `SET SESSION lock_wait_timeout = 5`：拿不到元数据锁 5 秒即失败，不排队等锁。
 *   - 本迁移**不用** ensureIndex 而自接专用连接：`SET SESSION lock_wait_timeout` 只对当前会话生效，
 *     而池的 `dbPool.query` 每次可能拿不同连接——跨连接设会话变量等于没设（假保险）。
 *     这里把 SET 与两条 ALTER 钉在同一连接上，幂等判定自己走 INFORMATION_SCHEMA。
 *   - 生产已由运维脚本先行建立，本迁移在 prod 上是 no-op（两个索引名已存在 → 直接跳过）。
 *   - 注意 ALGORITHM 子句前**必须有逗号**（缺逗号是语法错误，会让服务起不来）。
 *
 * 不做什么：不改列、不动 data_quality_score 生成列、不删任何列（决策与台账见
 *   docs/数据库设计/supplier-供应商目录主表.md）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 索引名已存在则跳过（按 INDEX_NAME 判存在，与 ensureIndex 同口径） */
async function indexExists(conn: { query: (sql: string, v?: unknown[]) => Promise<unknown> }, indexName: string): Promise<boolean> {
  const [rows] = (await conn.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier' AND INDEX_NAME = ?`,
    [indexName],
  )) as [RowDataPacket[], unknown];
  return Number(rows[0]?.total || 0) > 0;
}

const DDLS: Array<{ name: string; ddl: string }> = [
  { name: "idx_credit_code", ddl: "ALTER TABLE supplier ADD INDEX idx_credit_code (credit_code), ALGORITHM=INPLACE, LOCK=NONE" },
  { name: "idx_company", ddl: "ALTER TABLE supplier ADD INDEX idx_company (company(64)), ALGORITHM=INPLACE, LOCK=NONE" },
];

export const migration: Migration = {
  version: 100,
  name: "supplier-dedup-indexes",
  async up(dbPool: Pool) {
    const conn = await dbPool.getConnection();
    const created: string[] = [];
    try {
      // 拿不到元数据锁 5 秒即报错，不排队等锁（与 SET 同连接才有效）
      await conn.query("SET SESSION lock_wait_timeout = 5");
      for (const { name, ddl } of DDLS) {
        if (await indexExists(conn, name)) continue;
        await conn.query(ddl);
        created.push(name);
      }
    } finally {
      conn.release();
    }
    console.log(
      `[migration-100] supplier 防重入口索引就绪：本次新建 [${created.join(", ") || "无，均已存在"}]`
        + "（idx_credit_code 全列 / idx_company 前缀 64；不改列不删列）",
    );
  },
};
