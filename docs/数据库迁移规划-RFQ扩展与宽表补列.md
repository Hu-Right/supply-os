# 数据库迁移规划文档

> **创建日期**: 2026-09-09  
> **适用环境**: MySQL 8.0+  
> **执行策略**: 低峰期执行，每步独立可回滚

---

## 一、迁移 01：crm_notice_search 宽表添加 published_date

### 背景

采购公告的"发布时间"字段 `published_date` 存在于主表 `crm_bid_notices` 中，但宽表 `crm_notice_search` 缺少该列，导致前端只能回退使用 `create_time`（数据录入时间）而非真实发布日期。

### DDL

```sql
ALTER TABLE crm_notice_search
  ADD COLUMN published_date VARCHAR(50) DEFAULT NULL
    COMMENT '公告发布日期（同步自 crm_bid_notices.published_date）'
    AFTER documents_count;
```

### 回填

```sql
-- 从主表回填已有数据
UPDATE crm_notice_search ns
INNER JOIN crm_bid_notices n ON n.id = ns.id
SET ns.published_date = n.published_date
WHERE n.published_date IS NOT NULL AND ns.published_date IS NULL;
```

### 代码联动

- `src/lib/services/search-sync/wide-row-builder.ts`：`WIDE_SYNC_SELECT` 已加入 `n.published_date`，`buildWideRow` 和 `upsertWideRows` 已包含该字段
- 宽表增量同步会自动填充新行的 `published_date`

### 注意事项

- ⚠️ 此 ALTER TABLE 在 `crm_notice_search`（大表）上执行，**必须使用 `ALGORITHM=INPLACE`**，避免 COPY 重建
- ⚠️ 在低峰期执行（凌晨），执行前确认无其他 DDL 或长事务持有元数据锁
- 如遇到锁等待，参考历史经验：`SHOW PROCESSLIST` 查阻塞源 → `KILL` 阻塞进程 → 重试

---

## 二、迁移 02：crm_bid_notices 主表 RFQ 扩展字段

### 背景

需求广场（`/rfq`）目前使用 8 条硬编码 Mock 数据。计划将其接入真实数据源 `crm_bid_notices`，统一展示爬虫公告和买方发布的 RFQ 需求。为此需要在主表上增加 RFQ 专属字段，通过 `source_type` 区分数据来源。

### 设计原则

- **零影响爬虫数据**：所有新列对现有爬虫数据为 NULL 或安全默认值
- **INSTANT DDL**：MySQL 8.0.12+ 支持末尾加列元数据操作，毫秒级完成
- **最小存储开销**：10 万行新增约 2 MB（NULL 列不占空间）

### DDL

```sql
ALTER TABLE crm_bid_notices
  -- 1. 数据来源标识（核心列）
  ADD COLUMN source_type VARCHAR(16) NOT NULL DEFAULT 'scraped'
    COMMENT '数据来源: scraped=爬虫公告, rfq=买方发布',

  -- 2. 发布人信息
  ADD COLUMN publisher_user_id BIGINT UNSIGNED DEFAULT NULL
    COMMENT 'RFQ发布人 user_id（爬虫数据为 NULL）',
  ADD COLUMN publisher_company VARCHAR(128) DEFAULT NULL
    COMMENT 'RFQ发布企业名',

  -- 3. 采购类型
  ADD COLUMN purchase_type VARCHAR(16) DEFAULT NULL
    COMMENT '采购类型: once=单次, framework=框架, longterm=长期',

  -- 4. 预算扩展（estimated_value 已有，新增保密标记和币种）
  ADD COLUMN budget_confidential TINYINT(1) DEFAULT 0
    COMMENT '预算是否保密（1=前端显示"预算保密"）',
  ADD COLUMN budget_currency VARCHAR(8) DEFAULT 'USD'
    COMMENT '预算币种',

  -- 5. 交付地点
  ADD COLUMN delivery_province VARCHAR(64) DEFAULT NULL
    COMMENT '交付省份',
  ADD COLUMN delivery_city VARCHAR(64) DEFAULT NULL
    COMMENT '交付城市',
  ADD COLUMN delivery_district VARCHAR(64) DEFAULT NULL
    COMMENT '交付区/县',
  ADD COLUMN delivery_address VARCHAR(255) DEFAULT NULL
    COMMENT '详细交付地址',

  -- 6. 商务条款
  ADD COLUMN incoterm VARCHAR(16) DEFAULT NULL
    COMMENT '贸易术语: EXW/FOB/CIF/DDP 等',
  ADD COLUMN delivery_time VARCHAR(64) DEFAULT NULL
    COMMENT '交付时间要求',
  ADD COLUMN payment_terms VARCHAR(255) DEFAULT NULL
    COMMENT '付款方式',

  -- 7. 发布设置
  ADD COLUMN visibility VARCHAR(16) DEFAULT 'public'
    COMMENT '可见性: public=公开, targeted=定向',
  ADD COLUMN supplier_requirements VARCHAR(512) DEFAULT NULL
    COMMENT '供应商资质要求',

  -- 8. 联系人信息
  ADD COLUMN contact_name VARCHAR(64) DEFAULT NULL
    COMMENT '联系人姓名',
  ADD COLUMN contact_email VARCHAR(128) DEFAULT NULL
    COMMENT '联系邮箱',
  ADD COLUMN contact_phone VARCHAR(32) DEFAULT NULL
    COMMENT '联系电话',

  -- 9. RFQ 响应计数
  ADD COLUMN response_count INT UNSIGNED DEFAULT 0
    COMMENT '供应商响应数（仅 RFQ 来源使用）',

  ALGORITHM=INSTANT;
```

