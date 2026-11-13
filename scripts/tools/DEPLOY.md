# 部署与 OOM 处置（2026-11-13 事故复盘）

## 1. 现象

- `bash scripts/tools/deploy.sh` 反复失败，站点 502；
- 服务器 8G 内存被吃满，`dmesg` 连续出现 `Out of memory: Killed process ... next-build`；
- `pm2 list` 显示 `supply-os` 重启次数 194→657 且 uptime 0s（崩溃循环）；
- 错误日志：`Cannot find module '/root/supply-os/.next/standalone/server.js'`。

## 2. 根因

1. **Turbopack 构建峰值内存超出机器**：Next 16.3.4 + Turbopack 全量构建实测 `next-build` RSS 6.9–7.5GB（VM 41GB）。`NODE_OPTIONS=--max-old-space-size=2560` 只能限制 V8 堆，**限制不了 Turbopack 原生内存**。8G 机器上同时还有 MySQL（buffer pool 2G）+ Meilisearch（1.8G），构建必然触发 OOM killer。
2. **失败后崩溃循环**：旧 `deploy.sh` 的 trap 在构建失败后仍执行 `pm2 start .next/standalone/server.js`；但 `.next` 已被构建部分清空、`server.js` 不存在，pm2 无限重启（每次 `MODULE_NOT_FOUND`）。
3. 构建失败后未保留上一版可运行产物，无法回滚。

## 3. 已落地的修复

### 3.1 代码/脚本（仓库内）

- `next.config.ts`：`experimental.turbopackMemoryEviction = "full"`（Turbopack 内存驱逐策略，默认 `auto`；`full` 更省内存、构建更慢，仍是 Turbopack）。
- `scripts/tools/deploy.sh`：
  - **< 12GB 内存默认拒绝本地构建**（`ALLOW_LOW_MEM_BUILD=1` 可强制），直接提示改用产物部署；
  - 构建前停 Meili + PM2 + **MySQL**（`STOP_MYSQL_ON_BUILD=0` 可关）；
  - 构建前把 `.next/standalone` 备份到 `runtime/standalone-bak`；
  - 构建后**硬校验** `standalone/server.js`，缺失则回滚备份并退出；
  - trap 只在有可用产物时拉起 pm2，缺产物保持停服（不再崩溃循环）；
  - 构建日志落到 `runtime/deploy-build-*.log`。
- `scripts/tools/deploy-artifact.sh`：**低内存机器推荐路径**——安装 CI 构建好的 standalone 产物、备份旧版、校验、探活、失败给回滚命令。
- `.github/workflows/deploy.yml`：`workflow_dispatch` 手动触发，CI（16G runner）Turbopack 构建 → 打包 → SSH 下发 → 调 `deploy-artifact.sh`。
- `.github/workflows/ci.yml`：构建成功后上传 `next-standalone` 产物（保留 1 天）。

### 3.2 服务器侧（本次事故处置）

- 停掉崩溃循环（`pm2 delete supply-os`）；
- 启用 `/swapfile2` 8G + 临时 `/swapfile3` 16G（应急，后已移除 swapfile3，保留 12G swap）；
- 用 CI 产物恢复上线（`https://osneosmart.com` HTTP 200，pm2 重启 0）；
- 清理临时 GitHub token、构建残留。

> 冷启动提示：应用启动后 `instrumentation` 会跑 bootstrap（schema / featured / payment），
> 冷缓存或 Meili 全量重建时实测可达 **5 分钟以上**，期间端口在听但首页会被拖住。
> `deploy-artifact.sh` 探活窗口已放到 360s，不要按 60s 误判部署失败。
> 本次事故中 Meilisearch 重启后触发全量重建（RSS 5.2G、高 IO），会把 8G 机器拖入 swap
> 抖动；必要时先 `systemctl stop meilisearch` 让搜索走 MySQL 降级，错峰再让它重建索引。

## 4. 日常部署方式（二选一）

### A. 推荐：CI 构建 + 产物下发（服务器 8G 不动）

1. GitHub 仓库 Settings → Secrets 添加：
   - `DEPLOY_SSH_KEY`：服务器私钥（对应 `~/.ssh/authorized_keys`）
   - `DEPLOY_HOST`：`117.72.108.14`
   - `DEPLOY_USER`：`root`
2. Actions → **Deploy** → Run workflow。
3. 流程：CI 构建 Turbopack（16G）→ tar → scp → `deploy-artifact.sh`（备份/探活/失败回滚提示）。

本地手动等价：

```bash
# 在 CI 或大内存机器构建后
scp next-standalone.tar.gz root@SERVER:/tmp/
ssh root@SERVER "cd /root/supply-os && bash scripts/tools/deploy-artifact.sh /tmp/next-standalone.tar.gz"
```

### B. 升内存后仍用服务器本地构建

把生产机内存升到 **16GB**（建议），然后：

```bash
cd /root/supply-os && ALLOW_LOW_MEM_BUILD=1 bash scripts/tools/deploy.sh
```

构建前脚本会自动停 Meili/PM2/MySQL；构建完成恢复。8G 机器**不要**尝试本地全量构建。

## 5. 应急排查清单

```bash
free -h; swapon --show
dmesg -T | grep -iE "out of memory|killed process" | tail
pm2 list; pm2 logs supply-os --lines 100 --nostream
journalctl -b -1 -k | grep -iE "oom|killed process" | tail
```

- `Cannot find module .next/standalone/server.js` → 产物缺失，用 §4A 重新下发；
- OOM 反复 → 确认构建是否在 8G 本地跑；停止后按 §4A；
- pm2 重启次数暴涨 → 先 `pm2 delete supply-os` 止血，再定位产物/启动错误。

## 6. 回滚

- 产物回滚：`deploy-artifact.sh` 部署前备份在 `runtime/standalone-bak/`，失败时按脚本提示恢复；
- 代码回滚：服务器 `git reset --hard <上一提交>` 后按 §4 重新下发/构建；
- 数据库/结构回滚见各 ADR（与部署无关）。
