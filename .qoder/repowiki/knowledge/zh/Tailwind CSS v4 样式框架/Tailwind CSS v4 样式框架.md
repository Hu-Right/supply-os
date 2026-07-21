---
kind: external_dependency
name: Tailwind CSS v4 样式框架
slug: tailwind-css-v4
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

使用 Tailwind CSS v4，通过 `@tailwindcss/vite` 插件集成，不再使用 `tailwind.config.ts`，而是通过 `src/index.css` 中的 `@theme` 块扩展自定义颜色令牌（primary/secondary/accent 系列）。新组件应优先使用 `bg-primary-600` 等语义化类名替代旧 `teal-*` 类名。