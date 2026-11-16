# db/schema —— E2E 结构基线（已跟踪）

CI 的 `e2e` job 需要一个**能建表的结构基线**。应用启动时会跑 `schemaPhase`（`ALL_MIGRATIONS`），
而迁移是「旧库 → 终态」的一次性脚本、不保证能在终态结构上重放，因此建表 DDL 只能来自本目录，
且导入基线后必须把迁移账本补成终态（见下节）。

## 约定

- 全库终态 DDL 已入库为 `baseline.sql`（`CREATE DATABASE` 可省，job 已预建 `supply_os_test`）。
- **不要手工编辑 `baseline.sql`**：它由 `node --env-file=.env scripts/tools/dump-schema-baseline.mjs`
  从现网结构导出（只读 `information_schema` + `SHOW CREATE TABLE`，不取数据）。
  结构变更后重跑该命令，diff 即为基线漂移；脚本幂等，结构未变时不改写文件。
- `e2e` job 按文件名字典序导入本目录下所有 `*.sql`；缺失任意 `.sql` 时 job **显式失败**（不静默跳过），
  以保证「E2E 在 CI 实际运行」这一承诺可验证。

## 导入基线后必须补迁移账本

基线是现网**终态**结构，`ALL_MIGRATIONS` 则是「旧库 → 终态」的一次性迁移，两者不是同一条演化路径：
基线只收 DDL、不收数据，所以建出来的库 `schema_migrations` 是空的，`schemaPhase` 会把所有迁移
当成 pending 重放。012 只对旧结构成立（引用早已改名/下线的 `buyer.org_type`），重放当场
`Unknown column 'b.org_type'` → bootstrap `exit(1)` → 端口从未监听 → CI e2e 探活闸口报
「应用在 120s 内未就绪」（2026-11-16 事故）。

因此**任何从基线建库的环境**（CI e2e、本地新库）在导入后都要补账本：

```bash
npm run db:seed-ledger        # 本地：读 .env 的 DB_*
npx tsx scripts/tools/seed-schema-ledger.ts   # CI：DB_* 来自 job env
```

脚本会先核对基线里的表都在目标库（缺表直接失败，防止在空库/错库上把账本“补”成已应用），
再把 `ALL_MIGRATIONS` 的全部版本写入 `schema_migrations`，重复执行安全。

## 只放结构，不放数据

本目录**只允许 DDL**。不得加入业务数据的 INSERT（套餐、权益目录/矩阵、商机、配额池等）：
数据的事实源是数据库本身，项目已删除全部种子路径，代码与仓库里都不再造一份平行真相。

因此 CI 的库是个**只有结构的空库**，它只能验证「基线能建出应用可查的结构 + 页面静态骨架
+ 鉴权/参数边界」（见 `tests/e2e/ci-smoke.spec.ts`）；依赖数据的认证态业务旅程跑本地/内网真库，
口径与命令见 ARCHITECTURE.md「测试目录分层」一节。

## 为什么放这里而不是 docs/数据库设计/

`docs/*` 属过程文档、默认不入库（仅 `docs/adr/`）。而结构基线是 **CI 可执行依赖**，
必须随 clone 进入仓库，故单独放于已跟踪的 `db/schema/`，与 `src/lib/db/migrations` 的「一次性收敛迁移」职责区分开。
