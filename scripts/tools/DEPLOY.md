# 部署与产物下发（Turbopack 口径 · 2026-11-18 更新）

> 本文档是仓库内**唯一**的部署流程说明。每次部署按本文执行，不要临时改路径、换构建工具或手改服务器产物。

## 0. 铁律（先看这里）

1. **构建工具只用 Turbopack**（Next.js 16 默认）。**禁止 webpack 构建**，仓库内不保留任何 webpack 配置。
2. **8G 生产机不做本地构建**：Turbopack 全量构建峰值 RSS 7GB+，会触发 OOM killer（事故见 §2）。
3. **构建必须在 CI（16G runner）完成**，服务器只接收产物。
4. **本机 `.env` 的 `127.0.0.1:3307` 是到生产库的 Docker 隧道**（容器 `intelligence-daily-tunnel`），不是本地测试库。任何迁移 / 数据清洗都会直接作用于生产——操作前先确认：
   ```bash
   docker ps | grep tunnel   # 看到 127.0.0.1:3307->3307 即为生产库隧道
   ```
5. **产物安装必须走 `scripts/tools/deploy-artifact.sh`**，禁止手工替换 `.next/standalone`。
6. 任何一次部署都必须校验：产物 sha256、含 `server.js`、部署后 HTTP 200、`BUILD_ID` 变化、pm2 重启次数为 0。

## 1. 组件职责

| 组件 | 作用 | 现状 |
|---|---|---|
| `.github/workflows/build-artifact.yml` | CI（16G runner）Turbopack 构建 + 上传 `next-standalone` 产物 | ✅ **当前唯一稳定构建入口** |
| `.github/workflows/deploy.yml` | CI 构建 + runner 直传服务器 | ⚠️ 跨境链路不可靠（见 §5），暂不作为主路径 |
| `scripts/tools/deploy-artifact.sh` | 服务器侧安装产物：备份旧版 → 校验 `server.js` → 替换 → 重启 → 360s 探活 | ✅ 产物安装唯一入口 |
| `scripts/tools/deploy.sh` | 服务器本地构建（8G 会 OOM） | ⚠️ 仅 16G+ 内存机器可用 |
| `.github/workflows/ci.yml` | push 触发 CI；构建成功后上传产物（保留 1 天） | 参考 |

## 2. 事故复盘（背景，2026-11-13）

- 8G 服务器跑 `deploy.sh` 本地 Turbopack 构建 → OOM killer 杀 `next-build`，`.next/standalone` 被清空；
- 旧脚本失败后仍 `pm2 start` → 崩溃循环 657 次；
- 处置：构建移至 CI（16G），服务器只安装产物；`deploy-artifact.sh` 增加备份/校验/探活/失败回滚提示；
- 服务器保留 12G swap 作为兜底，但**这不代表可以在服务器本地构建**。

## 3. 标准部署流程（当前唯一稳定路径）

> 适用范围：本机 Windows（PowerShell）+ GitHub CI + 腾讯云服务器 `117.72.108.14`（`/root/supply-os`，pm2 `supply-os`，端口 3039）。
> 背景：GitHub runner → 国内服务器上传只有约 160KB/s 且经常超时/半包；本机 → 服务器实测约 1.5MB/s。因此采用「CI 构建 → 本机中转 → 服务器安装」。

### 3.1 前置检查

1. 代码已提交并推送到 `origin/main`：
   ```bash
   git status --porcelain   # 必须干净（除明确不发布的 WIP；next-env.d.ts 的 dev 再生成噪音先还原）
   # 本机 .gitconfig 配了 http.proxy 127.0.0.1:7897（Clash 系）——代理没在跑时 push 会
   # "Could not connect to server"，绕过即可（github.com 直连可达）：
   git -c http.proxy= -c https.proxy= push origin main
   ```
2. 本机 SSH 可用（密钥是 `id_ed25519_prod`，走 `prod` 别名——config 内含 3307 隧道转发；
   隧道已被 Docker 容器占用时加 `-o ExitOnForwardFailure=no`，只执行命令不需要转发）：
   ```bash
   ssh -o BatchMode=yes -o ExitOnForwardFailure=no prod "echo ok"
   ```
3. GitHub token 可用（下面命令从 git 凭据读取，不落盘）：
   ```powershell
   $cred = "protocol=https`nhost=github.com`n`n" | git credential fill
   $token = ($cred -split "`n" | Where-Object { $_ -like "password=*" } | Select-Object -First 1).Substring(9)
   ```

### 3.2 Step 1 — 触发 CI 构建（Turbopack）

GitHub UI：Actions → **Build Artifact** → Run workflow（branch = main）。

或本地 API 触发（PowerShell）：

```powershell
curl.exe -sS --ssl-no-revoke -X POST `
  -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" `
  -H "Content-Type: application/json" `
  --data-binary '{"ref":"main"}' `
  https://api.github.com/repos/Hu-Right/supply-os/actions/workflows/build-artifact.yml/dispatches
