---
kind: frontend_style
name: Tailwind CSS v4 + 设计令牌体系
category: frontend_style
scope:
    - '**'
source_files:
    - src/index.css
    - vite.config.ts
    - package.json
    - src/main.tsx
---

## 样式系统概览

本项目采用 **Tailwind CSS v4**（`@tailwindcss/vite`）作为唯一的前端样式方案，通过 Vite 插件链集成，无传统 CSS-in-JS、CSS Modules 或第三方 UI 组件库。所有视觉样式均基于原子化类名与集中式设计令牌实现。

## 核心文件与依赖

- `src/index.css`：全局入口，仅包含 Tailwind 导入与 `@theme` 设计令牌定义
- `vite.config.ts`：注册 `@tailwindcss/vite` 插件，配置 `@` 路径别名指向 `src`
- `package.json`：声明 `tailwindcss@^4.1.14`、`@tailwindcss/vite@^4.1.14`、`autoprefixer`、`lucide-react`（图标）、`motion`（动画）
- `src/main.tsx`：在应用启动时 `import './index.css'` 注入全局样式

## 设计令牌与主题策略

通过 Tailwind v4 的 `@theme` 块集中声明语义化颜色令牌，形成三层色彩体系：

| 语义层 | 色板 | 用途 |
|---|---|---|
| primary | teal (`#14b8a6` → `#0f766e`) | 主品牌色，用于按钮、高亮、渐变 |
| secondary | slate (`#f8fafc` → `#0f172a`) | 中性灰阶，背景/边框/文字层级 |
| accent | amber (`#fffbeb` → `#f59e0b`) | 警告/强调/徽章等警示场景 |

这些令牌通过 `--color-primary-*`、`--color-secondary-*`、`--color-accent-*` CSS 变量暴露，可在任意组件中以 `bg-primary-500`、`text-secondary-900` 等形式消费，无需在 JS 中维护映射表。

## 布局与响应式约定

- 根容器使用 `min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans` 建立基础排版基线
- 响应式断点统一使用 Tailwind 内置前缀（`sm:`、`md:`、`lg:`），如 `px-4 sm:px-6 lg:px-8` 控制内容区宽度
- 导航栏采用 `sticky top-0 z-40 backdrop-blur-md bg-white/95` 实现毛玻璃吸顶效果
- 移动端通过 `hidden md:block` / `md:hidden` 切换桌面/移动双布局
- 间距、圆角、阴影全部走 Tailwind 原子类（`rounded-xl`、`shadow-xs`、`space-x-3` 等），未自定义 spacing/radius/shadow 扩展

## 图标与动效

- 图标统一使用 `lucide-react`，以 `<Globe className="w-3.5 h-3.5" />` 形式内联传入尺寸类
- 微交互通过 `motion`（Framer Motion）提供，配合 `transition-all duration-300` 类完成过渡

## 开发者规范

1. **禁止新增独立 `.css` 文件**——所有样式应通过 Tailwind 原子类或 `@theme` 令牌表达
2. **颜色必须引用设计令牌**，不得硬编码十六进制值；新增颜色需先写入 `src/index.css` 的 `@theme` 块
3. **组件级样式保持无状态**，className 由 props 驱动（如 `isVip ? "bg-teal-50 text-teal-700" : "bg-slate-50"`）
4. **响应式优先移动端**，默认写小屏类，用 `md:`/`lg:` 覆盖大屏
5. **图标尺寸统一用 Tailwind 尺寸类**（`w-3.5 h-3.5`、`w-5 h-5`），避免内联 style