### 索引

```sql
-- 需求广场按来源 + 状态筛选
ALTER TABLE crm_bid_notices
  ADD INDEX idx_source_type (source_type, is_active, deadline_sec),

  -- 查看"我发布的需求"
  ADD INDEX idx_publisher_user (publisher_user_id, create_time DESC);
```

### 新增列对现有数据的影响

| 新列 | 爬虫数据的值 | 存储开销（10 万行） |
|------|------------|-------------------|
| `source_type` | `'scraped'`（DEFAULT） | ~0.76 MB |
| `publisher_user_id` | NULL | 0 MB |
| `publisher_company` | NULL | 0 MB |
| `purchase_type` | NULL | 0 MB |
| `budget_confidential` | `0`（DEFAULT） | ~0.1 MB |
| `budget_currency` | `'USD'`（DEFAULT） | ~0.38 MB |
| `delivery_province` ~ `delivery_address` | NULL × 4 | 0 MB |
| `incoterm` ~ `payment_terms` | NULL × 3 | 0 MB |
| `visibility` | `'public'`（DEFAULT） | ~0.67 MB |
| `supplier_requirements` | NULL | 0 MB |
| `contact_name` ~ `contact_phone` | NULL × 3 | 0 MB |
| `response_count` | `0`（DEFAULT） | ~0.38 MB |
| **合计** | | **~2.3 MB** |

### 可选：budget_currency 回填

```sql
-- 从 estimated_value 中提取币种（非必须，前端可直接解析字符串）
UPDATE crm_bid_notices
SET budget_currency = CASE
  WHEN estimated_value LIKE 'EUR%' THEN 'EUR'
  WHEN estimated_value LIKE 'CNY%' OR estimated_value LIKE 'RMB%' THEN 'CNY'
  WHEN estimated_value LIKE 'GBP%' THEN 'GBP'
  WHEN estimated_value LIKE 'SAR%' THEN 'SAR'
  WHEN estimated_value LIKE 'AED%' THEN 'AED'
  WHEN estimated_value LIKE 'JPY%' THEN 'JPY'
  ELSE 'USD'
END
WHERE estimated_value IS NOT NULL AND estimated_value != '';
```

---

## 三、字段使用对照表

### 各页面/功能使用的字段

| 功能 | 使用的字段 | 数据来源 |
|------|-----------|----------|
| 首页-今日热门商机 | `title`, `country`, `agency`, `deadline_sec`, `estimated_value`, `is_featured` | `source_type='scraped'` |
| 首页-最新 RFQ 询价 | `title`, `country`, `agency`, `deadline_sec`, `estimated_value` WHERE `notice_type='RFQ'` | `source_type='scraped'` |
| 需求广场列表 | `title`, `country`, `deadline_sec`, `estimated_value`, `purchase_type`, `response_count`, `is_featured`, `source_type` | 混合 |
| /procurement 搜索 | 全字段 + Meilisearch | 混合 |
| 公告详情页 | 全字段（付费解锁 `description`, `documents`） | 混合 |
| RFQ 发布表单提交 | 全部新增字段 | `source_type='rfq'` |

### RFQ 表单字段 → 数据库列映射