```

构建约 2–5 分钟。确认状态：

```powershell
curl.exe -sS --ssl-no-revoke -H "Authorization: Bearer $token" `
  "https://api.github.com/repos/Hu-Right/supply-os/actions/workflows/build-artifact.yml/runs?per_page=1"
```

> 记录本次 `run_id` 与 artifact `id`，写进 §9 部署记录。

### 3.3 Step 2 — 下载产物（必须分片并行/断点续传）

GitHub → 本机单连接约 30KB/s，51MB 单线程会超时（实测 900s 只到 29.6MB）。必须用 **8 分片 Range 并行**下载：

```powershell
# 8 分片并行下载（总大小以 API 返回为准，本例 53,360,713 字节）
# 每片：curl -L -r start-end -H "Authorization: Bearer $token" <artifact zip URL>
# 全部完成后按 part0..part7 顺序拼接为 tmp/next-standalone.zip
```

artifact zip URL：

```
https://api.github.com/repos/Hu-Right/supply-os/actions/artifacts/<artifact_id>/zip
```

分片下载后校验并解压：

```powershell
Expand-Archive -Path tmp\next-standalone.zip -DestinationPath tmp\artifact -Force
# 找到 next-standalone.tar.gz，复制到 tmp\next-standalone.tar.gz
```

### 3.4 Step 3 — 本地校验（不过不传）

```powershell
(Get-Item tmp\next-standalone.tar.gz).Length          # 与 API size 接近
tar -tzf tmp\next-standalone.tar.gz | Select-String '^\./server\.js$'
(Get-FileHash tmp\next-standalone.tar.gz -Algorithm SHA256).Hash.ToLower()
```

必须同时满足：`server.js` 存在、sha256 已记录、tar 可正常列出（Windows 无 gzip 命令时用 `tar -tzf` 代替校验）。

### 3.5 Step 4 — 上传服务器并二次校验

```powershell
scp -i ~/.ssh/id_ed25519 tmp\next-standalone.tar.gz root@117.72.108.14:/tmp/next-standalone.tar.gz
ssh -i ~/.ssh/id_ed25519 root@117.72.108.14 "sha256sum /tmp/next-standalone.tar.gz"
```

**远程 sha256 必须与本地一致**，否则删除重传；不要用半包部署。

### 3.6 Step 5 — 服务器安装产物

```powershell
scp -i ~/.ssh/id_ed25519 scripts\tools\deploy-artifact.sh root@117.72.108.14:/tmp/deploy-artifact.sh
ssh -i ~/.ssh/id_ed25519 root@117.72.108.14 "cd /root/supply-os && APP_DIR=/root/supply-os bash /tmp/deploy-artifact.sh /tmp/next-standalone.tar.gz"
```

脚本行为：备份旧版到 `runtime/standalone-bak` → 解包到临时目录 → 校验 `server.js` → 原子替换 → 回填 `runtime/public-downloads` → `pm2` 重启 → **最长 360s 探活**（bootstrap 冷启动可能 5 分钟，不要提前判失败）。

### 3.7 Step 6 — 部署后验证（必须全绿）

```bash
# 1) 站点
curl -s -o /dev/null -w "%{http_code}\n" https://osneosmart.com/

# 2) 运行态
ssh root@117.72.108.14 "cat /root/supply-os/.next/standalone/.next/BUILD_ID; \
  pm2 list | grep supply-os; \
  tail -50 /root/.pm2/logs/supply-os-out.log | grep -E 'bootstrap|Ready'"

# 3) 迁移账本（末位版本应为当前最新）
ssh root@117.72.108.14 "mysql -D crm -N -e 'SELECT MAX(version) FROM schema_migrations'"
```

验证标准：HTTP 200、`BUILD_ID` 为新构建、pm2 uptime 重新计时且重启次数 0、bootstrap 三项（schema/featured/payment）完成、ledger 版本符合预期。

### 3.8 Step 7 — 清理与记录

```powershell
ssh -i ~/.ssh/id_ed25519 root@117.72.108.14 "rm -f /tmp/next-standalone.tar.gz /tmp/deploy-artifact.sh"
Remove-Item tmp\next-standalone.zip,tmp\artifact -Recurse -Force
```

按 §9 填写本次部署记录。

