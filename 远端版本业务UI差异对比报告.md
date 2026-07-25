# 本地重构版 vs 远端最新版 —— 业务 / UI 差异对比报告

> 本文档为**只读对比结论**，不修改任何源码文件。
>
> - **对比基准（远端最新）**：`origin/main` = 提交 `8312f0c`（在旧基线 `70aa6b2` 之上新增了"单条采购公告付费解锁 / 我的订单 / 我的已解锁"整套 notice-payment 功能）。
> - **对比对象（当前本地）**：`port/notice-payment` 分支的组件化重构版（feature 化：`features/`、`shared/`、`core/`、`data/`）。
> - **对比方式**：以 `origin/main` 的 8 个原始单体源文件快照（`App.tsx`、`ProcurementNoticesPool.tsx`、`PaymentModal.tsx`、`TrainingPage.tsx`、`TrainingRegisterModal.tsx`、`data.ts`、`locales.ts`、`types.ts`）与当前重构后的对应 feature 文件逐区比对。

---

## 第三轮复验结论（2026-07-24 · 对齐验证）✅ 全部对齐

本轮针对"对齐工作"的最终验证（`git diff` 逐文件复核 + 与 origin 快照逐区比对 + 全量回归），结论：**此前所有待办差异均已修复，无新增回退**。

| 状态 | 事项 | 验证结论 |
| --- | --- | --- |
| ✅ 已修复 | §1.1 内嵌多套餐付费面板 | 新增 `NoticePaymentPanel.tsx` + `hooks/useNoticePayment.ts`：套餐从 `/api/membership/plans` 动态拉取、支付宝/微信切换（微信禁用）、逐套餐价格+购买、订单创建、mock"确认完成"、真实支付跳转、3 秒轮询对账、成功后回调解锁——对齐原版 `PaymentPanel` 全流程。 |
| ✅ 已修复 | §1.2 投标拆解建议卡片 | `NoticeUnlockedDetails` 补回 4 条要点卡（紧急度/注册门槛、预算/截止、UNSPSC 前 4 码、下一步指引），空值均有 i18n 兜底文案。 |
| ✅ 已修复 | §1.3 核心信息遮罩 | `NoticeDetail` 按 `core_locked` 门控：未解锁时机构名显示"核心信息已隐藏"、UNSPSC/来源链接/交付信息隐藏并渲染琥珀色遮罩占位框。 |
| ✅ 已修复 | §1.4 原始链接 + key_contacts 形态 | `NoticeUnlockedDetails` 补回 `notice.url`"打开公告"入口；`key_contacts` 兼容字符串（纯文本卡）与对象数组两种形态。 |
| ✅ 已修复 | §1.5 免费额度用尽交互 | 达上限打开详情、解锁 402、免费额度不足、兴趣操作后均自动 `openPaywall` 弹出内嵌付费面板——对齐原版。 |
| ✅ 已修复 | §3.1 记录面板残留细节 | 新增 `hooks/useRecordsSummary.ts`：概览两入口卡补回**数量徽标 + 首条记录预览**；下钻视图补回常驻**刷新**按钮；分页器保留。 |
| ✅ 已修复 | §7 NoticeItem 类型不同步 | 全局 `types/procurement.ts` 补齐解锁拓展字段成为单一事实源，feature 内 `types.ts` 改为 re-export——技术债清除。 |
| ✅ 已修复 | §8.3 CRM 线索跟进录入不落库 | `useCrmData` 新增 `addFollowUpLog`（`POST /api/leads/log` + `setLeads` 回写），经 `LeadTracker` 透传至 `FollowUpLogPanel`；提交后时间线即时回显、失败展示错误文案、提交中禁用按钮。 |
| ✅ 结案（无需迁移） | §4 `TrainingRegisterModal` | 经全局检索 origin 快照确认：该组件在原版**无任何引用**（死代码），报名能力已由 `TrainingPage` 页面版完整承载，**不存在缺失入口**。 |

**回归验证**：`tsc --noEmit` 0 错误；`vitest run` **49 文件 / 393 用例全部通过**（较上轮 41/328 新增 `MyRecordsPanel`、`NoticePaymentPanel`、`supplier-api` 等测试）；i18n 6 语言各 **481 键**（+19）完全一致、无缺失。

