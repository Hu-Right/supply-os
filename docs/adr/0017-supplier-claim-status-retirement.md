# ADR-0017：供应商「认领通过 / 审核通过」双字段收敛——退役 `supplier.claim_status`

- 状态：已接受，实施中（2026-11-11）
- 关联：`supplier`（供应商目录主表）、`supplier_claims`（认领流水）、`users.supplier_id`（绑定事实）
- 涉及仓库：`supply-os`（门户）、`intelligence-daily`（后台审核）
- 相关文档：[supplier-供应商目录主表](../数据库设计/supplier-供应商目录主表.md)

## 1. 背景

supplier 表历史上用两个标量列表达两种"通过"：

| 列 | 初始语义 | 实际消费 |
| --- | --- | --- |
| `verify_status` | 供应商资料/主体是否真实 | 门户目录可见性、认证徽章、统计墙、开放 API、换照闸口、KPI |
| `claim_status` | 供应商是否被认领 | 门户排他/倒计时/换照闸口、后台解绑按钮 |

2026-10-14「统一认领口径」后，后台 `approveClaim` 在通过认领时**同时**写
`claim_status='verified'` 与 `verify_status='done'`（绑定 + 认证一次放行），
两个字段从此事实同生共死。现网长期出现组合态异常：

- `approved` 认领 + `claim_status='verified'` + `verify_status='pending'`：门户判为
  `linked`（已绑定、可自助换绑），与"认领通过即永久绑定"冲突；
- 删除 approved 认领记录不回滚 `claim_status/verify_status`；
- 换表/回灌脚本按行替换，不保证两列一起恢复（2026-11-11 换表即丢失全部
  `license_url` 与部分状态）；
- `claim_status` 有 8 个写入口、`verify_status` 有 5 个写入口，没有任何单一函数
  保证"两列一起写"，违背单一事实源。

## 2. 决策

**`supplier` 行只保留一个状态标量：`verify_status`（语义：主体是否已核验 / 可否对外）；
认领状态不再落 supplier 行，改为从关系事实派生；`claim_status` 退役。**

- 归属事实：`supplier_claims.status='approved'`（认领审核结论 + 审计流水）
  ＋ `users.supplier_id`（当前绑定）。
- 派生口径（统一 SQL，两仓库共用）：

  ```sql
  -- 已归属（认领通过）
  EXISTS (SELECT 1 FROM supplier_claims c
           WHERE c.supplier_id = <supplier.id> AND c.status = 'approved')
  -- 认领处理中（排他期）
  EXISTS (SELECT 1 FROM supplier_claims c
           WHERE c.supplier_id = <supplier.id> AND c.status = 'pending')
  ```

- `verify_status` 仍由「认领通过 / 认证审核通过 / 补录 / 换照通过 / 管理员建档」
  写入 `done`；认领通过依旧连带认证放行（业务规则不变）。
- `claim_status` 在本轮**只退役代码读写**，物理列暂不 DROP；列删除另走一次
  人工确认的 DDL（见 §5），因为 `supplier` 为双仓库共享表。

## 3. 理由

1. **认领是关系不是属性**：主体 × 账号 × 多条历史，压成 supplier 单值列必然要
   双写、回滚、对账，组合态异常即由此产生。
2. **"已核验但未被认领"是合法状态**（管理员建档 / 批量导入主体），`claim_status`
   表达不了；`verify_status` 能同时表达 pending/done/rejected。
3. **改造面不对称**：留 `verify_status` 删 `claim_status` 仅需替换约 7 个读点；
   反向则要改门户目录/统计/开放 API/后台列表/认证审核等 20+ 读点，并丢失
   `rejected + check_note` 语义。
4. **派生模型更强**：`approved + verify pending`（认领已通过、认证待审）与
   `verify done + 无 approved`（已认证未认领）都能如实表达，无需额外列。

## 4. 影响面（已核对）

- 门户 `supply-os`：
  - `SupplierClaimRepo` 新增 `hasPendingClaim` / `hasApprovedClaim`；
  - `SupplierDirectoryRow` / `CompanyCandidateRow` / `BoundSubjectRow` 去
    `claim_status`；`PORTAL_COLUMNS` 去该列；
  - `enterprise-status` 分类器入参改为 `{ verifyStatus, hasPendingClaim }`；
  - 企业 GET 视图 `claimStatus` → `hasPendingClaim`；
  - 换照闸口 `verify done || hasApprovedClaim`；
  - `createClaimWithBinding` / `releaseExpiredClaims` / `withdrawBinding` 去掉
    `claim_status` 写。
- 后台 `intelligence-daily`：
  - `claim/service.ts` 全部 `claim_status` 写入删除；`pageClaims` 派生
    `supplier_claimed`；
  - `supplier/service.ts` 列表派生 `claimed` / `claim_pending`；
  - `os-user` 删号复位去掉 `claim_status`；
  - client `Supplier` / `SupplierClaim` 类型与「解绑」按钮条件改用派生字段。
