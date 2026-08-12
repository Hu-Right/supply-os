# Meilisearch 搜索引擎部署指南

> 本文档面向服务器部署人员，详细说明如何在服务器上安装、配置和启用 Meilisearch 搜索引擎，实现采购公告搜索加速。

---

## 目录

- [一、概述](#一概述)
- [二、架构说明](#二架构说明)
- [三、前置条件](#三前置条件)
- [四、安装步骤](#四安装步骤)
  - [方式 A：自动安装（推荐）](#方式-a-自动安装推荐)
  - [方式 B：手动安装](#方式-b-手动安装)
  - [方式 C：Linux 服务器安装](#方式-c-linux-服务器安装)
- [五、环境变量配置](#五环境变量配置)
- [六、启动服务](#六启动服务)
- [七、验证部署](#七验证部署)
- [八、降级机制说明](#八降级机制说明)
- [九、日常运维](#九日常运维)
- [十、常见问题排查](#十常见问题排查)
- [附录：目录结构说明](#附录目录结构说明)

---

## 一、概述

本项目集成了 [Meilisearch](https://www.meilisearch.com/) 作为采购公告的搜索引擎，提供：

- **毫秒级搜索响应**（对比 MySQL FULLTEXT 的秒级响应）
- **中文分词支持**（基于 charabia 内置中文 ngram 分词）
- **多条件筛选**（国家、机构、采购类型、日期范围、UNSPSC 行业分类）
- **排序与分页**（按截止日期、最新、相关度排序）
- **自动数据同步**（启动时全量同步 + 每 1 分钟增量同步）

### 关键特性：零宕机降级

即使 Meilisearch **未安装或未启动**，应用也能正常运行。搜索功能会自动降级到 MySQL FULLTEXT / LIKE 查询，功能完全不受影响，仅搜索速度较慢。

---

## 二、架构说明

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   前端浏览器   │────▶│  Node.js 应用服务  │────▶│   MySQL 数据库  │
└──────────────┘     └────────┬─────────┘     └──────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   Meilisearch     │
                     │  (搜索引擎，可选)  │
                     └──────────────────┘
```

**搜索流程：**

1. 用户发起搜索请求
2. 应用优先尝试 Meilisearch 执行搜索（< 200ms）
3. 如果 Meilisearch 不可用或超时（3 秒），自动降级到 MySQL FULLTEXT
4. Meilisearch 负责筛选/排序/分页 → 返回 ID 列表 → MySQL 按 ID 取详情

**数据同步流程：**

- **启动时**：检测 Meilisearch 索引状态，为空则执行全量同步
- **运行中**：每 1 分钟增量同步新增/更新的公告
- **状态变更**：`is_active`、`is_featured` 等状态变更实时同步到索引

---

## 三、前置条件

| 依赖 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 18 | 应用运行时 |
| MySQL | >= 5.7 | 主数据库（必需） |
| Meilisearch | 1.52.0+ | 搜索引擎（可选，推荐安装） |
| 磁盘空间 | >= 2 GB | Meilisearch 索引数据 + 二进制文件 |
| 内存 | >= 512 MB 可用 | Meilisearch 运行时内存 |
| 网络 | 可访问 GitHub | 首次下载 Meilisearch 二进制文件 |

---

## 四、安装步骤

### 方式 A：自动安装（推荐，Windows 服务器）

项目提供了 PowerShell 自动安装脚本，一键完成下载和配置：

```powershell
# 1. 拉取代码后，进入项目目录
cd C:\path\to\supply-os

# 2. 安装 Node.js 依赖
npm install

# 3. 运行 Meilisearch 安装脚本
.\scripts\setup-meilisearch.ps1
```

脚本会自动完成以下操作：

- 从 GitHub 下载 Meilisearch v1.52.0 到 `bin/meilisearch.exe`
- 创建数据目录 `bin/data.ms/`
- 检测 `.env` 中是否已有 `MEILI_MASTER_KEY` 配置，如无则自动生成随机密钥并写入

如需指定版本或强制重新下载：

```powershell
# 指定版本
.\scripts\setup-meilisearch.ps1 -Version "1.52.0"

# 强制重新下载（覆盖已有安装）
.\scripts\setup-meilisearch.ps1 -Force
```

### 方式 B：手动安装（Windows 服务器）

```powershell
# 1. 下载 Meilisearch
# 访问 https://github.com/meilisearch/meilisearch/releases/tag/v1.52.0
# 下载 meilisearch-windows-amd64.exe

# 2. 放到项目 bin/ 目录
mkdir bin
# 将下载的文件放入 bin/meilisearch.exe

# 3. 创建数据目录
mkdir bin\data.ms

# 4. 生成随机密钥
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# 记下输出的密钥，后面配置 .env 要用
```

### 方式 C：Linux 服务器安装

```bash
# 1. 下载 Meilisearch（Linux 版本）
cd /path/to/supply-os
mkdir -p bin/data.ms

# 下载二进制文件
curl -L https://github.com/meilisearch/meilisearch/releases/download/v1.52.0/meilisearch-linux-amd64 -o bin/meilisearch
chmod +x bin/meilisearch

# 2. 生成随机密钥
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# 3. 配置环境变量（见下一节）
```

---

## 五、环境变量配置

安装完成后，需要在项目根目录创建或编辑 `.env` 文件，添加 Meilisearch 相关配置。

> **注意**：`.env` 文件已被 `.gitignore` 忽略，不会提交到 Git 仓库。每次部署都需要在服务器上单独配置。

### 必需配置

```ini
# ── Meilisearch 搜索引擎 ──────────────────────────────────────────
# 启用搜索引擎（on = 启用, off = 禁用）
MEILI_ENABLED="on"

# Meilisearch 服务地址（默认本地 7700 端口）
MEILI_HOST="http://127.0.0.1:7700"

# Meilisearch 认证密钥（必须与启动参数中的 --master-key 一致）
# 生成方式：node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
MEILI_MASTER_KEY="你生成的随机密钥"
```

### 完整 .env 示例

参考项目中的 `.env.example`，以下是 Meilisearch 相关部分的完整说明：

```ini
# ── Meilisearch ─────────────────────────────────────────────────
# Meilisearch 搜索引擎（采购公告搜索加速）。
# 部署时运行 .\scripts\setup-meilisearch.ps1 自动下载二进制。
# MEILI_ENABLED=on 时激活搜索；不可用时搜索自动降级到 MySQL FULLTEXT。
MEILI_ENABLED="on"
MEILI_HOST="http://127.0.0.1:7700"
# MEILI_MASTER_KEY: Meilisearch 认证密钥，建议用随机字符串。
#   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
MEILI_MASTER_KEY="a1b2c3d4e5f6..."
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `MEILI_ENABLED` | 字符串 | `"off"` | `"on"` 启用搜索，`"off"` 禁用（降级到 MySQL） |
| `MEILI_HOST` | 字符串 | `"http://127.0.0.1:7700"` | Meilisearch 服务地址 |
| `MEILI_MASTER_KEY` | 字符串 | `""` | 认证密钥，必须与 Meilisearch 启动参数 `--master-key` 一致 |

---

## 六、启动服务

部署时需要启动 **两个进程**：Meilisearch 引擎 + Node.js 应用。

### 步骤 1：启动 Meilisearch

**Windows：**

```powershell
# 前台运行（调试用，可看到日志）
.\bin\meilisearch.exe --master-key <你的密钥> --db-path .\bin\data.ms

# 后台运行（生产环境，使用 PowerShell Start-Process）
Start-Process -FilePath ".\bin\meilisearch.exe" `
  -ArgumentList "--master-key","<你的密钥>","--db-path",".\bin\data.ms" `
  -WindowStyle Hidden
```

**Linux：**

```bash
# 前台运行（调试用）
./bin/meilisearch --master-key <你的密钥> --db-path ./bin/data.ms

# 后台运行（使用 nohup）
nohup ./bin/meilisearch --master-key <你的密钥> --db-path ./bin/data.ms > /dev/null 2>&1 &

# 推荐使用 systemd 管理（见下方「Linux systemd 服务」章节）
```

### 步骤 2：构建并启动应用

```powershell
# 构建前端 + 打包后端
npm run build

# 以生产模式启动应用
npm run start
```

### 步骤 3：确认启动成功

应用启动后，控制台会显示 Meilisearch 初始化日志：

```
[meilisearch] 初始化完成: 索引已就绪, 增量同步已启动 (间隔 1 分钟)
[meilisearch] 启动同步: 已有 0 文档, watermark=0
[meilisearch] fullSync: 已清空旧索引，开始重建...
[meilisearch] fullSync 完成: 12345 条文档, 8500ms
[meilisearch] 全量同步完成: 12345 条, watermark=54321
```

> **首次启动**会自动从 MySQL 全量同步所有公告数据到 Meilisearch 索引，根据数据量可能需要数秒到数分钟。同步期间搜索功能正常可用（降级到 MySQL）。

---

## 七、验证部署

### 7.1 检查 Meilisearch 健康状态

```bash
# 直接请求 Meilisearch 健康端点
curl http://127.0.0.1:7700/health
# 预期返回：{"status":"available"}
```

### 7.2 检查索引数据量

```bash
# 查看索引中的文档数量
curl -H "Authorization: Bearer <你的密钥>" http://127.0.0.1:7700/indexes/notices/stats
# 查看 numberOfDocuments 字段
```

### 7.3 测试搜索功能

在浏览器中打开应用，进入采购公告页面：

1. 在搜索框输入关键词（如 `construction`），确认搜索结果快速返回
2. 使用国家、机构等筛选条件，确认筛选正常
3. 打开浏览器开发者工具 → Network 面板，查看搜索 API 响应时间（应 < 500ms）

### 7.4 检查应用日志

在应用启动日志中查找以下关键信息：

```
# 正常启动
[meilisearch] 初始化完成: 索引已就绪, 增量同步已启动 (间隔 1 分钟)

# 降级（Meilisearch 未启动或不可达）
[meilisearch] health check failed — search will fallback to MySQL LIKE

# 搜索走 Meilisearch 路径
[search-perf] mode=meili-en page=1 q="construction" | Meilisearch=45ms | total=1234 | ids=9

# 搜索降级到 MySQL
[search-perf] fallback MySQL mode=mysql-en-FULLTEXT q="construction"
```

---

## 八、降级机制说明

应用内置了完善的降级策略，确保 Meilisearch 不可用时服务不中断：

| 场景 | 行为 | 影响 |
|------|------|------|
| `MEILI_ENABLED="off"` | 不初始化 Meilisearch，搜索走 MySQL | 搜索较慢，其他功能正常 |
| Meilisearch 未启动 | 健康检查失败，自动降级到 MySQL FULLTEXT | 搜索较慢，其他功能正常 |
| Meilisearch 超时（3 秒） | 单次搜索降级，下次请求继续尝试 | 单次搜索较慢 |
| Meilisearch 同步失败 | 静默降级，不影响主服务 | 索引可能暂时不是最新 |
| 索引数据异常（ghost IDs） | 自动触发全量重建 | 重建期间搜索降级 |

**关键设计原则：**

- 所有 Meilisearch 操作均为**非阻塞异步执行**，不影响应用启动速度
- 搜索超时限制为 **3 秒**，超时自动返回 null 触发降级
- 增量同步异常**静默处理**，不抛出错误
- 应用启动**不依赖** Meilisearch，即使完全不可用也能正常提供服务

---

## 九、日常运维

### 9.1 数据同步机制

| 同步类型 | 触发时机 | 说明 |
|----------|----------|------|
| 全量同步 | 首次启动 / 索引为空 / 检测到 ghost IDs | 清空索引后从 MySQL 全量拉取 |
| 增量同步 | 每 1 分钟 | 同步新增记录 + 最近 10 分钟更新的记录 |
| 状态同步 | 每 10/30 分钟 | `is_active`、`is_featured` 状态变更实时同步 |
| 启动同步 | 应用启动时 | 将 `is_active` 变更同步到索引 |

### 9.2 重启服务

```powershell
# 重启应用（不影响 Meilisearch）
npm run build
npm run start

# 重启 Meilisearch（索引数据持久化在 bin/data.ms/，重启后无需重新同步）
# 先停止旧进程，再重新启动
.\bin\meilisearch.exe --master-key <你的密钥> --db-path .\bin\data.ms
```

### 9.3 重建索引

如果需要强制重建索引（如索引数据异常），可以：

1. 停止应用
2. 删除 `bin/data.ms/` 目录
3. 重新启动 Meilisearch
4. 启动应用 → 自动检测索引为空 → 执行全量同步

```powershell
# 重建索引
Stop-Process -Name meilisearch -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\bin\data.ms
mkdir .\bin\data.ms
Start-Process -FilePath ".\bin\meilisearch.exe" `
  -ArgumentList "--master-key","<你的密钥>","--db-path",".\bin\data.ms" `
  -WindowStyle Hidden
# 然后重启应用
```

### 9.4 更新 Meilisearch 版本

```powershell
# 强制重新下载指定版本
.\scripts\setup-meilisearch.ps1 -Version "1.52.0" -Force

# 索引数据兼容，无需重新同步
```

### 9.5 Linux systemd 服务（推荐生产环境）

创建 `/etc/systemd/system/meilisearch.service`：

```ini
[Unit]
Description=Meilisearch Search Engine
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/supply-os
ExecStart=/path/to/supply-os/bin/meilisearch --master-key <你的密钥> --db-path /path/to/supply-os/bin/data.ms
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable meilisearch
sudo systemctl start meilisearch

# 查看状态
sudo systemctl status meilisearch

# 查看日志
sudo journalctl -u meilisearch -f
```

---

## 十、常见问题排查

### Q1：启动应用后日志显示 `health check failed`

**原因**：Meilisearch 未启动或地址/端口不正确。

**排查步骤**：
1. 确认 Meilisearch 进程是否在运行：`Get-Process meilisearch`（Windows）或 `ps aux | grep meilisearch`（Linux）
2. 确认 `.env` 中 `MEILI_HOST` 与 Meilisearch 实际监听地址一致
3. 确认端口 7700 未被占用：`netstat -ano | findstr 7700`

### Q2：搜索仍然很慢（走 MySQL 降级路径）

**排查步骤**：
1. 确认 `MEILI_ENABLED="on"` 已设置
2. 确认 Meilisearch 健康检查通过（见 Q1）
3. 确认索引中有数据：`curl -H "Authorization: Bearer <密钥>" http://127.0.0.1:7700/indexes/notices/stats`
4. 查看应用日志中 `[search-perf]` 行，确认 `mode=meili-*` 而非 `mode=mysql-*`

### Q3：`MEILI_MASTER_KEY` 不一致会怎样？

Meilisearch 启动时的 `--master-key` 参数必须与 `.env` 中的 `MEILI_MASTER_KEY` 完全一致。不一致会导致 API 请求返回 401 Unauthorized，搜索功能降级到 MySQL。

### Q4：服务器无法访问 GitHub 下载 Meilisearch

**解决方案**：
1. 在本地电脑下载：访问 https://github.com/meilisearch/meilisearch/releases/tag/v1.52.0
2. 根据服务器系统选择对应版本：
   - Windows：`meilisearch-windows-amd64.exe` → 重命名为 `meilisearch.exe`
   - Linux：`meilisearch-linux-amd64` → 重命名为 `meilisearch`
   - macOS (Apple Silicon)：`meilisearch-macos-amd64-arm64`
3. 通过 SCP / SFTP 等方式上传到服务器 `bin/` 目录

### Q5：Meilisearch 占用多少资源？

| 指标 | 典型值 | 说明 |
|------|--------|------|
| 磁盘 | ~500 MB（10 万条公告） | 索引数据存储在 `bin/data.ms/` |
| 内存 | ~200-500 MB | 取决于索引大小和搜索并发量 |
| CPU | 极低（空闲时） | 仅在搜索和同步时使用 |

### Q6：可以不用 Meilisearch 吗？

**可以。** 将 `.env` 中 `MEILI_ENABLED` 设为 `"off"` 或不设置即可。应用会自动使用 MySQL FULLTEXT 搜索，功能完全正常，仅搜索速度较慢（通常 1-3 秒 vs Meilisearch 的 < 200ms）。

---

## 附录：目录结构说明

```
supply-os/
├── bin/                          # Meilisearch 安装目录（.gitignore 忽略）
│   ├── meilisearch.exe           # Meilisearch 可执行文件
│   └── data.ms/                  # Meilisearch 索引数据（持久化）
├── scripts/
│   └── setup-meilisearch.ps1     # Windows 自动安装脚本
├── server/
│   ├── bootstrap.ts              # 应用启动入口（Meilisearch 初始化逻辑）
│   └── services/
│       ├── meilisearch.ts        # Meilisearch 客户端（索引管理、文档同步、搜索）
│       ├── searchSync.ts         # 增量同步服务（watermark 机制）
│       └── noticeSearch.ts       # 搜索服务（Meilisearch 优先 + MySQL 降级）
├── .env                          # 环境变量配置（.gitignore 忽略，不提交）
├── .env.example                  # 环境变量模板（已提交到 Git）
└── package.json                  # meilisearch SDK 在 dependencies 中
```

---

## 快速部署清单

以下是一键部署的简要步骤清单，供有经验的部署人员快速参考：

```powershell
# 1. 拉取代码
git pull

# 2. 安装依赖
npm install

# 3. 安装 Meilisearch
.\scripts\setup-meilisearch.ps1

# 4. 配置环境变量
# 编辑 .env，确保以下配置：
#   MEILI_ENABLED="on"
#   MEILI_HOST="http://127.0.0.1:7700"
#   MEILI_MASTER_KEY="<脚本自动生成或手动填写>"

# 5. 启动 Meilisearch
Start-Process -FilePath ".\bin\meilisearch.exe" `
  -ArgumentList "--master-key","<你的密钥>","--db-path",".\bin\data.ms" `
  -WindowStyle Hidden

# 6. 构建并启动应用
npm run build
npm run start

# 7. 验证
# 浏览器打开应用，搜索关键词，确认响应速度 < 500ms
```

---

## 十一、数据一致性问题说明

### 问题背景

在 2026 年 8 月，系统出现了搜索结果总数不一致的问题：

- **预期值**：约 68,000 条未过期公告
- **实际显示**：约 125,000 条（波动巨大）

### 根本原因分析

#### 原因 1：`is_active` 预计算列未及时更新

| 指标 | 值 | 说明 |
|---|---|---|
| 主表 `is_active = 1` | 126,090 | 过时的预计算值 |
| 实际未过期 (deadline判断) | 68,827 | 正确值 |
| 差异 | 57,263 | is_active=1 但实际已过期 |

**问题**：`is_active` 列是预计算的过期标记，但数据导入后未及时更新，导致大量已过期记录仍被标记为"有效"。

#### 原因 2：统计表使用错误的 SQL

旧版本代码使用 `is_active = 1` 来计算 `active_total`：

```sql
-- 错误的 SQL（旧版本）
SELECT COUNT(*) FROM crm_bid_notices WHERE is_active = 1;
-- 结果：126,090（错误）

-- 正确的 SQL（新版本）
SELECT COUNT(*) FROM crm_bid_notices 
WHERE (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()));
-- 结果：68,827（正确）
```

#### 原因 3：`deadline_ts` 数据质量问题

| 问题类型 | 数量 | 说明 |
|---|---|---|
| `deadline_ts = 0` | 448 | 日期解析失败，被误判为"无截止日期" |
| `deadline_ts IS NULL` 且 deadline 有文本值 | 21 | 如 "未公布"、"N/A" 等 |
| `deadline_ts = 1`（已修复） | 24,377 | 已正确标记为"已过期" |

### 修复措施

#### 1. 修改统计表 SQL（已完成）

**文件**：`server/services/notice-search/stats.ts`

```javascript
// 只用 deadline_sec 实时判断，不再依赖 is_active 缓存
const DEADLINE_FILTER = `(deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))`;

export async function refreshNoticeStats(pool: Pool): Promise<void> {
  noticeCountCache.clear(); // 修复：先清除内存缓存
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM crm_bid_notices WHERE ${DEADLINE_FILTER}`
  );
  // ...
}
```

#### 2. 数据修复（已完成）

```sql
-- 将 "未公布"、"N/A" 等文本的 deadline_ts 设为 1（已过期）
UPDATE crm_bid_notices SET deadline_ts = 1 WHERE deadline = '未公布';
UPDATE crm_bid_notices SET deadline_ts = 1 WHERE deadline = 'N/A';
UPDATE crm_bid_notices SET deadline_ts = 1 WHERE deadline = '';
```

#### 3. 前端数据源统一（已完成）

**文件**：`src/features/procurement/hooks/useNoticeSearch.ts`

```javascript
// 修复：移除 activeSort 条件，三种排序统一走同一数据源
const currentDataSource =
  hasSearch
    ? "search"
    : prefsMode === "recommended" && userKey
      ? "recommended"
      : "search";
```

#### 4. 统计表键版本迁移（已完成）

**文件**：`server/services/notice-search/stats.ts`

**背景**：修复后问题仍反复出现。经数据库取证确认：团队多台机器（DESKTOP-6AA7874、DESKTOP-BQ7MGS0 等）
连接同一个共享数据库并各自运行应用服务，其中运行旧代码的实例每 10 分钟把
`is_active = 1` 口径的 ≈ 12.6 万写入统计表，与新代码写入的 ≈ 6.8 万轮流覆盖，
导致总数在两个值之间波动。

**方案**：新代码统一读写带 `_v2` 后缀的键，旧实例写入的无后缀键无人读取，自然隔离：

```javascript
// 统计表键版本后缀：新代码统一读写 _v2 键，旧实例的写入被隔离
const STATS_KEY_VER = "_v2";

// 写入：active_total_v2 / featured_v2 / country:XX_v2 / agency:XX_v2
// 读取：statsKeyFor() 返回的键同样带 _v2 后缀
```

**优势**：零停机部署、容忍旧实例残留（无需强制全员同步升级）、保留统计表毫秒级读取性能。

### 预防措施

#### 1. 数据导入时的 deadline 解析

```javascript
function parseDeadline(deadline) {
  if (!deadline || typeof deadline !== 'string') return null;
  const trimmed = deadline.trim();
  
  // 文本类型 → 1（已过期）
  if (['未公布', 'N/A', 'n/a', 'NA', 'na', '未知', '待定', 'TBD', 'tbd', ''].includes(trimmed)) {
    return 1; // 1970-01-01 00:00:01，已过期
  }
  
  // 尝试解析日期...
  // 无法解析 → 1（已过期）
  return 1;
}
```

#### 2. 监控告警

- 如果 `active_total` 突然变化超过 10%，触发告警
- 定期检查 `is_active = 1` 但实际已过期的记录数

#### 3. 定期数据对账

```sql
-- 检查 is_active 与 deadline 的一致性
SELECT COUNT(*) AS inconsistent 
FROM crm_bid_notices 
WHERE is_active = 1 
  AND deadline_ts > 0 
  AND deadline_sec < UNIX_TIMESTAMP(NOW());
```

### 当前状态

| 指标 | 值 | 状态 |
|---|---|---|
| 主表总记录数 | 165,378 | ✓ |
| 未过期记录数 (deadline判断) | 68,827 | ✓ 正确 |
| 统计表 active_total_v2 | 部署后自动写入正确值 | ✓ 键版本隔离已生效 |
| 统计表 active_total（旧键） | 旧实例仍在写入 | ✓ 无人读取，无害 |
| 主表 is_active=1 | 126,090 | ⚠ 过时值，不影响搜索 |

### 重要提示

> 部署含键版本迁移（`STATS_KEY_VER = "_v2"`）的代码后，总数显示不再受其他旧实例影响：
> 新实例启动预热会立即写入 `active_total_v2` 正确值（约 68,844），
> 旧实例继续写无后缀的旧键但已无任何代码读取。
>
> 后续治理（可选）：待团队代码全部统一后，可为定时任务增加选主开关
> `STATS_REFRESH_ENABLED`（仅一台实例刷新统计表），进一步收敛写入口。

---

## 更新日志

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-08-12 | v1.52.0 | 实施统计表键版本迁移（_v2 后缀），隔离多实例写入冲突 |
| 2026-08-12 | v1.52.0 | 添加数据一致性问题说明章节 |
| 2026-08-12 | v1.52.0 | 修复统计表 SQL，使用 deadline 实时判断 |