**残余非阻塞差异（有意设计/低优先级，非回退）**：
1. 详情页在内嵌面板之外仍保留"单条解锁 ¥89"按钮（走全局 `PaymentModal`）与列表头"升级会员"按钮（硬编码 `annual_manual_8800`）——重构新增的**双支付入口**，属增强。
2. CRM 跟进录入成功后不再 `alert`，改为**静默清空 + 时间线即时回显**——体验等价偏优。
3. 展厅"咨询顾问"打开通用咨询表单（原版带展厅上下文）；学习/会员"升级"按钮改为直接触发支付流程——见 §8.4，均为有意行为调整。
4. fr/ru/es/ar 译文质量仍建议人工抽检（键齐全不代表译文准确）。

---

## 本次审查更新（2026-07-24）

针对首版报告结论，本地已完成一批修复。经复核 `git diff` 与源码，确认以下三项差异**已修复对齐**，另发现两项此前漏判的差异（重构期丢失、现已补回）：

| 状态 | 事项 | 结论 |
| --- | --- | --- |
| ✅ 已修复 | 我的订单 / 已解锁记录位置 | 撤销独立页 `/my-purchases`（删除 `MyPurchasesPage.tsx` 与路由），改回**账户弹窗内嵌** `MyRecordsPanel`（`AuthModal` 内引用），对齐原版"记录在账户弹窗内"设计。采购页"我的采购"按钮改为派发 `supply-os:open-account` 事件打开账户弹窗。详见 §3.1。 |
| ✅ 已补回（此前漏判） | 供应商自助入驻 | 新增 `SupplierRegisterModal.tsx` + `supplier/api.ts`（`registerSupplier` / `fetchCustomSuppliers`），`SupplierPage` 合并展示自定义供应商并提供"成为认证供应商"入口——对齐原版 `customSuppliers` + 供应商注册能力。详见 §8。 |
| ✅ 已补回（此前漏判） | CRM 机会订阅确认提示 | `useCrmData` 补回 `subscribingOppMessage` 状态，`CrmPage` 渲染"订阅成功"提示条——对齐原版 `subscribeOppSuccess` 反馈。详见 §8。 |
| ~~⚠️ 仍存在~~ ✅ 第三轮已修复 | 采购 §1.1~§1.5 各项 | 内嵌多套餐付费面板、投标拆解建议、核心信息遮罩等——**已于第三轮全部补回**，见顶部"第三轮复验结论"。 |
| ~~⚠️ 仍存在~~ ✅ 第三轮结案 | 培训 `TrainingRegisterModal` | 经检索确认为原版**死代码**（无引用），无需迁移。详见 §4。 |
| ~~❗ 新发现·待修复~~ ✅ 第三轮已修复 | CRM 线索跟进录入不落库 | 已补回 `addFollowUpLog`（`POST /api/leads/log` + 回写），提交可落库并即时回显。详见 §8.3。 |

> i18n 已同步：新增 13 个键（供应商入驻 10 + 记录面板 3），6 语言（zh/en/fr/ru/es/ar）现各 462 键、无缺失。（第三轮又新增 19 键，现各 **481 键**、仍全语言一致。）
>
> 第二轮深度核对（展厅 / 服务 / 学习 / 会员 / CRM 与 origin 单体逐区比对）：4 个 Tab 均为忠实迁移，仅少量行为差异/增强；唯一功能回退为上表 CRM 线索跟进录入（**已于第三轮修复**）。详见 §8.4。

---

## 0. 结论速览

