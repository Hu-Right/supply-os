# ADR-0026：sitemap 改为预生成快照 + 可索引集合，抓取层与内容门槛分离

- 状态：已接受（2026-11-25）
- 关联：ADR-0021（错误码）、ADR-0023（不做 AI 专用页）、ADR-0025（移除向后兼容）
- 涉及：`src/app/sitemap/[shard]/route.ts`、`lib/services/seo/{indexable,sitemap-snapshot,sitemap-xml,sitemap-static}.ts`、`instrumentation.ts`

## 1. 背景

线上实测（GPTBot UA，2026-11-25）：

- sitemap 单片 20–55 s（`sitemap/5.xml` 54.98 s），8 片 × 8.9 MB；
- 生成方式为每次请求 `ORDER BY create_time DESC LIMIT 50000 OFFSET n`，深分页越往后越慢；
- 公告 37 万+，其中约 24 万条正文分级为 `empty/echo`，全量提交等于用薄页稀释整站质量；
- 详情页被 Next 判为动态段，响应 `Cache-Control: private, no-store`，应用层无法给出可缓存指令。

AI 爬虫（GPTBot / PerplexityBot / ClaudeBot / Bytespider）超时短、主要靠 sitemap 发现 URL，上述三点直接决定「能不能被抓到」。

## 2. 决策

### 2.1 sitemap 从「请求时扫库」改为「定时快照 + 只读文件」

- 生成器 `buildSitemapSnapshots(pool)`：keyset 分页（`n.id < cursor` + 主键倒序，每片 5 万），
  写入 `runtime/seo/sitemap/{id}.xml` + `manifest.json`（原子写：tmp → rename）；
- digest（条数 + 最大 id + 最大更新时间）未变则跳过重建；
- 调度：`instrumentation.ts` 启动 30 s 后预热，之后默认每 4 小时一轮（`SEO_SITEMAP_INTERVAL_MS` 可覆盖）；
- 路由 `/sitemap/{id}.xml` 改为 Route Handler：只读文件，`s-maxage=600`；
  快照缺失时实时渲染一片兜底，DB 不可用返回 **503**（绝不返回空 urlset 冒充「站点无 URL」）；
- 静态片固定为 `/sitemap/static.xml`（22 固定页 + 国别入口 + 供应商），与公告分片解耦。

### 2.2 可索引集合成为单一事实源

`lib/services/seo/indexable.ts` 定义 `INDEXABLE_NOTICE_WHERE`（p 别名）：

```
截止未过 / 无截止
AND country_code IS NOT NULL
AND notice_type_code IS NOT NULL
AND content_level <> 'empty'（只排除空白正文；echo 只要正文够长就算合格）
AND 标题长度 ≥ 8（title_cn 优先，缺失用原文）
AND 正文长度 ≥ 200（description_cn 优先，缺失用原文）
```

实测（2026-11-25 放宽后）：可索引 **151,802**，sitemap 为 **4 片**（50k×3 + 1,802）。

为什么放宽 `content_level`：该字段把 55,652 条「正文 ≥200 字、但标成 echo」的真实公告挡在 sitemap 外
（抽样为西班牙 ELISA 试剂、巴西电力服务等真实采购描述）；而 `empty` 里 ≥200 字的只有 2 条，
且是 5,120 个空格。因此改为只排除 `empty`，不再要求必须是 `substantive/thin`。

生成查询必须写 `STRAIGHT_JOIN notice_public`：否则优化器会先扫 110 万行 `notice_public`
再逐行算 `LEFT/CHAR_LENGTH(longtext)`，查询被数据库服务端直接掐断（`PROTOCOL_CONNECTION_LOST`）。
强制以 `bid_notices` 为驱动表按主键范围扫描后，4 片全量生成 78 秒。
曾尝试物化 `seo_indexable_notice` 规避长文本计算，但在本机 SSH 隧道下重建连接被反复掐断，已回退。
sitemap 生成、翻译队列、周报共用同一口径，禁止业务代码另写 WHERE。

### 2.3 sitemap 条目只保留 loc + lastmod

`changefreq` / `priority` 已被 Google 明确忽略，去掉后单片体积 8.9 MB → 5.85 MB（-34%）。
`lastmod` 统一取 `GREATEST(create_time, updated_at)`，被 reconcile 改写的公告能触发重抓。

### 2.4 组合筛选页改为 header 级 noindex

`proxy.ts` 对 `/procurement` 带任意筛选参数（q / commodity / notice_type / 时间窗 / 预算 / 分页 / 多国别）
的响应加 `X-Robots-Tag: noindex, follow`；**单参数 `?country=XX` 仍可索引**（国别入口，页面有独立 canonical）。
这是 header 级改动，不改页面内容。

### 2.5 公开页缓存放到 nginx

`/procurement/notice/[id]` 的 `no-store` 由 Next 动态段行为产生，`next.config.ts` 的 headers 会被覆盖（实测无效，已移除）。
缓存策略改为 nginx 微缓存，配置与验收步骤见 `docs/deploy/nginx-seo-cache.md`；付费 `/detail` 明确排除。

## 3. 后果

- sitemap 热响应 0.067 s / 0.039 s / 0.09 s（原 20–55 s）；
- 提交 URL 从 37 万收敛到 9.7 万，抓取预算集中到可引用页面；
- 快照重建单次约 2 分 47 秒，4 小时一轮（占空比 ~1.2%），运行在 `syncPool` 上与 HTTP 连接隔离；
- 新增 1 个纯函数单测（`sitemap-xml.test.ts`）并纳入覆盖率白名单；
- 快照目录 `runtime/` 已被 `.gitignore` 忽略，不进仓库。

## 4. 回滚

恢复 `src/app/sitemap.ts` 与 `sitemap-index.xml/route.ts` 旧实现，删除 `src/app/sitemap/[shard]`，
并移除 `instrumentation` 里的调度器注册；`runtime/seo/sitemap` 可直接删除。
