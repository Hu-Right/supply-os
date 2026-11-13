# 15. RFQ 自助发布迁出公告主表：聚合根 + 内容版本 + 审核工单 + 搜索投影

日期: 2026-11-13
状态: 已接受（流程闭环完成：创建 → 提交 → 审核 → 发布 → 报价（密封）→ 答疑 → 评审 → 定标 → 结案 → 通知；报价数据仍在 legacy 表，P2 迁表后删除桥接）

## 结论

用户自助发布的采购需求（`notice_type='RFQ' AND entry_source='platform'`）不再作为 `bid_notices` 里的一种公告存在，而是独立聚合根：

- **写模型**：`rfq_demand`（+ `rfq_demand_revision` / `rfq_review_task` / `rfq_demand_event` / `rfq_invitation` / `rfq_quote` / `rfq_qa` / `rfq_award`）。
- **状态机**：7 态（draft / submitted / under_review / rejected / published / evaluation / closed），唯一写入口 `src/lib/services/rfq/lifecycle.ts`；`closed` 用 `close_reason` 区分 cancelled / expired / awarded / violated。
- **审核**：门户不提供管理后台（红线 5）。评审后台从只读视图 `v_rfq_review_queue` 取队列，经签名回调写回结论；**门户是 `status` 的唯一写入者**。
- **读模型**：`bid_notices` 降级为搜索投影，只由 `src/lib/services/rfq/projection.ts` 写索引所需字段；宽表 / Meili / SEO / sitemap 链路不变。

## 理由

旧模型把「用户发布的需求」塞进爬虫公告主表，由此产生一组互相纠缠的缺陷（实测）：

- **双写入者**：本仓只能写到 `pending_review`，`published` / `rejected` 由库外系统直写库，没有审计、回执、并发保护；编辑会无条件把在审需求打回 `draft`，审核方仍可能在审旧内容。
- **无版本**：审核通过的是哪一版无法回答；改稿与审核可互相覆盖。
- **金额口径污染**：平台预算借用 `estimated_value`（varchar，"万元"数值），搜索侧 `parseDecimalValue` / `CAST DECIMAL` 将其当作"元"，预算筛选与排序同时失真。
- **定向可见性失效**：`visibility='targeted'` 的文案承诺"仅受邀可见"，但列表与详情都不看 `visibility`，白名单只挡住了报价动作。
- **无闭环**：驳回理由列存在但零引用；无 `submitted_at` / `reviewed_at`（算不出 SLA）；到期不关单；定标不关单。

在这些之上做局部修补（改文案、补校验、加对账）都会被"下一次别人写库"打回，因此选择换骨架而不是继续贴补丁。

## 审核契约（跨系统）

| 项 | 约定 |
|---|---|
| 取队列 | 只读视图 `v_rfq_review_queue`（task_id/demand_id/reference/version/title/category/budget/visibility/提交时间/等待分钟/SLA 到期） |
| 领取（可选） | `POST /api/rfq/review-claim`：queued→claimed、submitted→under_review |
| 回写结论 | `POST /api/rfq/review-callback`，Header `X-Review-Signature` = HMAC-SHA256(secret, `${ts}.${rawBody}`)、`X-Review-Timestamp`（±300s）、`X-Review-Request-Id`（幂等键） |
| 版本 | 回调必须带 `version`；与 `rfq_demand.revision_no` 不一致返回 409，后台刷新队列后重排，**不得重试覆盖** |
| 退回 | `reason` 必填 ≥10 字，落 `reject_reason` 并通知采购方 |
| 失败语义 | 4xx 不重试（签名/版本/参数），5xx 退避重试（1/5/30 分钟，上限 5 次） |

这两个端点是**服务间接口**：无用户会话、只接受签名、只做领取/通过/退回三种动作，路径不在 `/api/admin/*`，不提供任何人工运营能力。密钥为 `RFQ_REVIEW_CALLBACK_SECRET`，未配置时端点直接 503（不静默放行）。

## 投影口径（必须与"服务表规则"一致）

1. `estimated_value` 写**纯数字元**（不带"万"、不带币种符号）；`budget_confidential=1` 时写 **NULL**，不写 `0`。
2. 发布方写 `organization`（兜底链末端），**不写 `agency`**——避免污染"采购机构"维度聚合。
3. `deadline_ts` 写毫秒（走 STORED 生成列 `deadline_sec` 的除法分支），`deadline` / `published_date` 用 Asia/Shanghai 的 `yyyy-MM-dd`。
4. `backbone_path` / `precise_backbone_path` / `sync_src_hash` 等派生列**不由投影计算**，归 `wide-row-builder`（ADR-0002 / 0007）。
5. 投影只写索引所需列；`contact_*` / `delivery_address` 不进主表投影（PII 收口）。

## 被否决的替代方案

- **扩 `bid_notices`（加列 + 5 态）**：改动小，但"内容版本、密封报价、评审期"三件事在旧骨架上做不进去，做完仍不正规。
- **共享库直写 + DB 触发器兜底**：触发器体含 `;` 与反引号，进不了迁移运行器；`baseline.sql` 也不导出触发器，CI 空库没有它 ⇒ 依赖触发器的断言不可复现。改为"契约 + 审计日志（谁转移谁写）+ 只读对账"。
- **只改前端文案与校验**：症状级修复，状态与数据模型不变，下一次外部写入即复发。

## 后果与债务

- **两套实现短期并存**：legacy（`api/rfq/*` → `repos/rfq.repo.ts` → `bid_notices`）与 v2（`api/rfq/demands/*` → `services/rfq/*` → `rfq_demand`）。切换完成前**不得在 legacy 路径新增业务逻辑**；切换后删除 legacy 路由与其集成测试。
- **基线顺序**：`010` 必须在权威库执行后重导 `db/schema/baseline.sql`，否则 CI 空库缺这 8 张表；重导必须在与基线对齐的同一个库上做，不能拿本地库顶替。
- **回滚**：v2 表独立于 `bid_notices`，关闭开关即可回到旧路径，数据无需回滚；v2 产生的投影行可通过 `entry_source='platform' AND notice_type='RFQ'` 精确清理。
- **已知未做**：供应商侧报价/邀约/选定仍以投影 id（`notice_pk`）为键；`notifications` 表级唯一键（当前为代码级 `(user,type,ref_id)` 去重）；报价与邀约向新表迁移。