| 模块 | 保真度 | 说明 |
| --- | --- | --- |
| 采购公告（notice-payment） | ✅ 已对齐（第三轮修复） | 内嵌多套餐付费面板、投标拆解建议、核心信息遮罩、原始链接、免费额度交互均已补回 |
| 支付弹窗 PaymentModal | ✅ 基本一致 | 逻辑抽到 usePayment hook + i18n，功能等价 |
| 我的订单 / 已解锁记录 | ✅ 已对齐（第三轮补全） | 账户弹窗内嵌 `MyRecordsPanel`；数量徽标/首条预览/刷新按钮已补齐 |
| 账户信息卡 | ✅ 一致 | 当前账号 / VIP / 供应商身份 / 线索权益 均保留 |
| 培训报名页 | ✅ 一致（第三轮结案） | 表单一致；`TrainingRegisterModal` 经确认为原版死代码，无需迁移 |
| i18n 多语言 | ✅ 完整且增强 | 由 zh/en 扩展到 6 语言，481 键全语言齐全、无缺失 |
| 静态数据 data | ✅ 一致 | 33 条记录拆分为 5 个文件，数量完全一致 |
| 领域类型 types | ✅ 已统一（第三轮修复） | 全局 `types/procurement.ts` 成为 NoticeItem 单一事实源，feature 内 re-export |
| 供应商自助入驻 | ✅ 已补回 | 重构期曾丢失，现新增 `SupplierRegisterModal` + `api.ts` 补回 |
| CRM 机会订阅提示 | ✅ 已补回 | 重构期曾丢失，现补回 `subscribingOppMessage` 提示条 |
| CRM 线索跟进录入 | ✅ 已修复（第三轮） | `addFollowUpLog` 落库 + 回写时间线，"录入至 CRM"恢复有效 |
| 展厅 / 服务 / 学习 / 会员 | ✅ 忠实迁移 | 逐区比对无功能丢失；仅少量行为差异/增强（升级按钮改触发支付、咨询改事件） |

> 说明：远端 `8312f0c` 相较基线 `70aa6b2` **仅改动了 notice-payment 相关文件**（`App.tsx`、`ProcurementNoticesPool.tsx`、`PaymentModal.tsx`、`server.ts`、`payment/*`）。因此其余 Tab 的远端原始版本与你重构所基于的版本一致，不存在"因拉取新代码而产生的"业务差异。

---

## 1. 采购公告模块（差异最集中）

原版 `ProcurementNoticesPool.tsx` 为 1235 行单体组件；重构后拆分为
`features/procurement/pages/ProcurementPage.tsx` +
`components/{NoticeCard, NoticeDetail, NoticeUnlockedDetails, ProcurementPagination, UnspcsSelector}` +
`api.ts` + `types.ts`，并复用 `features/payment` 的 `RecentUnlocks`。

### 1.1 【✅ 已修复（第三轮）】内嵌"解锁产品"付费面板已补回

- **原版**：在公告详情页右侧 `<aside>` 内嵌了一个 `PaymentPanel` 付费面板。触发免费额度用尽 / 兴趣操作后，面板展示：
  - 支付方式切换（支付宝 / 微信，微信禁用并标注"暂未开通"）；
  - 从 `/api/membership/plans` 拉取的**多套餐列表**（单次解锁、尝鲜包、周卡、年卡等）逐条渲染价格 + 购买按钮；
  - 订单创建、本地 mock"确认完成"按钮、真实支付"立即支付"跳转、轮询对账。
- **重构版**：
  - 删除了内嵌付费面板；改为派发全局事件 `supply-os:pay` → 由 `App.tsx` 顶层的 `PaymentModal` 统一承接；
  - 详情页仅保留**一个固定的"单条解锁 ¥89"按钮**（`code=single_89`，仅当 `core_locked !== false` 时显示）；
  - 年费顾问服务改由列表页头部"升级会员"按钮触发（硬编码 `annual_manual_8800`，**不再从 `/api/membership/plans` 动态拉取**）。
- **影响**：原版可在采购详情内直接选择的**尝鲜包 / 周卡等中间套餐不再被暴露**；付费入口从"内嵌多套餐面板"收敛为"单次解锁 + 会员升级"两个固定入口。
- **✅ 第三轮修复**：新增 `components/NoticePaymentPanel.tsx` + `hooks/useNoticePayment.ts`，套餐从 `/api/membership/plans` 动态拉取，支付方式切换 / 逐套餐购买 / 订单创建 / mock 确认 / 真实支付跳转 / 3 秒轮询对账全流程对齐原版；面板在详情页 `<aside>` 内按付费墙状态渲染。原"单条解锁 ¥89"与"升级会员"入口作为增强保留（双入口并存）。