- 数据前置（执行前必须先备份 `claim_status`；运维工具脚本已按交付要求删除，SQL 见 §5）：
  1. `approved` 认领且 `supplier_id IS NULL` → 按 `users.supplier_id` 回填；
  2. 有 `approved` 认领的主体 → `verify_status='done'`（对齐 10-14 口径）；
  3. 全表 `claim_status` 置 NULL（先导出留档）。
- 物理列与 `idx_claim_status`：暂留；DROP 见 §5。

## 5. 迁移顺序（强制）

### 5.0 部署顺序与跨版本兼容

**推荐顺序：门户先部署 → 后台后部署 → 数据修复 → 观察 → DROP。**

- **门户先**：门户新版只读 `supplier_claims` / `users`，完全忽略旧后台仍写入的
  `claim_status`；旧后台列表仍可正常显示（列还在），无排他/展示异常。
- **后台先的风险**：旧门户仍依赖 `claim_status` 判排他与企业分类。后台一旦停止回写
  `verified`，旧门户会看到该列停留在 `pending`，导致「审核中」卡死、排他期不释放。
  因此**禁止后台先于门户单独上线**；若必须同批发布，请两仓库同一窗口完成。
- **数据修复必须等两仓库都上线后再做**：第 3 步会清空 `claim_status`，
  旧代码若仍在读会丢失排他标记。
- **DROP 必须在观察期结束、两仓库确认零读写后执行。**

### 5.1 数据修复（按序执行，先备份）

```sql
-- 0) 备份（导出到文件留档，回滚依据）
SELECT id, claim_status FROM supplier WHERE claim_status IS NOT NULL ORDER BY id;

-- 1) approved 认领缺 supplier_id → 按当前绑定回填
UPDATE supplier_claims c
  JOIN users u ON u.id = c.user_id
  JOIN supplier s ON s.id = u.supplier_id
   SET c.supplier_id = u.supplier_id, c.updated_at = NOW()
 WHERE c.status = 'approved' AND c.supplier_id IS NULL AND u.supplier_id IS NOT NULL;

-- 2) approved 认领 ⇒ verify_status='done'（10-14 口径：认领通过即认证放行）
UPDATE supplier s
  JOIN (SELECT DISTINCT supplier_id FROM supplier_claims
         WHERE status='approved' AND supplier_id IS NOT NULL) a
    ON a.supplier_id = s.id
   SET s.verify_status = 'done'
 WHERE IFNULL(s.verify_status,'') <> 'done';

-- 3) 清空 claim_status（列暂留，仅去值）
UPDATE supplier SET claim_status = NULL WHERE claim_status IS NOT NULL;
```

### 5.2 观察期后 DDL（确认两仓库已无读写）

```sql
ALTER TABLE supplier DROP INDEX idx_claim_status;
ALTER TABLE supplier DROP COLUMN claim_status;
```

然后刷新结构基线：`npm run check:baseline`（门户 `db/schema/baseline.sql`）并更新
[supplier 文档](../数据库设计/supplier-供应商目录主表.md)。

## 6. 回滚

- 代码：回滚两仓库发布即可（列仍在，旧代码可继续读写）。
- 数据：用第 0 步导出的 `(id, claim_status)` 逐行回填（或从 `mysqldump` 恢复）：

  ```sql
  UPDATE supplier SET claim_status = ? WHERE id = ?;
  ```

- DDL：DROP 前必须先 `mysqldump` 留档；`supplier` 不在迁移账本内，DROP 后只能靠
  备份表/导出恢复。执行前确认当日备份存在。

## 7. 验证口径（只读 SQL）

```sql
-- 应为 0：approved 认领缺 supplier_id
SELECT COUNT(*) FROM supplier_claims WHERE status='approved' AND supplier_id IS NULL;
-- 应为 0：approved 认领指向不存在的 supplier
SELECT COUNT(*) FROM supplier_claims c LEFT JOIN supplier s ON s.id=c.supplier_id
 WHERE c.status='approved' AND c.supplier_id IS NOT NULL AND s.id IS NULL;
-- 应为 0（列 DROP 后本句会 1054，属预期）：claim_status 非 NULL
SELECT COUNT(*) FROM supplier WHERE claim_status IS NOT NULL;
-- 应为 0：approved 认领主体 verify_status 非 done
SELECT COUNT(*) FROM supplier s
 WHERE EXISTS (SELECT 1 FROM supplier_claims c WHERE c.supplier_id=s.id AND c.status='approved')
   AND IFNULL(s.verify_status,'') <> 'done';
-- 合法残留（登记数量）：已核验但无 approved 认领（管理员建档/迁移主体）
SELECT COUNT(*) FROM supplier s
 WHERE s.verify_status='done'
   AND NOT EXISTS (SELECT 1 FROM supplier_claims c WHERE c.supplier_id=s.id AND c.status='approved');
```

## 8. 未决事项

- 批量导入（2026-11-11 换表）后 `verify_status` 的默认值策略（当前绝大多数
  `pending`/`NULL`，是否统一视为"已核验"）属于产品口径，不在本 ADR 范围；
- `verify_status='NULL'` 在后台列表/开放 API 被视为"历史已通过"、门户不可见的分叉，
  需在数据口径确定后单独收敛。
