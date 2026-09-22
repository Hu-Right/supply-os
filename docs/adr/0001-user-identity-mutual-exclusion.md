# ADR-0001: 企业信息与供应商资源库互斥（先用先占）

- 状态：已接受（Accepted）
- 日期：2026-09-19
- 关联：设计文档《外贸员供应商资源库与 AI 智能匹配设计》的"资源库通用"原则（已废弃）、提交 6e73c166 / 839571bb

## 背景

原设计文档将"供应商资源库"定义为面向所有用户（企业 + 个人）的通用能力。随后产品决策变更（提交 6e73c166）：企业信息页与供应商资源库**互斥锁定、先用先占**——两者不可同时使用，且均给出"身份一旦选择不可转换"的引导。

但互斥规则此前只在**前端**执行（settings 页的 `bound` 检查、企业页的资源库检查），服务端 API 无任何校验：已绑定企业的账号直调 `POST /api/user/supplier-pool`、`POST /api/notices/[id]/ai-match`，或持有资源库的账号直调 `POST /api/user/enterprise`，均可绕过互斥。

## 决策

1. **服务端事实源**：
   - 已绑定企业 = `crm_users.supplier_id` 非空（与 `GET /api/user/enterprise` 的 `bound` 判定同一事实源）；
   - 已占用外贸员身份 = `crm_user_supplier_pool` 中存在记录。
2. **强制点**（新增 `src/lib/services/identity.ts`）：
   - `POST /api/user/supplier-pool`：已绑定企业 → 403 EC_FORBIDDEN；
   - `GET /api/user/supplier-pool`：已绑定企业 → 返回空列表（软约束，避免 `useHasSupplierPool` 全量请求制造 403 噪声）；
   - `POST /api/notices/[id]/ai-match`：已绑定企业 → 403（智能匹配基于资源库，仅外贸员可用；企业用户走既有单供应商 `ai-score`）；
   - `POST /api/user/enterprise`：资源库非空 → 403（需先清空资源库才能绑定企业）。
3. **文档回写**：本 ADR 取代原设计文档中"资源库通用：企业用户和个人用户均可使用"的原则；设计文档不再单独修改。

## 后果

- 正面：互斥规则在服务端闭环，绕过前端直调 API 不再可行；判定逻辑单点收敛于 `identity.ts`，后续身份规则演进只改一处。
- 负面：pool POST / ai-match POST / enterprise POST 各增加一次 `crm_users` / `crm_user_supplier_pool` 查询（均为索引点查，成本可忽略）。
- 中性：前端既有拦截保留（体验层先行提示），与服务端校验语义一致。

## 替代方案（已否决）

- 仅依赖前端拦截：已被证明可绕过，放弃。
- 引入独立 user_type 枚举做强绑定：`crm_users.registration_type` 已存在但语义为注册入口，改造影响面大；`supplier_id` 判定与既有 `bound` 语义一致，成本最低。