### 1.2 【✅ 已修复（第三轮）】"投标拆解建议"卡片已补回

- **原版**：已解锁交付信息区含一个"投标拆解建议"卡片，4 条要点：
  1. 紧急度 / 注册门槛；
  2. 预算参考 / 截止时间；
  3. 分类代码（取前 4 个 UNSPSC code）；
  4. 下一步：下载 RFQ/附件，核对资质、交付时间、报价币种、文件签章要求。
- **重构版**：`NoticeUnlockedDetails.tsx` **未渲染该建议卡片**（只有元信息网格 + 联系人 + 附件分组）。
- **影响**：解锁后原本提供的"投标操作指引"内容缺失。
- **✅ 第三轮修复**：`NoticeUnlockedDetails` 已补回 4 条要点卡（紧急度/注册门槛、预算/截止、UNSPSC 前 4 码、下一步指引），空值有 i18n 兜底。

### 1.3 【✅ 已修复（第三轮）】"核心信息已隐藏"遮罩逻辑已补回

- **原版**：详情页根据 `core_locked` 做门控——
  - 未解锁时隐藏 UNSPSC 标签与交付信息，改显示琥珀色"核心信息已隐藏 / 真实机构、联系方式…解锁后展示"占位框；
  - 机构名在未解锁时显示为"核心信息已隐藏"。
- **重构版**：`NoticeDetail.tsx` **无条件渲染** UNSPSC 标签与来源链接；`NoticeUnlockedDetails` 仅在无内容时返回 `null`，**没有"核心信息已隐藏"提示文案**，机构名直接显示 `agency/organization`。
- **影响**：付费墙的"信息遮罩"视觉表达消失；未解锁态与解锁态的差异感变弱。
- **✅ 第三轮修复**：`NoticeDetail` 按 `core_locked === false` 门控：未解锁时机构名显示"核心信息已隐藏"，UNSPSC 标签/来源链接/交付信息隐藏，改渲染琥珀色遮罩占位框——对齐原版。

### 1.4 【✅ 已修复（第三轮）】已解锁"交付信息"缺失项已补回

- **原版**："已解锁交付信息"区为两张白卡：
  - 采购方/机构信息（机构全称、国家/地区、发布日期、**原始链接"打开公告"** `notice.url`）；
  - 联系方式（`key_contacts` 文本 + `contacts` 列表）；
  - 下方"采购文件/拆解材料"（documents + procurement_files + external_links 合并）。
- **重构版**：`NoticeUnlockedDetails` 改为：元信息网格（发布日期 / 难度 / 注册级别）+ 联系人列表（key_contacts 与 contacts 合并为对象数组）+ 三个附件分组（documents / procurement_files / external_links 分列）。
  - **"原始链接·打开公告"（`notice.url`）在交付卡内不再单独呈现**，改由正文的 `source_url` 链接承担；
  - `key_contacts` 原版按**纯文本**展示，重构版按**联系人对象数组**处理（数据形态假设不同，若后端 `key_contacts` 返回字符串可能不展示）。
- **✅ 第三轮修复**：交付卡内已补回 `notice.url`"原始链接·打开公告"入口；`key_contacts` 现兼容**字符串（纯文本卡展示）与对象数组**两种形态，形态差异消除。版式重排（元信息网格 + 附件三分组）保留为有意的结构化增强。

### 1.5 【✅ 已修复（第三轮）】免费额度用尽时的交互已对齐

- **原版**：达到 3 次免费详情上限时，`openNotice` 会**打开公告 + 弹出内嵌付费面板**并提示。
- **重构版（旧）**：仅 `setActionMessage(t("procurement_freeLimit"))` 提示，**不再自动弹付费面板**，用户改用常驻的"单条解锁"按钮。
- **✅ 第三轮修复**：达上限打开详情、解锁返回 402、免费额度不足、兴趣操作成功后均自动 `openPaywall(notice)` 弹出内嵌付费面板——与原版触发时机一致。

