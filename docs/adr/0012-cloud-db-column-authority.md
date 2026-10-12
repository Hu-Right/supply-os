# ADR-0012 列口径以云库为准

日期：2026-10-12
状态：已采纳

## 背景

项目同时存在内网库（192.168.1.14/crm）与云生产库（117.72.108.14/crm，本机经 3307 SSH 隧道访问）。两库 `crm_bid_notices` 出现列漂移：内网多出 `source_channel`（varchar(50) NOT NULL DEFAULT 'UNGM'）与 `urgency`（varchar(50) NULL）两列且已全量回填，云库没有；`db/schema/baseline.sql` 与云库一致（同样没有这两列）。

`PaymentHistoryRepo`（订单/解锁历史）的查询引用了 `n.source_channel`、`n.urgency`，在本机对云库调试时稳定触发 `ER_UNKNOWN_COLUMN` → GET /api/payment/orders 与 GET /api/payment/unlocks 双双 500（线上同库同代码，同样命中）。

## 决策

用户拍板（2026-10-12）：**所有列的口径以云库为准**。

- 云库没有的列 = 不存在的列；代码（查询/类型/映射）引用前必须先对云库验证。
- 内网库多出的列按废弃处理，不得进入新代码；等待内网侧自行退役，不做云库补列。
- `db/schema/baseline.sql` 与云库列结构对齐（现状已一致），基线生成与门禁继续以云库口径为准。

## 后果

- `PaymentHistoryRepo` 三条查询与 `OrderHistoryRow`/`UnlockHistoryRow`/`OrderNoticeBrief` 摘除上述两列（UI 层本就未渲染，无用户可见损失）。
- 跨库排障时「内网有、云库没有」的列一律视为内网私有，不再作为「云库漏迁移」反推补列。
- 新查询上线前的验证口径：`information_schema.columns` 查云库，而非内网或 baseline 单独其一。
