# ADR-0018：KPI 翻转时点收敛到「认领通过」，并收口认证审核旁路

- 状态：已接受，实施中（2026-11-11）
- 关联：[ADR-0017 认领/审核双字段收敛](./0017-supplier-claim-status-retirement.md)、`user_type`（注册 KPI 个人/企业）、`supplier_claims`、`supplier.verify_status`
- 涉及仓库：`intelligence-daily`（后台，本 ADR 的全部代码改动）；`supply-os`（门户，仅文档/口径说明）

## 1. 背景

2026-10-14「统一认领口径」后，所有用户绑定企业都必须先立认领单；因此**「认领通过」是用户从个人转为企业（`users.user_type` personal→enterprise）的唯一业务事件**。

但后台历史上把 KPI 翻转挂在三个入口（`approveVerify` / `approveClaim` / `backfillClaim`），并且存在两条绕过认领审核的旁路：

1. 供应商列表 →「认证审核」通过（`approveVerify`）：可直接把 `verify_status` 置 `done` 并翻 KPI，**不经过认领审核**；
2. 供应商列表 →「编辑」弹窗里的「认证状态」下拉框：管理员可直接选 `done`，**绕过审核动作**（不翻 KPI，但造成"已认证但 KPI 未翻"或"已认证但认领仍 pending"的半通过态）。

同时存在「供应商库里没有、用户新建主体」的场景：门户新建 `supplier(verify_status='pending', source_channel='self_register')` + 认领单，后台认领审核页却按"认领已有主体"设计（只展示公司名/账号/执照 + 匹配供应商），看不到用户提交的资料，也没有重复行处理策略。

## 2. 决策

### 2.1 KPI 翻转时点

- **唯一翻转事件：认领通过** —— `approveClaim` 与存量补录 `backfillClaim`（补录等价于人工背书的认领通过）。
- `approveVerify` **不再**调用 `convertSupplierBoundUsers`；认证审核只落认证标。
- `approveLicenseChange`（换照通过顺带补认证）、`createSupplier`（建档即 done）、`updateSupplier`（手工改状态）均不翻 KPI。
- `unbindSupplier` / 删除用户**不回滚** `user_type`（保持既有"单向不回滚"语义）。

### 2.2 认证审核入口守卫

`approveVerify` 遇到该主体存在 `status='pending'` 的认领时，返回 409：

> 该供应商存在待审核认领，请到「供应商认领审核」页通过；认证审核入口不再单独放行认领中的主体。

没有 pending 认领的主体（管理员建档、迁移数据）仍可通过认证审核独立完成认证；但**不会**因此翻 KPI——KPI 只认认领通过。

### 2.3 编辑直改认证状态守卫

`updateSupplier` 中，若请求修改 `verify_status` 且新旧值不同：

- 该主体存在绑定账号（`users.supplier_id`）**或**存在任意认领记录（`supplier_claims`）→ 409，提示走认领审核/认证审核；
- 无归属主体（管理员建档/迁移）仍允许手工维护；
- 新旧值相同视为 no-op 放行。

后台客户端「编辑供应商资料」弹窗的「认证状态」下拉框对有归属主体（`claimed || claim_pending`）禁用并提示。

### 2.4 「用户新建主体」纳入认领审核

不为新建场景增加第二套审核流程，仍走**认领审核一个入口**，但补三件事：

1. **展示**：`pageClaims` 返回用户提交的企业资料（信用代码、法人、地址、联系人/电话/邮箱、来源渠道、当前认证状态）与派生标记 `is_self_registered`；后台认领审核通过弹窗对「新建主体」展示这些只读信息 + 执照预览，并打类型标签。
2. **去重**：保留「搜索并选择库内供应商」改选能力。若管理员把新建单改选为已有供应商，通过后**条件安全清理**用户新建的重复行：
   ```sql
   DELETE s FROM supplier s
    WHERE s.id = ?
      AND s.source_channel = 'self_register'
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.supplier_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM supplier_claims c WHERE c.supplier_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM supplier_backbone_interests i
                       WHERE i.supplier_table='supplier' AND i.supplier_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM user_supplier_pool p WHERE p.supplier_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM supplier_diagnosis d WHERE d.supplier_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM supplier_industry_rel r WHERE r.supplier_id = s.id)
   ```
   条件不满足（已有其他绑定/认领/画像/资源库/诊断/行业关系引用）时保留，由管理员在供应商列表手工处理；接口返回 `originalSupplierId` / `mergedFromSupplierId` 供前端提示。
3. **驳回**：`rejectClaim` 只解除临时绑定、认领置 `rejected`，**用户新建的 supplier 行保留留档**（不可见；靠 `source_channel='self_register'` + 无认领/无绑定可识别），不做删除；后续可另设孤儿行清理任务。

### 2.5 与 ADR-0017 的关系

- `supplier` 行仍只有一个状态标量 `verify_status`；认领状态由 `supplier_claims` + `users.supplier_id` 派生。
- 新建主体通过后依旧写同一套字段：认领 `approved`、`verify_status='done'`、账号回链、KPI 翻转。

## 3. 影响面

| 位置 | 变化 |
|---|---|
| `server/src/modules/supplier/service.ts` | `approveVerify` 去 KPI + pending 认领守卫；`updateSupplier` 加认证状态直改守卫 |
| `server/src/modules/supplier/claim/service.ts` | `pageClaims` 返回提交资料/`is_self_registered`；`approveClaim` 返回 `originalSupplierId`/`mergedFromSupplierId` 并条件清理重复新建行；注释补驳回保留语义 |
| `server/src/modules/supplier/service.test.ts`（新增/扩展） | 认证审核守卫、编辑直改守卫用例 |
| `server/src/modules/supplier/kpiConvert.ts` / `.test.ts` | 注释与断言改为"approveVerify 不翻 KPI" |
| `client/src/services/supplierClaimApi.ts`、`client/src/views/supplier/SupplierClaims.vue`、`SupplierList.vue` | 类型/弹窗展示/编辑禁用与提示 |

## 4. 兼容与风险

- **纯行为/展示改动，无 DDL、无数据迁移**；已完成的认领与 KPI 不受影响。
- 历史遗留：若某用户曾被 `approveVerify` 翻过 KPI 而认领未通过，本次不回滚（单向语义）；可按需人工核对。
- `updateSupplier` 校验不通过时返回 409（非 500），前端直接展示提示。
- 条件清理重复行可能留下无引用的执照文件（`upload_files` 字节），属既有"只登记不删字节"审计口径，不在本轮处理。

## 5. 验证

- 后台单测：`approveVerify` 有 pending 认领 → 409 且不写；无 pending → 只写 done、不翻 KPI；`updateSupplier` 有绑定/认领 → 409，无归属放行；`approveClaim` 改选时清理条件删除、返回 merged id。
- 类型检查：`tsc -p server`、`vue-tsc -p client`。
- 手工验收（发布后）：
  1. 认领审核通过 → 用户 `user_type` 翻企业；
  2. 有 pending 认领的主体在供应商列表点认证审核 → 409 提示；
  3. 有归属主体在编辑弹窗 → 认证状态不可改；
  4. 新建主体审核弹窗显示提交资料；改选已有供应商通过后，重复新建行被清理且提示。