### 1.6 【差异·新增】列表页头部与"最近解锁"为重构新增

- **重构版新增**（原版列表头仅有"共 X 条""免费体验"两个徽标）：
  - 头部按钮：**升级会员**、**培训**（跳 `/training`）、**我的采购**（现派发 `supply-os:open-account` 事件打开账户弹窗，早期为跳 `/my-purchases`）；
  - 列表网格上方新增 **`RecentUnlocks`（最近解锁 top-3）** 快捷区。
- 属于重构期主动增强，非远端原有。

### 1.7 【改善】原版乱码在重构版被修正（非回退）

- 原版详情副标题分隔符为乱码 `路`（应为 `·`）；免费按钮剩余次数文案为 `?…?`（应为 `(…)`）。重构版均已修正为正确的 `·` 与括号。
- 该项为**质量改善**，非不一致回退，此处记录以免误判。

### 1.8 保持一致的部分

- 列表卡片 `NoticeCard`：版式、`core_locked===false` 才显示 UNSPSC 标签、预算/机构/查看详情按钮——与原版内联卡片一致。
- UNSPSC 五级级联筛选、搜索、分页、免费 3 次详情限制（localStorage 计数）、会员额度展示、感兴趣/订阅商机、支付整页跳回对账（`?order_no=&trade_no=&notice_id=`）——逻辑等价保留。

---

## 2. 支付弹窗 PaymentModal

- **保真度：✅ 基本一致。** 原版 `PaymentModal.tsx`（311 行）被迁移为
  `features/payment/components/PaymentModal.tsx` + `hooks/usePayment.ts` + `api.ts`。
- 一致点：四步流程（choose→waiting→success→failed）、支付方式列表（`getAvailableProviders`）、3 秒轮询、mock/真实支付分支、金额展示（`¥`/`$`）、复制链接/重开支付等**完全对应**。
- 差异（非回退）：
  - 文案从传入的 `t` 字典改为 `useLocale()` 的 `t()`；
  - 新增 `noticeId` / `returnUrl` 两个入参（配合单条公告付费）；
  - 原版注释与 `console.error` 中的乱码（`鍒涘缓璁㈠崟澶辫触`）被清理。
- 默认支付方式两版一致：初始 `selectedProvider = "mock"`，再由可用列表自动纠正。

---

## 3. "我的订单 / 我的已解锁"记录 —— ✅ 已回归账户弹窗

### 3.1 【✅ 已修复】记录已从独立页改回"账户弹窗内嵌"

- **原版**：记录内嵌在 `App.tsx` 的账户弹窗（登录态）中：
  - `overview` 视图：两张入口卡——**我的支付订单**（蓝色，右上角数量徽标 `myOrdersTotal` + 首条订单标题/订单号预览）、**我的已解锁采购**（teal 色，数量徽标 `myUnlocksTotal` + 首条预览）；
  - `orders` / `unlocks` 管理视图：返回按钮、标题副标题、**刷新**按钮、按倒序列出记录（订单显示状态"已支付/closed…"、金额、时间；解锁显示 unlock_type、时间、国家/编号）、"打开详情"跳转、**分页器 `renderRecordPager`**（"共 X 条 · 第 X/X 页 · 上一页/下一页"）。
- **首版重构（已废弃）**：曾迁移为独立路由页 `MyPurchasesPage.tsx`（`/my-purchases`），账户弹窗内无记录入口。
- **本次修复（当前状态）**：**撤销独立页**（删除 `MyPurchasesPage.tsx` 及 `/my-purchases` 路由），新增 `features/payment/components/MyRecordsPanel.tsx`，在 `AuthModal` 账户卡内内嵌渲染——**恢复原版"记录在账户弹窗内"的设计**：
  - `overview` 视图：两张入口卡（订单 / 解锁），点击下钻；
  - 下钻视图：返回概览、加载/失败重试/空态、`OrderHistoryList` / `UnlockHistoryList` 列表 + 分页器；
  - 采购页"我的采购"按钮不再跳 `/my-purchases`，改为派发 `supply-os:open-account` 事件，由 `App.tsx` 打开账户弹窗。
