# ADR-0023：不做任何「只给爬虫 / AI 看」的页面，SEO 与 GEO 只作用于用户可见内容

- 状态：已接受（2026-11-25）
- 关联：ADR-0022（诊断 V3）、`src/app/llms.txt/route.ts`（本次删除）
- 涉及仓库：`supply-os`（全站对外内容面）

## 1. 背景

为做 GEO（Generative Engine Optimization），2026-11 曾新增 `/llms.txt`：一个动态生成的纯文本文件，向 AI 引擎声明站点定位、核心页面清单、数据口径与引用许可，规模数字实时读库。

它的问题不是技术实现，而是**品类错误**：

- 站内唯一一个「只给 AI 看、用户看不到」的页面，维护口径与用户页面不同源（数字依赖 DB，DB 抖动就退化成模糊文案）；
- 对用户零价值，却要跟随每次口径变更同步维护（国家数、公告数、价格）；
- 与「站点事实只在用户可访问页面维护一次」的既有原则冲突：`/about`、`/notice-source`、`/faq`、`/membership` 已经承载同样的信息，且可被任何引擎读取。

## 2. 决策

**删除 `/llms.txt` 路由，并确立边界：SEO/GEO 的一切手段，都作用在用户同一份可见内容上。**

允许的「非可见产物」只有**同一份用户内容的元信息**：

- `title` / `description` / OpenGraph / Twitter Card；
- JSON-LD 结构化数据（描述页面上已展示的事实，不引入页面外事实）；
- `canonical` / `hreflang` / `robots` / `sitemap`。

禁止的形态：

1. 任何 AI/爬虫专用页面或文本文件（`llms.txt`、`llms-full.txt`、`ai.txt`、`/bot/*` 等）；
2. 按 UA 返回不同内容的 cloaking（`Baiduspider` 与浏览器看到不同正文）；
3. 隐藏文本块（`display:none` / 同色文字 / `sr-only` 里塞关键词）——`sr-only` 只用于无障碍（跳转链接、加载态、弹窗标题）；
4. **只进 sitemap、没有用户入口的「可索引资产页」**——页面必须能从站内导航或正文链接抵达，否则就是给爬虫看的影子页。

替代做法：**AI 可读性 = 用户可见正文的服务端直出 + 语义结构**（唯一 H1、H2 分节、`dl` 要点表、真实内链）。爬虫不执行 JS，所以正文必须进 HTML——这一点继续由 `force-dynamic` 的 RSC 直出保证（`/training`、`/membership`、公告详情页）。

## 2.1 本次一并下线的三处（2026-11-25）

| 下线对象 | 为什么算「只给 AI 看」 | 用户内容去哪了 |
|---|---|---|
| `/llms.txt` | 纯文本文件，站内唯一用户看不到的页面 | 站点事实仍在 `/about`、`/notice-source`、`/faq`、`/membership` |
| `/procurement/agency/[slug]` | 代码注释自述「GEO 可引用资产」；全站 **0 处内链**、从未进 sitemap；`slug` 无边界＝无限 URL 空间 | 机构维度由搜索页的机构筛选项承载 |
| `/award-intelligence/case/[id]`（30 页） | 案例列表卡片是 `onClick` 开弹窗，没有任何链接指向这些 URL；只在 sitemap 里存在 | 案例数据仍在 `/award-intelligence` 的案例区与详情弹窗，内容零丢失 |

`src/app/sitemap.ts` 同步删掉 30 条案例 URL 与机构段注释。

## 3. 后果

- `/llms.txt`、`/procurement/agency/*`、`/award-intelligence/case/*` 部署后返回 404；`robots.txt` 无需改动；
- `llms-full.txt` 计划取消，不再作为 GEO 路线；
- 站点事实（运营主体、资质、来源与许可、价格）只在 `/about`、`/notice-source`、`/faq`、`/membership` 维护一处；
- 面向 AI 的引用能力改由内容质量决定：公告页的「要点」段（采购方 / 国家 / 类型 / 截止 / 预算 / 编号）+ 同国别相关公告 + 原文链接；
- 结构上多一条硬约束：**新增页面必须同时给出用户入口**（导航、正文链接或列表卡片），否则不得进 sitemap。

## 4. 边界之外的既有实现（保留）

`src/proxy.ts` 中的 `[ai-crawler]` UA 日志分支保留：它只写服务器日志、不改变任何响应内容，属于可观测性，不构成「给 AI 看的页面」。若后续要求完全移除 AI 专用代码路径，删除该 5 行分支即可，不影响抓取与索引。

机器可读但属标准协议、予以保留的文件：`/robots.txt`、`/sitemap-index.xml`、`/sitemap/{id}.xml`、`/favicon.ico`、`public/baidu_verify_*.html`（百度站点验证）、`public/<indexnow-key>.txt`（IndexNow 密钥）。

## 5. 回滚

从 git 恢复对应文件即可：`src/app/llms.txt/route.ts`、`src/app/(zh)/(public)/procurement/agency/[slug]/page.tsx`、`src/app/(zh)/(public)/award-intelligence/case/[id]/page.tsx`，以及 `src/app/sitemap.ts` 中的案例段。三处均无内部依赖，单独恢复互不牵连。
