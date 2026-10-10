# db/schema —— E2E 结构基线（已跟踪）

CI 的 `e2e` job 需要一个**能建表的结构基线**才能跑后端关键旅程。
应用侧 `scripts/gates/seed-test-db.ts` 只写种子数据、**不建表**（迁移清单为空，见其头注释），
因此建表 DDL 必须来自本目录。

## 约定

- 全库终态 DDL 已入库为 `baseline.sql`（`CREATE DATABASE` 可省，job 已预建 `supply_os_test`）。
- **不要手工编辑 `baseline.sql`**：它由 `node --env-file=.env scripts/tools/dump-schema-baseline.mjs`
  从现网结构导出（只读 `information_schema` + `SHOW CREATE TABLE`，不取数据）。
  结构变更后重跑该命令，diff 即为基线漂移；脚本幂等，结构未变时不改写文件。
- `e2e` job 按文件名字典序导入本目录下所有 `*.sql`；缺失任意 `.sql` 时 job **显式失败**（不静默跳过），
  以保证「E2E 在 CI 实际运行」这一承诺可验证。

## 为什么放这里而不是 docs/数据库设计/

`docs/*` 属过程文档、默认不入库（仅 `docs/adr/`）。而结构基线是 **CI 可执行依赖**，
必须随 clone 进入仓库，故单独放于已跟踪的 `db/schema/`，与 `src/lib/db/migrations` 的「一次性收敛迁移」职责区分开。
