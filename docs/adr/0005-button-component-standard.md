# ADR-0005: 按钮组件规范（统一使用共享 Button）

- **状态**：已接受
- **日期**：2026-08-29
- **背景**：全站曾存在 100+ 处手写 `<button>`，同一语义按钮有数十种
  padding/圆角/字重组合，且出现 `slate-205`/`teal-650` 等拼错色类。

## 决策

**新增按钮一律使用 `src/shared/ui` 的 `<Button>`**（shadcn/ui 形态：
Radix Slot + cva，源码所有权在本仓库）。

### 变体词汇表（语义对齐站点设计语言）

| variant | 视觉 | 语义 |
|---|---|---|
| `primary` | teal-600 实底 | 品牌主行动点 |
| `dark` | slate-900 实底 | 深色主 CTA（表单提交等） |
| `secondary` | slate-100 浅底 | 次要操作 |
| `ghost` | 透明 + hover 浅底 | 弱化操作 |
| `outline` | slate-200 边框 | 取消/辅助 |
| `danger` | rose-600 | 破坏性操作 |
| `accent` | amber-500 | 醒目提示行动点（客服/升级） |
| `cta` | teal 渐变 | 营销转化（AI 匹配/升级确认） |
| `link` | teal 文字链 | 内联链接动作 |

尺寸：`sm/md/lg` + `icon`（h-9 方形）/`iconSm`（h-7，图标按钮必须配 aria-label）。

### 布局差异处理

布局覆盖（w-full、rounded-xl、py-3、font-black 等）通过 `className` 传入，
`cn()`/tailwind-merge 保证冲突类被正确覆盖——**不要因此新建变体**。
仅当出现新的**语义**（而非布局）时才扩展 cva 配置。

### 明确豁免（不属于"按钮"）

- Tab/选择器控件（条件激活态模板）：导航 tab、语言网格、支付方式选择
- 研修班落地页品牌按钮（`shared/constants/colors` 的 #0CAF8C 家族，属落地页设计系统）
- 渐变装饰按钮若语义不属于转化 CTA

## 后果

- 设计变更一处生效全局；disabled/loading/focus-ring/asChild 能力继承
- 评审时出现新手写 `<button className="bg-slate-900...">` 应要求改为 `<Button>`
