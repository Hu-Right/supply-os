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

## 基线不只是给 E2E 用的：种子脚本也被它卡着

`scripts/gates/seed-test-db.ts` 里每一张表、每一个列名都必须能在本目录的 DDL 里找到，
由 `scripts/gates/check-seed-schema-compat.mjs`（已入 `npm run lint`）静态核对：

- S1 引用的表必须存在；S2 INSERT 列清单里的列必须属于目标表；S3 值的个数必须等于列的个数。

为什么要有它：种子脚本曾长期按旧库模型写 `crm_membership_plans`（已被原生权益模型取代）与
`crm_users(user_key, role, is_vip, unlock_quota…)`（影子表重排时已删），而迁移清单为空、
没有任何静态检查会报——只有 e2e job 真跑到「写入种子数据」才炸。

种子只写**合成值**（套餐价格/额度均为占位数字），不把现网报价配置复制进仓库；
商机/账号靶点用 900001 等高位固定 id，由 `.github/workflows/ci.yml` 的 `E2E_OPP_ID` /
`E2E_OPP_CODE_ID` / `E2E_VIP_USER` / `E2E_FREE_USER` 指认给用例。

## 为什么放这里而不是 docs/数据库设计/

`docs/*` 属过程文档、默认不入库（仅 `docs/adr/`）。而结构基线是 **CI 可执行依赖**，
必须随 clone 进入仓库，故单独放于已跟踪的 `db/schema/`，与 `src/lib/db/migrations` 的「一次性收敛迁移」职责区分开。
