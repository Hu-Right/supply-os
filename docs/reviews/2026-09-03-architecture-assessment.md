# Supply OS — 架构评估报告

> 评估日期：2026-09-05（基于 2026-09-03 初始审查启动，09-05 完成实证与修复）
> 配套文档：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [CODE_REVIEW_GUIDE.md](./CODE_REVIEW_GUIDE.md) · [API_REFERENCE.md](../api/API_REFERENCE.md)

---

## 1. 评估范围与方法

- **代码实证**：全量阅读 `src/` 四层结构（app / features / shared / core / lib）的导入关系、文件规模与耦合热点
- **红线审计**：逐条验证 ARCHITECTURE.md 定义的四条分层红线
- **安全走查**：以 CODE_REVIEW_GUIDE 15 项线索为检查清单，逐项定性
- **文档对齐**：检查 ARCHITECTURE.md 引用文档的存在性与一致性

---

## 2. 分层红线合规性（2026-09-05 验证）

| 红线 | 定义 | 状态 | 详情 |
|---|---|---|---|
| **R1** | `lib` 不 import features/shared/app | ⚠️ 18 处 `lib→shared/constants/*` | 实质为 shared 层承担"公共常量基础设施"角色，非设计缺陷（见 §5 R1 重定义建议） |
| **R2** | `core` 不 import features/lib/app | ✅ 零违规 | — |
| **R3** | `features` 不直接 import `@/lib/**` | ⚠️ 1 处 | `features/procurement/utils/scoringEngine.ts` re-export（已标注迁移路径，P2 清理） |
| **R4** | 服务端唯一入口 `lib/**` + `instrumentation.ts` | ✅ 零违规 | — |

---

## 3. 安全与资金链路发现（已修复 / 待验证）

### 3.1 已修复（2026-09-05）

| # | 严重度 | 位置 | 线索 | 修复措施 |
|---|---|---|---|---|
| 1 | **高（资金）** | `orchestrator.ts` handleNotify | 培训订单（TR 前缀）无回调履约通道，落入 default 分支在 payments_repo 查找恒返 ORDER_NOT_FOUND | 添加 `case "training":` 分支，路由至 `fulfillTrainingOrder`；同步补全 queryOrder / refundOrder / fulfillMockOrder 的 training 分支；新增 `reverseTrainingOrder` 退款逆向函数 |
| 2 | **高（越权）** | `supplier-qualification/[id]/report` | IDOR：仅要求登录，未校验 row.user_id | 添加 `row.user_id !== null && row.user_id !== auth.userId → 403` 归属校验 |
| 3 | **高（付费墙）** | `notices/[id]/translation` | 不校验解锁态，返回全文译文旁路 403 | 添加 `unlockRepo.findUnlock` 校验，未解锁返 403 core_locked |
| 4 | **高（付费墙）** | `opportunities/[id]/translation` | 同上 | 添加 `oppsRepo.findExistingUnlock` 校验 |
| 5 | **高（数据泄露）** | `opportunities` GET 列表 | 无认证返回未截断 description + source_url | 添加 `requireUserKeyOrThrow` + `withRoute` 包装；description 截断 300 字符；source_url 从列表响应移除 |
| 6 | **中（文档）** | `.env.example` / `.env` | CSRF_ENABLED / ALLOWED_ORIGINS 声称存在校验但 src/ 全树无实现 | 注释修正为"预留占位，当前不被代码读取"；标注实际缓解措施（Bearer token 天然免疫 CSRF） |

### 3.2 待验证（需本地环境复现）