- **残留细节（✅ 第三轮已补齐）**：
  1. ~~概览两张入口卡未显示数量徽标与首条记录预览~~ → 新增 `hooks/useRecordsSummary.ts`（并行拉取订单/解锁 total + 首条），概览卡已显示**数量徽标 + "最新: xxx"首条预览**。
  2. ~~下钻视图无常驻"刷新"按钮~~ → 下钻视图头部已补回常驻**刷新**按钮（`history.refresh`）。

### 3.2 账户信息卡：✅ 一致

- 重构版 `AuthModal.tsx` 保留：当前账号、VIP/免费徽标、供应商身份（已审核 #id / 待提交）、线索权益、`claimMessage`、退出登录——与原版账户卡字段一一对应（仅由硬编码中文改为 i18n）。

---

## 4. 培训报名

- **TrainingPage：✅ 基本一致。** 原版 `TrainingPage.tsx`（340 行）迁移为
  `features/training/pages/TrainingPage.tsx` + `hooks/useTrainingForm.ts`。字段（企业名称/三级行业级联/主营产品/出口经验/资质多选/联系人信息/备注）、必填校验（企业名称+一级行业+参会人+手机号）、提交接口 `/api/training/register` 均一致；硬编码中文改为 i18n。
- **【✅ 第三轮结案·无需迁移】`TrainingRegisterModal.tsx`。** 原版存在该独立培训报名弹窗组件（约 12.8KB），但经对 origin 快照**全局引用检索确认：原版任何文件均未 import / 渲染它，属死代码**。报名能力已由 `TrainingPage` 页面版完整承载，重构版不存在缺失入口，无需迁移。

---

## 5. i18n 多语言：✅ 完整且增强

- 原版 `locales.ts` 仅内置 **zh / en** 两套字典（且各组件内还各自维护 `copy = {zh,en}` 局部字典）。
- 重构版集中到 `core/i18n/`，扩展为 **6 种语言：zh / en / fr / ru / es / ar**（含 RTL 方向支持）。
- **键完整性核验：6 个语言文件均为 481 个键，任一语言相对 zh 均无缺失键。** i18n 迁移完整（第二轮 +13 键：供应商入驻 10 + 记录面板 3；第三轮 +19 键：内嵌付费面板 / 投标建议 / 遮罩 / 记录摘要等）。
- 差异属增强，非回退；仅需注意新增语言（fr/ru/es/ar）译文质量需人工抽检（键齐全不代表译文准确）。

---

## 6. 静态数据 data：✅ 一致

- 原版单体 `data.ts`（31KB，含 33 条 `id:` 记录）拆分为
  `data/{suppliers.ts(7) + opportunities.ts(3) + exhibition-halls.ts(6) + faqs.ts(3) + materials.ts(14)}` = **33 条，数量完全一致**。
- `public/downloads/training/` 下 11 个 `.docx` 培训资料在 `data/materials.ts` 中被正确引用（fileUrl/fileName 保留）。

---

## 7. 领域类型 types：✅ 基本一致（1 处需注意）

- 原版 `types.ts`（104 行）拆分为 `types/{exhibition,supplier,crm,learning,auth,payment,procurement,membership}.ts` 并经 `types/index.ts` 统一导出。
- `Supplier`：原版同时存在乱码字段 `国际公共采购Code?` 与 `ungmCode?`，重构版**删除了乱码重复字段**，仅保留 `ungmCode?`（合理清理）。
- `Lead.has国际公共采购Participation` 字段两版均保留（含中文的字段名未改）。
- **【✅ 第三轮已统一】两处 `NoticeItem` 定义不同步**：
  - 旧状态：全局 `types/procurement.ts` 的 `NoticeItem` 缺少解锁后拓展字段，feature 内另行维护一份含拓展字段的定义，两处不同步；
  - **第三轮修复**：全局 `types/procurement.ts` 已补齐全部拓展字段（`url/contacts/documents/procurement_files/external_links/agency_full/published_date/difficulty/registration_level/key_contacts` 等）成为**单一事实源**，`features/procurement/types.ts` 改为 `export type { NoticeItem, ... } from "@/types"` re-export——技术债清除。

