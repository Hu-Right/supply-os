# ADR-0005: 共享 UI 收编——9 变体 Button 与选择器控件

状态：已接受 · 日期：2026-08（依据代码注释与提交历史整理）

## 背景

各 feature 页面散落手写 `<button>`/`<input>`/`<select>`，样式与交互不一致；shadcn/ui 迁移完成后需要决定"哪些原生用法必须收编、哪些保留豁免"。

## 决策

1. `shared/ui/Button.tsx` 提供 **9 个变体**的主按钮，业务代码一律使用共享 Button（ADR-0005 核心）；
2. 选择器类交互收编为 4 个专用控件：`ToggleButton`（单选 chip）、`ChipToggleGroup`（多选 chip 组）、`SegmentedControl`（分段选择）、`SelectableCard`（可选中卡片）——这些是"手写 button 的正解归宿"，非豁免；
3. **豁免清单**：落地页（GREEN 主视觉区）与导航 tab 的装饰性 button 可保留原生实现，不强制收编；
4. Badge 采用 shape=pill/tag 双形态；表单原语走 shadcn Form + react-hook-form（rules + field-spread 约定）。

## 后果

- 业务代码中原生 button 从数十处收敛到豁免场景（落地页/导航/错误页重试）；
- 已知残留（见评估报告 C7）：`shared/ui` 缺 Textarea 组件、个别文件 Button 与原生 button 混用，按批次修复；
- 新增选择器需求时先查 4 件套，避免再造私有 chip 组。
