# ADR-0022：供应商诊断 V3 —— 同表演进 + 影子换表，资质分级与投标能力分分离

- 状态：已接受（2026-11-23）
- 关联：ADR-0003（影子表蓝绿迁移）、ADR-0016（买家实体 SSOT）、迁移 069（`069-supplier-diagnosis-v3-shadow`）
- 涉及仓库：`supply-os`（供应商诊断提交链、认证字典、企业能力档案）

## 1. 背景

V2 诊断（19 题 / 10 维度 / 100 分）回答的是「这家企业**会不会**投国际公共采购」。客户与运营反复提的是另一个问题：**「我打算投欧盟 / 沙特 / 美国，还缺哪些准入资质？」**

V2 结构答不了这个问题：

- 表单里没有任何「我想投哪里」的输入，报告只能给通用能力短板，无法落到「该市场还差哪张证书」；
- 认证字典（`supplier_certifications`）已有 `scope`（EU / UK / US / SA / …）与 `category`（含 `market_access` / `product_safety`），企业能力档案也已在 `value_json.code` 存了证书快照——**数据齐了，缺的是把它们对起来的那一层**；
- 「投标意愿」题（`bid_willingness`）在实践中恒为「是」：用户既然填到第 19 题，本就是想投标。这道题只在给线索打标，不参与计分（`dimensionNo = 0`）。

## 2. 决策（2026-11-23 用户拍板三条口径）

### 2.1 在 V2 基础上升级，同表演进

不新开 `supplier_diagnosis_v3` 表，而是在原表上换表升级（影子表 → 整表复制 → 双表 RENAME → 旧表归档 `z_retired_supplier_diagnosis_v2`，沿 ADR-0003 与迁移 013 先例）。

- 好处：路由/仓储/成绩单/AI 画像的读面路径全不变；回滚只需把两张表的名字改回来；
- 代价：换表是一次原子 DDL，窗口内不能有并发写；本期在低峰执行。

### 2.2 强制登录态不变（`user_id` 保持 NOT NULL，无免登录）

V3 不引入匿名诊断。诊断报告属于**公司**（一司一份，`uk_supplier`），但提交人必须留痕：改谁写的、谁覆盖的，靠 `user_id`；匿名提交会让「路人写了无主主体的报告」变成常态，与写权闸口（ADR 既有口径）冲突。

### 2.3 表单只新增「目标市场」一题；缺口明细进报告，不在表单展开

- 表单新增 `target_markets`（多选，入库值 = 认证字典的 `scope` 码：EU / UK / US / CA / EAEU / GCC / SA / AU / NZ / JP / KR / IN / BR / TH / ID / NG，共 16 个；`global` 不是市场，刻意排除——否则每个市场都会白送一条应备项）；
- **不**在表单里逐项问「你有没有 CE / 你有没有 UKCA」：那会把 19 题变成 30+ 题，且用户本来就要在能力档案里维护证书。缺什么、差几项，在报告里呈现；
- 界面显示本地化市场名，**入库仍是 code**（`optionLabelKeys` → `diagMarket*` 七语键）；V2 全部题目的「显示值 == 存储值」不变式不受影响。

### 2.4 「投标意愿」题下线，列保留

`bid_willingness` 从表单移除（`askInForm: false`），列保留 `NOT NULL DEFAULT '是'`：

- 新行吃 DEFAULT，写路径**不出现该列**（`INSERT/UPDATE` 都不带），老行的历史值也不会被下一次提交覆盖；
- AI 画像契约（`supplier-profile.ts` → `diagnosisColumnSelect`）仍读该列——**零契约改动**，所以 `DIAGNOSIS_FIELDS`/`DIAGNOSIS_COLUMNS` 保持 19 项不动，V3 字段放在独立的 `DIAGNOSIS_QUAL_FIELDS`。

### 2.5 资质分级与 100 分分离

| 输出 | 口径 | 是否随目标市场变化 |
|---|---|---|
| `score_total` / `score_grade` | V2 十维度投标能力线，满分 100 | 否 |
| `qual_grade` | V3 资质分级 A/B/C | 是 |

理由：两者混成一个分会造成两个后果——同一家公司换个目标市场分就变；历史 V2 报告与 V3 报告不可再比。故 `qual_grade` 单独一列，`score_total` 口径**不动**。

### 2.6 资质分级规则（唯一实现在 `lib/services/scoring/diagnosis-qualification`）

1. **应备清单** `required(M)` ＝ 字典中 `category ∈ {market_access, product_safety}` 且 `scope` 命中市场 M 的行（`scope` 支持逗号多值与大小写；`global` 不计入任何市场）；
2. **缺口** ＝ `required − 已持`（已持取 `enterprise_capability_items.capability_type='certification'` 的 `value_json.code`，双方 code 归一为「去空白 + 大写」）；
3. **分级**：缺 0 项 = **A（可立即入驻）**；缺 1~2 项 = **B（补齐即可）**；缺 ≥3 项 = **C（需系统建设）**；
4. **未选目标市场 = 未分级（NULL）**，不臆造 C 级；`qual_scored_at` 同时保持 NULL，「没填」与「某时刻评过分」在数据上可区分；
5. **字典里该市场没有准入证书** → 记 `noRequirementMarkets`，不算缺口（否则小市场天然 C 级）；
6. 多市场缺同一张证书**只计一个缺口**（否则勾得越多分越低）。

### 2.7 降级：字典/能力档案读失败不让提交失败

提交是用户主动动作，主体与评分都还健康，因为一张字典表读不到就 500，用户会以为「提交不了」。此时 `qual_grade` 落 NULL、`qualBreakdown.unscoredReason = "dict_unavailable"`，报告侧写「资质分级暂不可用」，**不假装 A/B/C**。

## 3. 数据与契约变更

| 项 | 变更 |
|---|---|
| `supplier_diagnosis` | +`target_markets`、+`qual_grade`、+`qual_breakdown`、+`qual_scored_at`；`schema_version` 默认 3；`bid_willingness` 加 `DEFAULT '是'`；既有列一列不删（`report_ai` 为历史遗留列，先探测再整列复制，老库没这列则自动跳过） |
| 历史行 | 整表复制时 `schema_version` 原值保留（老 23 条仍为 2），**不互比不重算** |
| `POST /api/supplier-diagnosis` | 响应 +`schemaVersion` +`qualGrade` +`qualBreakdown`（集成测试的响应键集合白名单已同步登记） |
| `GET /api/supplier-diagnosis/mine` | 行 +`qualGrade` / `qualBreakdown`（回显带出资质分级） |
| 认证字典 | 新增内部方法 `listActiveCertificationsWithScope()`；`scope` **不进** `/api/certifications` 公开契约 |
| AI 画像 | 不变（列清单仍 19 项，仍含 `bid_willingness`） |

## 4. 后果

- 结构基线（`db/schema/baseline.sql`）需在换表执行后重导一次，否则 `check:baseline` 会报漂移；
- 运营/报告侧若要出「资质缺口清单」，读 `qual_breakdown`（逐市场 `required[].held`）即可，不必重算；
- 历史 V2 报告没有 `qual_grade`（NULL），成绩单公开面不受影响（只读 `score_*`）；
- `diagWillingnessNotScored` 等旧文案键暂留（无引用），下次 i18n 清理批次一并删除。

## 5. 回滚

```sql
RENAME TABLE supplier_diagnosis TO z_failed_supplier_diagnosis_v3,
             z_retired_supplier_diagnosis_v2 TO supplier_diagnosis;
```

代码侧回滚到迁移 069 之前的提交即可——V3 字段全部在新增列上，V2 读面不依赖它们。