---

## 8. 其余 Tab（CRM / 学习 / 会员 / 展厅 / 服务 / 供应商）

- 远端 `8312f0c` 相对基线 `70aa6b2` **未改动**这些模块文件（改动集中在 notice-payment 与后端）。因此这些 Tab 的"远端原始版本"与你做重构所基于的版本一致。
- **但**首版报告将此结论过度简化为"无差异"，实际上重构期在这些 Tab 内**丢失了两项原版（基线 `70aa6b2`）本就存在的功能**——本次审查已发现并确认它们**已被补回**：

### 8.1 【✅ 已补回】供应商自助入驻

- **原版**：`App.tsx` 含 `customSuppliers` 状态与供应商注册能力（`registerSupplierBtn`），供应商列表以 `[...customSuppliers, ...SUPPLIERS]` 合并展示用户自助入驻的供应商。
- **首版重构（遗漏）**：`SupplierPage` 仅渲染静态 `SUPPLIERS`，无入驻入口——此功能曾丢失。
- **本次修复（当前状态）**：新增 `features/supplier/components/SupplierRegisterModal.tsx` + `features/supplier/api.ts`（`registerSupplier` → `POST /api/suppliers`、`fetchCustomSuppliers` → `GET /api/suppliers/custom`）；`SupplierPage` 通过 `[...customSuppliers, ...SUPPLIERS]` 合并展示，并提供"成为认证供应商"按钮（`supplierRegOpenBtn`）触发入驻弹窗，提交成功后回调刷新列表。**已对齐原版能力。**

### 8.2 【✅ 已补回】CRM 机会订阅确认提示

- **原版**：`App.tsx` 含 `subscribingOppMessage` 状态，"关注并订阅"商机后弹出 `subscribeOppSuccess` 成功提示条。
- **首版重构（遗漏）**：`CrmPage` 无对应反馈提示——此功能曾丢失。
- **本次修复（当前状态）**：`useCrmData` 补回 `subscribingOppMessage` 状态与 `subscribeOpportunity` 逻辑，`CrmPage` 渲染 teal 色"订阅成功"提示条（带动效）。**已对齐原版反馈。**

### 8.3 【✅ 已修复（第三轮）】CRM 线索跟进录入已恢复落库

- **原版**：`addCrmFollowUpLog` 提交时 `POST /api/leads/log`（`{leadId, content, author, nextStatus}`），成功后**更新本地 `leads` 列表 + 当前线索**、清空输入并 `alert` 成功。跟进记录真正写入并即时回显。
- **重构版（旧·回退）**：`FollowUpLogPanel.handleSubmit` 仅清空表单——无 API 调用、无状态更新，"录入至 CRM"为死按钮。
- **✅ 第三轮修复**：`useCrmData` 新增 `addFollowUpLog`（`POST /api/leads/log` + `setLeads` 回写，作者取 `运营经理 (${authUser.email})`），经 `CrmPage` → `LeadTracker`（同步刷新 `activeLead` 时间线）→ `FollowUpLogPanel` 透传；提交中禁用按钮、失败展示错误文案。**与原版逻辑等价**（唯一差别：成功后不再 `alert`，改为静默清空 + 时间线即时回显，体验偏优）。

### 8.4 逐 Tab 深度核对结论（展厅 / 服务 / 学习 / 会员）

本轮已将上述 4 个 Tab 与 origin 单体逐区比对，均为**忠实迁移**，仅有下述"行为差异/增强"，无功能丢失：

