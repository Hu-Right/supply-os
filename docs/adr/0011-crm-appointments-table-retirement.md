# 11. 死表 crm_appointments 退役：预约/线索的库内唯一事实源收敛为 ungm_1v1_appointments

日期: 2026-10-12
状态: 已接受；**本机库（`127.0.0.1:3307/crm`）已实测落刀完毕**，**现网那一刀待执行**（见「生效与失效条件」）

## 结论

`crm_appointments`（11 列、0 行、只有主键、无外键无二级索引）**从库中删除**。至此库里"预约"只剩一张表：
`ungm_1v1_appointments`（表注释「预约专业服务顾问」，唯一读写方 `src/lib/repos/leads.repo.ts` 的 4 条 SQL）。

落刀沿用 ADR-0006/0008/0009 的三段式：**RENAME 进观察期 → 导出可回建 DDL → 校验 → DROP 收官**，
脚本 `scripts/ops/appointments-retire.ts`（ops 目录默认 gitignore，不入仓，见 `.gitignore` 与 `check-gitignore-consistency`）。

## 判据：这张表没有任何读者（2026-10-12 实测，体检脚本 dry 全过）

| 检查 | 结果 |
| --- | --- |
| A1 在位性 | 正名在位、退役名不在 ⇒ 不是半途残留 |
| A2 行数 | **0**（一旦非 0 即阻断：空表结论不成立 ⇒ 库外有写入方，先查清是谁在写） |
| A3 外键 | 0 个约束引用它 |
| A4 库内隐形读者 | 视图 / 触发器 / 存储过程：粗筛 0 个对象 |
| A5 代码引用 | `src/**` + `scripts/tools/**` + `tests/**` + `db/schema/**`：**零 SQL 引用** |
| A6 列形状 | 11 列与 `baseline.sql` 逐字一致 ⇒ 结构没漂过，"死表"结论的证据基础成立 |

- 已有定性：《全表写入核对-20260930》把它列为**死表**（"本仓库无任何写入/读取，功能实际走 ungm_1v1_appointments"），并收入问题 ⑥「死表/遗留共 8 张 ⇒ 择期 DROP，降低排查噪音」。
- 语义替代关系明确：本表是**「平台用户 × 后台员工」的派单预约模型**（`user_id` / `employee_id` / `appointment_time` / `topic` / `status='pending'` / `remark`），活表是**「访客自助留资」模型**（`company_name` / `contact_person` / `contact_method` / `email` / `industry` / `consultation_needs` / `follow_up_logs` JSON / `raw_payload` / `ip`，外加 `appointment_key` 唯一键与两条二级索引）。活表携带本表没有的全部业务维度，而本表没有任何一项信息是活表给不出的。
- 判据类型与 ADR-0008 同族（**零运行时读者**），与 ADR-0009 不同（那张表有 3 处读者、能删是因为读者可零成本改走树）。
- 落刀后的复验（2026-10-12 实测，`temp/probe130-baseline-vs-db.ts`，只读）：本机库 96 张基表（其中 1 张 `crm_commodity_backbone__old_20261012` 属 dump 内置排除的影子/备份表）⇒ 应进基线 **95** 张，与 `baseline.sql` 的 **95** 张**双向差集为空**；`crm_appointments` 与退役名在库、在基线均为 false。

## 它真正的成本是误导，不是存储

`src/lib/services/leads.ts` 文件头 L6 写着"线索全量持久化至 MySQL（`ungm_1v1_appointments`）"，
而 L21 的 `LeadRow` 注释写着"`crm_appointments` 关键列"——**同一个文件自相矛盾，且 L21 是失实的那一条**：
`appointment_key` / `company_name` / `follow_up_logs` 在 `crm_appointments` 里一列都没有。
该注释由 `3caef52b`（类型治理 阶段6c-2）引入。后果不是运行故障，是排查陷阱：后来人搜 `appointment`
会先撞上一张死表和一条指错方向的注释，而那张表的列名看着比活表更像"正式设计"。本 ADR 顺带把它改对。

## 代价与能力边界（明确不解决的）

- **库外读者无法静态排除**。老后台/客服端在本仓库视野之外——同一份核对报告里 `cmd_accounts`、`sys_audit_logs`、
  `sys_menu`、`chat_agent_presence` 都明确是外部系统在写，而本表的列模型（`employee_id` + `user_id` + `appointment_time`）
  恰好就是那一套。"0 行"有两种解释：真没人用 / 有人在用但还没产生数据。静态分析分不开这两种，
  **这是选 RENAME 先行、而不是直接 DROP 的唯一理由**。
- **观察期不要重导基线**。`dump-schema-baseline.mjs` 的内置排除规则只认 `__bak_` / `_bakN` / `_(bak|backup|old|copy)_?\d*$`，
  **不认 `_retired_`**：库里留着 `crm_appointments_retired_20261012` 时重跑 dump，基线会从 95 张变 96 张且多出一张退役表。
  这期间要重导必须带 `EXCLUDE=_retired_`。
