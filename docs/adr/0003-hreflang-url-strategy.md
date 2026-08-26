# ADR-0003: hreflang 与 URL 策略（单 URL + x-default）

- **状态**：已接受
- **日期**：2026-08-26
- **阶段**：Phase 0.3

## 决策

采用**方案 1：单 URL + x-default**。所有语言共用同一路径（如 `/showroom`），不创建 `/en/showroom` 等语言前缀路由。

## 实现

`generateMetadata` 中只写 `canonical` + `"x-default"`，不写分语言路径：

```typescript
alternates: {
  canonical: "https://osneosmart.com/showroom",
  languages: { "x-default": "https://osneosmart.com/showroom" },
}
```

语言通过 cookie（`supply_os_locale`）+ `Accept-Language` header 在 middleware 中决议，写入 `x-locale` response header，由 Server Component 读取。

## 理由

1. **零路由改造**：不需要重构 URL 层级，工作量可控。
2. **避免死链**：`/en/showroom` 不存在，不会因语言切换产生 404。
3. **SEO 可接受**：多语言收录深度有限（Google 依赖 `x-default` + cookie 语言切换），但在当前阶段够用。

## 后续升级路径

Phase 6 完成后可评估升级到方案 2（语言前缀路由 `/en/showroom`），届时需：
- 新增 `[locale]` 动态段
- 301 重定向旧路径
- 更新 sitemap.xml