| Tab | 结论 | 备注 |
| --- | --- | --- |
| 展厅 Showroom | ✅ 一致 | 筛选/卡片/入驻表单一致。**细节差异**：原版"咨询顾问"按钮打开的是**带展厅上下文的入驻表单**，重构版改为派发通用 `supply-os:consult`（打开通用咨询表单），上下文略有弱化（低优先级）。 |
| 服务 Services | ✅ 完全一致 | 6 张服务卡（标题/描述/技术指标/图标）+ 3 条成功案例逐条一致；"预约"按钮 `setShowConsultForm` → 改为 `supply-os:consult` 事件，等价。 |
| 学习 Learning | ✅ 一致 | 材料卡（分类/下载次数/概要/付费锁/已解锁提示/核心内容/下载）与 FAQ 一致。**行为变化（增强）**：付费材料"升级"按钮原版 `setShowAuthModal`（开账户弹窗），重构版改为触发支付流程（未登录→require-login，已登录→`supply-os:pay` `annual_8800`）。 |
| 会员 Membership | ✅ 一致 | VIP 卡（4 项特权网格）+ 邮件订阅一致。**增强**：套餐价改为异步拉 `/api/membership/plans` 校准（兜底 `annual_8800`）；升级按钮行为同"学习"变化。 |

### 8.5 其余模块

- AI 智能匹配（`useAiMatch` → `POST /api/ai/matchmake`）、CRM 指标卡、商机列表、线索列表卡均忠实迁移。
- 若其余处有出入，均来自你重构期的主动调整（多为 i18n 化与事件解耦），非与远端不一致。

---

## 9. 后端（server.ts / payment 提供商）：✅ 已对齐

- `src/payment/*`（PaymentService / Alipay / Wechat / Mock）与远端逻辑一致，仅 import 路径由 `./types` 改为 `@/types/payment`。
- `server.ts` 已包含远端新增的 `/api/payment/orders`、`/api/payment/unlocks`、单条公告解锁授权、`agency_full/procurement_files/external_links/key_contacts/registration_level` 等字段与查单 `trade_no` 传参。

---

## 10. 建议处理清单（按优先级）

> 状态列已按第三轮复验（2026-07-24）更新：**待办已全部清零**。

| 状态 | 优先级 | 事项 | 位置 |
| --- | --- | --- | --- |
| ✅ 已修复 | 高 | 采购详情内**多套餐付费面板**已补回（`NoticePaymentPanel` + `useNoticePayment`，套餐动态拉取） | `features/procurement` |
| ✅ 已修复 | 高 | **"投标拆解建议"卡片**已补回 | `NoticeUnlockedDetails.tsx` |
| ✅ 已修复 | 高 | **CRM 线索跟进录入**已恢复落库（`addFollowUpLog` → `POST /api/leads/log` + 回写） | `features/crm`（`FollowUpLogPanel` / `useCrmData`） |
| ✅ 已修复 | 中 | **"核心信息已隐藏"遮罩**未解锁视觉表达已补回 | `NoticeDetail.tsx` |
| ✅ 已修复 | 中 | "我的订单/已解锁"账户弹窗内嵌 + 数量徽标/首条预览/刷新按钮已补齐 | `MyRecordsPanel.tsx` / `useRecordsSummary.ts` / `AuthModal.tsx` |
| ✅ 已修复 | 中 | 供应商自助入驻已补回（`SupplierRegisterModal` + `api.ts`） | `features/supplier` |
| ✅ 已修复 | 中 | CRM 机会订阅确认提示已补回（`subscribingOppMessage`） | `features/crm` |
| ✅ 结案 | 中 | `TrainingRegisterModal` 经确认为原版死代码（无引用），无需迁移 | `features/training` |
| ✅ 已修复 | 低 | 交付卡内 `notice.url` 原始链接已补回；`key_contacts` 兼容字符串/对象数组两形态 | `NoticeUnlockedDetails.tsx` |
| ✅ 已修复 | 低 | 全局 `types/procurement.ts` 成为 `NoticeItem` 单一事实源，feature 内 re-export | `types/procurement.ts` |
| ⏳ 保留 | 低 | 抽检新增 4 语言（fr/ru/es/ar）译文质量（人工事项，非代码差异） | `core/i18n/*.json` |

---

### 附：对比所用临时资料（位于 `.qoder/`，可在确认后清理）

- `.qoder/_origin_snapshot/`：origin/main 的 8 个原始单体源文件快照。
- `.qoder/_diff_new_remote_ui.patch`、`.qoder/_diff_new_remote_infra.patch`：`70aa6b2 → 8312f0c` 的 UI / 后端变更补丁。