## 4. 大静态资源（public/downloads）

`public/downloads`（约 82MB 培训 PDF/报告）**不打进产物**：打包时 `--exclude='./public/downloads'`，服务器由持久目录 `/root/supply-os/runtime/public-downloads` 回填。

- 首次部署：`deploy-artifact.sh` 会从旧产物播种；
- 更新资料：直接替换持久目录文件后 `pm2 restart supply-os`，无需重新部署；
- 换服务器：除 `.env` 外必须拷贝 `runtime/public-downloads/`，否则 `/downloads/*` 404。

## 5. 禁用 / 不推荐路径

| 路径 | 结论 | 原因 |
|---|---|---|
| `deploy.yml`（CI 构建 + runner 直传） | ⚠️ 网络好时才可用 | 2026-11-18 实测：51MB 上传 15 分钟超时（约 60KB/s），重试 3 次仍失败；`Upload & deploy` 步骤 30 分钟超时 |
| 服务器本地构建（`deploy.sh`） | ❌ 8G 禁用 | Turbopack 峰值 7GB+，必 OOM（§2） |
| webpack 构建 | ❌ 禁止 | 项目只用 Turbopack；任何 `next build --webpack` 都不允许 |
| 手动替换 `.next/standalone` / 半包安装 | ❌ 禁止 | 绕过备份与校验，易造成 502 / 崩溃循环 |
| 在 `127.0.0.1:3307` 上直接跑迁移/清洗脚本 | ❌ 禁止未确认 | 那是生产库隧道（§0.4） |

## 6. 故障排查清单

```bash
free -h; swapon --show
dmesg -T | grep -iE "out of memory|killed process" | tail
pm2 list; pm2 logs supply-os --lines 100 --nostream
```

- `Cannot find module .next/standalone/server.js` → 产物缺失，按 §3 重新下发；
- OOM → 确认构建是否在服务器本地跑；立即停止并改走 §3；
- pm2 重启次数暴涨 → 先 `pm2 delete supply-os` 止血，再排查产物/启动错误；
- 探活超时但端口在听 → 冷启动 bootstrap（Meili 全量重建）可能 5 分钟以上，查看 bootstrap 日志后再判断。

## 7. 回滚

- 产物回滚：`deploy-artifact.sh` 部署前已备份到 `runtime/standalone-bak/`，按脚本输出提示恢复；
- 代码回滚：服务器 `git reset --hard <上一提交>` 后按 §3 重新下发；
- 数据库/结构回滚见各 ADR（与部署独立）。

## 8. 部署记录（每次部署后填写）

