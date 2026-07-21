---
kind: external_dependency
name: Vite 构建工具
slug: vite
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

使用 Vite 6.x 作为前端构建工具，集成 React 插件和 Tailwind CSS v4 插件。支持 HMR（可通过 `DISABLE_HMR` 环境变量禁用），配置了 `@/*` 路径别名指向 `src/` 目录。开发服务器允许外部域名访问（`osneosmart.com`）。