| # | 严重度 | 位置 | 线索 | 验证方法 |
|---|---|---|---|---|
| 7 | 中高 | `supplier-qualification` POST | 公开端点填他人 user_key 可覆盖其 qualification_id | 双账号实测 |
| 8 | 中 | auth 验证码体系 | 爆破速率 = 发码频率×5（滚动换码重置 attempts） | 计数实验 |
| 9 | 中 | training/orders | participant_count NaN 通路 → NaN 金额 | 传 "abc" 实测 |
| 10 | 中 | 培训订单归属 | user_id IS NULL 历史单任意用户可查 | 构造 NULL 单实测 |
| 11 | 中 | mock 支付链路 | MockProvider 无二维码 → mock 模式下单必 500 | PAYMENT_MODE=mock 走单 |
| 12 | 中 | crm/chat/upload | 附件 URL 无鉴权（仅 UUID 防枚举） | 拿 URL 无 token 拉取 |
| 13 | 中 | ai/matchmake | 字段原样拼 prompt（提示注入） | 字段注入测试 |
| 14 | 低中 | 横切 | logout 不撤销 access token；错误码复用；约 15 个写端点无限流 | 静态确认 |

---

## 4. 耦合热点分析

### 4.1 跨 Feature 直接依赖

| 源 | 目标 | 依赖点 | 计划 |
|---|---|---|---|
| procurement | payment | `useNoticePayment → usePaymentPolling`；`ProcurementPage → RecentUnlocks` | P2-1：提升到 page 层或事件总线 |
| procurement | membership | `NoticeDetailSidebar → MembershipStatusPanel` | P2-2：改为事件触发 |
| crm | supplier | `useCrmData → fetchSuppliers` | P2-3：提升到 page 层 |

### 4.2 God Modal 瓶颈

`layout-shell.tsx`（176 行）管理 4 个全局模态框，通过 `useAppModals`（57 行，10+ 状态变量）控制。计划 P2-4 引入 ModalRegistry Context 拆分。

### 4.3 Procurement 巨型模块

47 个文件 / 20 个 hooks，搜索与通知 hooks 间存在隐式数据流依赖。计划 P3-1 引入 `useNoticeContext` 聚合。

### 4.4 search-sync ↔ search-orchestrator 双向依赖

已通过叶子模块直接导入部分解环（`wide-table-readiness` 作为共享状态层）。彻底解环需引入 `search-common/` 中间层，列入 P3-2。

---

## 5. 架构治理建议

### R1 红线重定义

当前 R1 禁止 `lib` import `shared`，但 18 处 `lib → shared/constants/*` 是合理的（常量作为基础设施层）。建议修正为：

> **R1（修订）**：`src/lib` 不 import `features/app`；允许 import `shared/constants` 与 `shared/data`（纯数据/常量层），禁止 import `shared/ui`、`shared/layout`、`shared/hooks`、`shared/filters`（组件/交互层）。

### 类型定义收敛

`src/types/` 声明为前后端共享 DTO 唯一源，但 `src/lib/types/` 存在平行定义（如 `crm.ts`）。建议：
- `lib/types/` 仅保留服务端专用类型（策略接口/行类型）
- 共享 DTO 一律放 `src/types/`
- feature 内部类型留在 `features/*/types.ts`

---

## 6. 重构策略判定

| 方案 | 评估 |
|---|---|
| 一次性重写 | ❌ 不推荐。710 单测 + 96.49% 覆盖率 + 68 迁移 + 真实支付链路，回归风险远超收益 |
| 渐进式三阶段治理 | ✅ 推荐。P0 安全修复（3-5 天）→ P1 耦合解耦（5-8 天）→ P2 深层优化（8-12 天） |

**结论：值得做，必须渐进式执行。**

---

## 7. 文档治理发现

| 问题 | 状态 |
|---|---|
| `docs/reviews/2026-09-03-architecture-assessment.md` 被 ARCHITECTURE.md 引用但不存在 | ✅ 已补建（本文档） |
| `.env.example` CSRF 配置声称与实现不符 | ✅ 已修正（注释标注未实现） |
| `docs/OS网站优化与收费产品设计.docx` 无法被技术评审读取 | ⏳ 待转化为 markdown |
| `docs/①_OS网站逐页面修改清单+网站文案_V1.0.docx` 同上 | ⏳ 待转化 |