| 日期时间 | 提交 | BUILD_ID | 产物 sha256（前 16 位） | 产物大小 | 操作人 | 验证结果 | 回滚点 |
|---|---|---|---|---|---|---|---|
| 2026-11-19 00:05 | cb5916fb | h8IuYoqDhSlJDACAtVetK | 2ce71c47d3270970 | 53.5 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新 / pm2 重启 0 / ledger 55 / bootstrap ✓ | runtime/standalone-bak |
| 2026-11-19 12:31 | 33ed0c58 | 5r-UiVBI39-xgkUUoQGtJ | 652f3a7615e1fad7 | 53.2 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新 / pm2 重启 0 / ledger 57 / bootstrap ✓ | runtime/standalone-bak |
| 2026-11-19 21:2x | 68eecae7 | WJL5QsoqXj5VTWbOxRZxypm2 | 35be1e0a9dd73f39 | 54.6 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新 / pm2 重启 0 / ledger 61 / bootstrap ✓ / E2E 59 用例先行全绿（vip/free） | runtime/standalone-bak |
| 2026-11-20 00:4x | a3b5764a | k2tMN2n-3oVreLMH2Ny9w | 6fd7db67853028a1 | 54.6 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新 / pm2 重启 0 / ledger 61 / bootstrap ✓ / E2E 59 用例先行全绿 + 生产 curl 实测新错误 envelope（ADR-0021） | runtime/standalone-bak |
| 2026-11-20 13:52 | 42e00825 | EWPWG3ls4f9OQkJhxQNgR | 0e89c7486cfd7f8b | 55.1 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（k2tMN2n→EWPWG3l）/ pm2 重启 0 / bootstrap schema 74ms ✓ / OG 图 200（98,860 B PNG）/ /downloads 200 / 迁移 065 已就位 | runtime/standalone-bak |
| 2026-11-20 16:07 | b4407579 | psJAyOGRVSEsmu8m7nvbM | 0b8edb8dd63e29e3 | 55.0 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（EWPWG3l→psJAyOGR）/ pm2 重启 0 / bootstrap schema·featured·payment ✓ / ledger 65 / 权益矩阵链路线上实测通过（free.qualification_access=1 后 detail 200、qualificationAccess=true） | runtime/standalone-bak |
| 2026-11-23 12:00 | 0e5193fe | gmiB3HLUNP4RqqqcSdzp- | a72c646684dfa836 | 53.3 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（psJAyOGR→gmiB3HLU）/ pm2 重启 0 / ledger 68（067·068 迁移已就位）/ bootstrap schema 541ms·featured 76s·payment 121ms ✓ / CI 全绿（4 job，run 45108176788，artifact 14787984997）/ 产物 sha256 本机↔服务器一致 / /downloads 资源 200 | runtime/standalone-bak |
| 2026-11-24 16:40 | 42301dfc | 3KwDcbHP7hM5zonYXXdMW | b5f72952eed7acb8 | 55.4 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（gmiB3HLU→3KwDcbH）/ pm2 重启 0 / bootstrap schema·featured·payment ✓ / ledger 78 / about·contact·faq·llms 200 / 软 404 返回真 404 / 公告详情要点与相关公告上线 | runtime/standalone-bak |
| 2026-11-24 16:55 | 584d6f7c | h-fzqwdc1c69ZCgvtvumc | aa2d852d990638c5 | 55.4 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（3KwDcbH→h-fzqwd）/ pm2 重启 0 / bootstrap schema·featured·payment ✓ / ledger 78 / 首页 ISR 60s，二次命中后统计 375,468·8,437·189·146,632 / 软 404 仍 404 | runtime/standalone-bak |
| 2026-11-25 16:18 | e1614a31 | ahOwheSjoYxg6Q6wAY6iQ | 863a5a0b6d30e5ec | 56.5 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（q1ecwpH→ahOwheS）/ pm2 重启 0 / ledger 81 / 商机首屏 10 条 SSR / 供应商首屏 8 家 SSR / sitemap 分片 50,000 URL / free+vip 双账号登录与详情通过 / 英文 about·services·faq·contact·supplier·procurement 200 / 软 404 仍 404 | runtime/standalone-bak |
| 2026-11-25 23:04 | d42d65d1 | Jupf-pUfnQWs9u07a3bEA82 | 33af91ad1c56b3b5 | 55.97 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（rjXmwEf→Jupf-pUfn，含 16:18 后一次未记录部署）/ pm2 重启 0 / ledger 81（迁移 082 物化表方案已撤销：生产孤儿表 DROP + 账本行 82 删除）/ sitemap 快照架构上线：首次重建 4 片 151,737 条 216s，热路径读文件 / /en·/llms.txt·/billing·国别 slug 全部 404 / 静态片 22 页（补 rfq·learning·copyright）/ 首页与 10 公开页新关键词标题上线 / 公告详情 title_cn 中文优先（无译文回退原文）/ 英文站与 AI 专享页退役（ADR-0023/0024/0025/0026） | runtime/standalone-bak |
| 2026-11-26 16:05 | a2aecfe8 | Ye_Zm5FpT2dc8vIz7KuEk | 5b97eb1d905bc52c | 55.9 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（Jupf-pUfn→Ye_Zm5Fp）/ pm2 重启 0 / bootstrap schema·featured·payment ✓ / ledger 82 / 学习资料全站下线（/learning 404，/training·/ecosystem 200）/ 国别页 ?country=BR 200 / CI+构建产物 run 45778250551·artifact 15096922713 | runtime/standalone-bak |
| 2026-11-26 16:57 | e4a33f8a | TsX-tgGumElfe5fVejep- | d39c485675aadec8 | 55.8 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（Ye_Zm5Fp→TsX-tgGu）/ pm2 重启 0 / bootstrap schema·featured·payment ✓ / ledger 82 / CI 5/5 全绿（run 45785678955）/ 构建 run 45785680947·artifact 15100810489 / /learning 404 · /training·/ecosystem 200 · ?country=BR 200 | runtime/standalone-bak |
| 2026-11-26 17:35 | b80d7820 | Ed0usDxd_SZA9WYiQpepU | a9e0205a217f9080 | 55.7 MB | 苏御凡(AI) | HTTP 200 / BUILD_ID 更新（TsX-tgGu→Ed0usDxd）/ pm2 重启 0 / bootstrap ✓ / ledger 82 / CI 5/5（run 45791189164）/ 构建 run 45791198312·artifact 15103570069 / 能力档案证书收口 150 字典：78 条重复证书行已从 enterprise_capability_items 移除（仅留 1 条业绩） | runtime/standalone-bak |
