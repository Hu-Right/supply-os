# 静态预渲染方案说明

## 概述

本项目采用**静态预渲染**方案解决 SPA（单页应用）的 SEO 问题。

### 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                      构建流程                                │
├─────────────────────────────────────────────────────────────┤
│  1. Vite 构建前端 → dist/                                   │
│  2. esbuild 构建后端 → dist/server.mjs                      │
│  3. 启动预览服务器                                          │
│  4. Playwright 访问每个页面 → 等待 JS 执行                  │
│  5. 获取完整渲染的 HTML → dist/prerender/{path}/index.html  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      请求流程                                │
├─────────────────────────────────────────────────────────────┤
│  用户/爬虫请求 → Express 应用                                │
│       ↓                                                     │
│  prerenderMiddleware 检测 User-Agent                        │
│       ↓                                                     │
│  ┌──────────────┬──────────────────┐                        │
│  │  爬虫 UA     │  普通用户 UA      │                        │
│  └──────────────┴──────────────────┘                        │
│       ↓                    ↓                                 │
│  返回预渲染 HTML      返回 SPA (index.html)                 │
│  (完整内容可索引)    (JS 客户端渲染)                         │
└─────────────────────────────────────────────────────────────┘
```

## 使用方式

### 1. 完整构建 + 预渲染（推荐）

```bash
npm run build:prerender
```

此命令会：
1. 执行标准构建（Vite + esbuild）
2. 自动运行预渲染脚本生成静态 HTML

### 2. 仅预渲染（需先构建）

```bash
npm run prerender
```

适用于已构建完成，只需重新生成预渲染 HTML 的场景。

### 3. 标准构建（不含预渲染）

```bash
npm run build
```

适用于开发环境或不需要 SEO 优化的场景。

## 预渲染页面列表

当前预渲染的页面（可在 `scripts/prerender.ts` 中配置）：

| 路径 | 说明 | 超时时间 |
|------|------|----------|
| `/` | 首页（重定向到展厅） | 10s |
| `/showroom` | 全球智能展厅 | 15s |
| `/procurement` | 全球采购公告搜索 | 15s |
| `/supplier` | 供应商管理 | 15s |
| `/services` | 服务页面 | 10s |
| `/learning` | 学习中心 | 10s |
| `/training` | 外贸研修班 | 20s |
| `/procurement/qualification` | 供应商资质测试 | 15s |

## 支持的爬虫

预渲染中间件会检测以下爬虫的 User-Agent：

### 搜索引擎
- **Googlebot** - Google 搜索
- **Baiduspider** - 百度搜索
- **Bingbot** - Bing 搜索
- **Slurp** - Yahoo 搜索
- **DuckDuckBot** - DuckDuckGo
- **YandexBot** - Yandex

### 社交媒体
- **FacebookExternalHit** - Facebook/WhatsApp 分享
- **Twitterbot** - Twitter/X 分享
- **LinkedInBot** - LinkedIn 分享
- **WhatsApp** - WhatsApp 分享
- **TelegramBot** - Telegram 分享
- **DiscordBot** - Discord 分享

## 文件结构

```
dist/
├── assets/              # 静态资源（JS/CSS/图片）
├── prerender/           # 预渲染 HTML（新增）
│   ├── index/
│   │   └── index.html   # 首页预渲染
│   ├── showroom/
│   │   └── index.html   # 展厅页预渲染
│   ├── procurement/
│   │   └── index.html   # 公采页预渲染
│   └── ...
├── index.html           # SPA 入口
└── server.mjs           # 后端 bundle
```

## 缓存策略

### 预渲染 HTML 缓存
- **位置**：服务端内存（Map）
- **TTL**：1 小时
- **刷新**：重启服务或调用 `clearPrerenderCache()`

### HTTP 响应头
```
Cache-Control: public, max-age=3600
X-Prerendered: true
```

## 降级策略

如果预渲染文件不存在或生成失败：
1. 中间件自动降级到 SPA 模式
2. 爬虫仍可获得基本 HTML 结构
3. 不影响正常用户访问

## 验证方法

### 1. 检查预渲染文件是否生成

```bash
ls dist/prerender/
```

应看到各页面的 `index.html` 文件。

### 2. 模拟爬虫请求

```bash
# 使用 curl 模拟 Googlebot
curl -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
     http://localhost:3039/showroom

# 查看响应头中的 X-Prerendered 标记
curl -I -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
     http://localhost:3039/showroom
```

### 3. 使用 Google Search Console 测试

1. 访问 https://search.google.com/search-console
2. 使用"网址检查"工具
3. 输入你的页面 URL
4. 点击"测试实际网址"查看 Google 看到的内容

### 4. 使用 Facebook 分享调试器

1. 访问 https://developers.facebook.com/tools/debug/
2. 输入你的页面 URL
3. 查看 OG 标签是否正确解析

## 注意事项

### 1. 动态内容限制

预渲染只能捕获**构建时**的内容。对于需要用户交互或实时数据的内容：
- 预渲染会包含初始加载的数据
- 后续动态更新不会被捕获
- 建议对关键内容使用静态数据

### 2. 构建时间

预渲染会增加构建时间（每个页面约 5-10 秒）。

当前 8 个页面预计增加：**40-80 秒**

### 3. Playwright 依赖

预渲染脚本需要 Playwright Chromium 浏览器：

```bash
npx playwright install chromium
```

### 4. 内存占用

预渲染过程中会启动 Chromium 实例，建议服务器内存 ≥ 2GB。

## 未来优化方向

### 1. 增量预渲染
- 仅重新渲染变更的页面
- 减少构建时间

### 2. 按需预渲染
- 检测爬虫首次访问时触发预渲染
- 避免构建时预渲染的开销

### 3. SSR 改造
- 评估 Vite SSR 或 Next.js 迁移
- 实现真正的服务端渲染

## 故障排查

### 问题：预渲染文件未生成

**检查清单**：
1. 确认已执行 `npm run build`
2. 确认 Playwright 已安装：`npx playwright install chromium`
3. 检查 `dist/prerender` 目录权限
4. 查看控制台错误信息

### 问题：爬虫未获得预渲染 HTML

**检查清单**：
1. 确认 User-Agent 在支持列表中
2. 确认请求方法是 GET
3. 检查 `X-Prerendered` 响应头
4. 查看服务端日志 `[prerender]` 前缀

### 问题：预渲染内容不完整

**解决方案**：
1. 增加 `scripts/prerender.ts` 中的 `timeout` 值
2. 增加等待时间（`await new Promise(r => setTimeout(r, 2000))`）
3. 检查页面是否有异步数据加载

## 相关文档

- [SEO 优化总结](./SEO-OPTIMIZATION.md)
- [robots.txt 配置](../public/robots.txt)
- [Sitemap 生成器](../server/routes/system.routes.ts)
