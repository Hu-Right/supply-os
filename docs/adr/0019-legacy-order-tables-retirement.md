# ADR-0019：旧订单三表退役口径——零读写门禁驻守，DROP 走人工确认

- 状态：已接受（2026-11-13）
- 关联：`orders`（统一订单头）、`payment_orders` / `learning_orders` / `training_orders`（退役表）、
  `service_orders`（**未退役**，线下成交台账）
- 涉及仓库：`supply-os`（门户）
- 前序：008 [orders-unified](../src/lib/db/migrations/008-orders-unified.ts)、009 [orders-hardening](../src/lib/db/migrations/009-orders-hardening.ts)

## 1. 背景

008 把四张分散订单表收敛为统一订单头 `orders`（建表 → 存量回填 → 切读写），009 收口定位为
「在线支付订单头」。切表完成后，三张旧表（payment_orders / learning_orders / training_orders）
处于「停写停读、仅作回滚与外部系统兼容保留」状态。此前的退役判据是注释里的
「确认无读方可 DROP」——没有机器值守，判断靠人，三张僵尸表会无限期滞留
（退役前 UNSPSC 字典、G 码均属同类风险，最终都以门禁驻守收场）。

## 2. 决策

### 2.1 三表退役、一表保留

| 表 | 状态 | 说明 |
|---|---|---|
| `payment_orders` | 退役 | 会员单（→ orders `product_kind='plan'`） |
| `learning_orders` | 退役 | 学习/打包单（→ orders `'material'/'bundle'`） |
| `training_orders` | 退役 | 培训单（→ orders `'course'`；下单 userId 已收必填） |
| `service_orders` | **保留** | 线下成交台账（lead→转报价→核销；009 定稿：线下不进 orders） |

### 2.2 「无读方」改为机器值守

`scripts/gates/check-legacy-order-tables.mjs`（`npm run lint` / CI）扫全部 git 跟踪代码文件：

- 拦**代码**命中三表名（整行注释不计——退役说明是合法历史）；
- 豁免 `src/lib/db/migrations/**`——历史 DDL（008/009）与**将来的一次性 DROP 迁移**
  是三表唯一的合法代码出口；
- `service_orders` 不在射程；`.sql`/`.md` 不扫。

门禁绿 ⇔ 三表零读写 ⇔ DROP 随时可走。自测三面必测
（真仓库必绿 / fixture 必拦 / 注释·豁免·存活表不误伤）。

### 2.3 DROP 触发条件（另一批次）

1. 门禁连续绿（含 CI）一个观察期；
2. 确认无外部系统直连三表（如有，先迁移外部）；
3. 人工确认后走**一次性 DROP 迁移**（`src/lib/db/migrations/`，幂等探针）——
   这是三表离开本库的唯一通道，不走直接 DDL。
   DROP 前按惯例留回滚物（表行数小，全量导出存 `scripts/backups` 即可）。

### 2.4 回滚口径

切换期内若需回滚：四仓储已全面走 `orders`，回滚 = git 回退 + 旧表存量仍在
（008 起未删任何行），`legacy-map` 的反向映射不提供——旧表行自切换起必然落后，
回滚到旧表等于丢单，**禁止**。真要回滚只能回滚到 008 之前的提交并接受丢单面。

## 3. 附带清理

- 培训下单路由头注释仍写「写入 training_orders 表」，已改为 orders（`product_kind='course'`）。