| 表单字段（RfqFormState） | 数据库列 | 说明 |
|--------------------------|---------|------|
| `title` | `title` | 已有 |
| `categoryL1/L2` | `unspsc_codes`（关联查询） | 已有 |
| `purchaseType` | `purchase_type` | **新增** |
| `description` | `description` | 已有 |
| `budgetMin/Max` | `estimated_value`（单值） | 已有，简化为固定金额 |
| `currency` | `budget_currency` | **新增** |
| `budgetConfidential` | `budget_confidential` | **新增** |
| `provinceName` | `delivery_province` | **新增** |
| `cityName` | `delivery_city` | **新增** |
| `districtName` | `delivery_district` | **新增** |
| `address` | `delivery_address` | **新增** |
| `incoterm` | `incoterm` | **新增** |
| `deliveryTime` | `delivery_time` | **新增** |
| `paymentTerms` | `payment_terms` | **新增** |
| `deadline` | `deadline_ts` | 已有 |
| `visibility` | `visibility` | **新增** |
| `supplierReqs` | `supplier_requirements` | **新增** |
| `attachments` | `documents` | 已有 |
| `contactName` | `contact_name` | **新增** |
| `contactEmail` | `contact_email` | **新增** |
| `contactPhone` | `contact_phone` | **新增** |

---

## 四、对现有功能的影响评估

| 现有功能 | 影响 | 处理方式 |
|----------|------|----------|
| 爬虫数据写入 | 无 | `source_type` 默认 `'scraped'`，其他新列 NULL |
| 宽表同步 | 暂不扩展 | `WIDE_SYNC_SELECT` 暂不加新列，后续按需 |
| Meilisearch 索引 | 暂不扩展 | 新列未加入索引，后续按需 |
| 搜索编排器 | 暂不扩展 | 查询条件不变，后续按需加 `source_type` 过滤 |
| 首页三栏 | 无 | 继续使用现有字段 |
| `/procurement` 列表 | 无 | 继续使用现有字段 |
| 公告详情页 | 需扩展 | RFQ 来源时显示额外字段（联系人、交付地点等） |
| 需求广场 | **需改造** | 从 Mock 数据切换为调用 API 读 `crm_bid_notices` |

---

## 五、执行顺序与回滚方案

### 执行顺序

```
步骤 1: 迁移 01 — crm_notice_search 添加 published_date
步骤 2: 迁移 02 — crm_bid_notices 添加 RFQ 扩展字段 + 索引
步骤 3: （可选）budget_currency 回填
步骤 4: 前端需求广场接入真实 API
```

### 回滚方案

```sql
-- 回滚迁移 01
ALTER TABLE crm_notice_search DROP COLUMN published_date;

-- 回滚迁移 02（索引自动随列删除）
ALTER TABLE crm_bid_notices
  DROP COLUMN response_count,
  DROP COLUMN contact_phone,
  DROP COLUMN contact_email,
  DROP COLUMN contact_name,
  DROP COLUMN supplier_requirements,
  DROP COLUMN visibility,
  DROP COLUMN payment_terms,
  DROP COLUMN delivery_time,
  DROP COLUMN incoterm,
  DROP COLUMN delivery_address,
  DROP COLUMN delivery_district,
  DROP COLUMN delivery_city,
  DROP COLUMN delivery_province,
  DROP COLUMN budget_currency,
  DROP COLUMN budget_confidential,
  DROP COLUMN purchase_type,
  DROP COLUMN publisher_company,
  DROP COLUMN publisher_user_id,
  DROP COLUMN source_type;

-- 删除索引
ALTER TABLE crm_bid_notices
  DROP INDEX idx_source_type,
  DROP INDEX idx_publisher_user;
```

---

## 六、执行检查清单

- [ ] 确认当前无长事务或 DDL 持有元数据锁（`SHOW PROCESSLIST`）
- [ ] 在低峰期执行（建议凌晨 2:00-5:00）
- [ ] 先在测试库执行，验证无报错
- [ ] 执行迁移 01 后验证：`SELECT published_date FROM crm_notice_search LIMIT 5`
- [ ] 执行迁移 02 后验证：`SELECT source_type, COUNT(*) FROM crm_bid_notices GROUP BY source_type`
- [ ] 验证现有 API 不受影响：访问 `/procurement`、首页、公告详情页
- [ ] （可选）执行 budget_currency 回填
- [ ] 前端需求广场切换为真实 API