- **`baseline.sql` 有一处有意的手工偏离**。`db/schema/README.md` 明写"不要手工编辑"，本次先行摘除了本表 DDL
  并把文件头改为「导出 95 张，排除 1 张」，同时加了【手工偏离】注记。换来的是一条强验证：库侧落刀后重跑 dump，
  **diff 应为空**；若 dump 把这张表加回来，就是"那一刀没落"的机器证明。
  ⚠️ **该偏离当前只对本机成立**：`.env` 指的是 `127.0.0.1:3307`，基线的正式口径是**现网结构**。
  现网落刀前，仓库里的 95 张基线比现网少一张表；现网跑完 DDL 再重导基线，偏离才真正关闭。偏离是暂时的，落刀即归一。
- **回灌 ≠ 回到可用状态**。DROP 前导出的 DDL 保持**退役名**建表；回建后 A1 会立刻报"正名与退役名同时在库"。
  回建是回滚演练，演练完要重新收官。
- **没有门禁守护**（区别于 ADR-0008/0009 的 CG6/CG7）。本表零读者、零下游派生数据，没有需要机器钉住的不变量，
  专用闸的维护成本高于收益。代价是：日后若有人重新建出它并写代码读，只能靠 review 拦，CI 不会红。

## 被否决的替代方案

- **只改注释、表留着**：留着那张表就是留着"为什么有两张 appointments 表"这个问题；0 行的存储成本不等于零成本。
- **直接 DROP 不留观察期**：省掉一周等待，但库外读者排除不掉，而 DROP 不可逆。
- **把它接回业务**（拿它做员工派单预约）：本 ADR 是退役记录，不是功能规划。真要做 1v1 员工排期应当带需求重新设计
  （`employee_id` 该不该是外键、时区、冲突约束、索引一个都没有），而不是复用一张从没被接上的骨架。
- **顺手把活表 `ungm_1v1_appointments` 改个正经名字**：活表有真实读者与数据，改名要动 `leads.repo.ts` 4 条 SQL +
  核对报告 + CI 旅程，与本次收益无关。表名前缀不统一是历史事实，不属于"死表清理"这一刀。

## 生效与失效条件

**生效（本机 2026-10-12 已实测；现网待验）**：库里 `crm_appointments` 与 `crm_appointments_retired_*` 都不在场 ✅；
体检脚本复跑打印「都不在库里：已退役完毕」并 exit 0 ✅；`baseline.sql` 95 张且与库内应进基线的 95 张逐表一致（双向差集为空）✅；
`npm run typecheck` / `npm run lint`（encoding、gitignore、no-admin、wide-ssot、sql-shapes、eslint）全过 ✅；
`tests/unit/lib/services/leads.test.ts` 6/6 过 ✅。**现网需重复同样的四项**：`--apply --yes` → `--drop --yes` → 重导基线（diff 应为空）→ 跑体检脚本确认 exit 0。
尚**未**跑真库 E2E 旅程（`/api/leads` 与 `/api/leads/log` 的 200 属线索链路，不经过本表，逻辑上无感，但不拿推断当实测）。

**失效**：任何人重新建出正名或其 `_retired_*` 变体并被 `src/**` 读走。体检脚本的 A1/A5 能查出来，
但它们是 ops 一次性脚本、不进 CI，所以这条不设机器防线（见「代价」末条）。

## 影响面清单

| 位置 | 改动 |
| --- | --- |
| `src/lib/services/leads.ts` | L21 失实注释 `crm_appointments` → `ungm_1v1_appointments`（与同文件 L6 对齐）；**无任何逻辑改动** |
| `db/schema/baseline.sql` | 手工先行摘除本表 DDL（96 → 95 张），文件头计数与【手工偏离】注记同步；库侧落刀后重导归一 |
| `scripts/ops/appointments-retire.ts` | 新增（不入库）：A1~A7 体检 / `--apply --yes` RENAME / `--rollback --yes` 改回正名 / `--drop --yes` 导出 DDL 到 `runtime/` 后收官 |
| `docs/adr/0011-*.md` | 本文件：退役决策、判据、三段式路径 |
| `runtime/appointments-retire-ddl-2026-10-12T*.sql` | DROP 前导出的**可回建 DDL**（保持退役名建表；本机已生成） |
| 库里 | 本机 `127.0.0.1:3307/crm`：已 `RENAME` → 已 `DROP`（2026-10-12 实测）；**现网：待执行同一脚本** |

`docs/数据库设计/全表写入核对-20260930.md` 的时点记录**不改写**（沿用 ADR-0008/0009 口径：它记录当时的判断，不是当前口径）；
`runtime/audit-schema.json` 是生成物，重跑核对脚本自然归一，不手改。
