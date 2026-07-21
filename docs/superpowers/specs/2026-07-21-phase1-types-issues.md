# Phase 1 类型拆分 — 问题记录与决策

> **日期：** 2026-07-21  
> **关联：** `docs/superpowers/plans/2026-07-21-frontend-modular-refactor-plan.md`

---

## 一、`MembershipPlan` / `MembershipStatus` 放错层级

### 问题

初始拆分时，将 `MembershipPlan` 和 `MembershipStatus` 放在了 `types/procurement.ts`。但会员是全局领域实体，采购模块只是消费者中使用配额校验，会员本身不属于采购领域。

### 决策

**新建 `types/membership.ts`**，将 `MembershipPlan`（→ `MembershipProductPlan`）和 `MembershipStatus` 移入。`procurement.ts` 只保留 `NoticeItem`、`NoticeResponse`。

---

## 二、`PaymentPlan` 与 `MembershipPlan` 命名混淆

### 问题

存在两个高度相似但来源不同的"套餐"类型：

| 类型 | 来源 | 原始字段数 | 视角 |
|------|------|-----------|------|
| `PaymentPlan` | `payment/types.ts` | 10 | 支付/订单视角 |
| `MembershipPlan` | `ProcurementNoticesPool.tsx` | 11 | 业务/商品视角 |

两者描述的是同一个业务对象（会员套餐），但视角不同、字段略有差异（`MembershipPlan` 多了 `free_quota`）。原始命名无法区分用途，且 `App.tsx` 中还有一个内联的 4 字段简化版类型。

### 分析

- `PaymentPlan` 定义了但几乎没被前端实际引用，`App.tsx` 自己写了一个 `{ code; name; price; currency }` 的简化版
- `MembershipPlan` 从 `/api/membership/plans` 接口获取，用于列表渲染和用户选择
- 不是重复定义，是同一实体在不同阶段的表现形式

### 决策（方案 B：保留两个，命名明确区分）

| 新命名 | 含义 | 位置 |
|--------|------|------|
| `MembershipProductPlan` | 可购买的会员套餐（商品目录、前端展示） | `types/membership.ts` |
| `PaymentOrderPlan` | 支付订单中关联的套餐信息（下单快照） | `types/payment.ts` |

---

## 三、`PaymentStrategy` 是后端接口，不应在前端 types 中

### 问题

`payment/types.ts` 中的 `PaymentStrategy` 包含 `createPaymentUrl()`、`verifyCallback()`、`queryOrderStatus()` 方法定义。这是后端 `PaymentService` 的策略接口，属于 `server.ts` 的代码。前端 types 只应保留纯数据类型。

### 决策

从 `types/payment.ts` 中**删除** `PaymentStrategy`。后端文件 `AlipayProvider.ts`、`WechatProvider.ts`、`MockProvider.ts` 是 `server.ts` 的策略实现，计划在 Phase 2.4 中移出 `src/` 目录。

---

## 四、`lead.ts` + `opportunity.ts` 过小

### 问题

`Lead`（17 行）和 `Opportunity`（14 行）都是 CRM 领域，单独文件值很低。

### 决策

**合并为 `types/crm.ts`**，同时包含 `Lead` 和 `Opportunity`。删除 `lead.ts` 和 `opportunity.ts`。

---

## 调整后最终结构

```
src/types/
├── index.ts              # barrel 统一导出
├── auth.ts               # AuthUser
├── exhibition.ts         # ExhibitionHall
├── supplier.ts           # Supplier
├── crm.ts                # Lead + Opportunity
├── learning.ts           # LearningMaterial + FAQItem
├── membership.ts         # MembershipProductPlan + MembershipStatus
├── payment.ts            # 支付纯数据（PaymentOrderPlan 等，无 PaymentStrategy）
└── procurement.ts        # NoticeItem + NoticeResponse
```
