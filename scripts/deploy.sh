#!/usr/bin/env bash
# 服务器端部署脚本（裸装）：拉取最新代码 → 安装依赖 → 构建 → 重启应用（pm2）
# 当前部署方式：登录服务器手动执行 `bash scripts/deploy.sh`（无自动触发）。
# 历史上曾由 GitHub Actions（.github/workflows/deploy.yml）触发，该 workflow 已在
# commit 50fe133b「remove .github ... and CI workflows」中删除，仓库内已无任何 CI 入口。
set -euo pipefail

# 部署目录、应用名与分支（可通过环境变量覆盖）
APP_DIR="${APP_DIR:-/root/supply-os}"
APP_NAME="${APP_NAME:-supply-os}"
BRANCH="${BRANCH:-main}"

echo "[deploy] $(date '+%F %T') 开始部署: ${APP_DIR} (分支 ${BRANCH})"

cd "${APP_DIR}"

# 1. 拉取最新代码：强制对齐远端，避免服务器本地误改导致合并冲突
#    注意：.env / bin / logs / runtime 均为 gitignore 未跟踪文件，reset 不影响它们
echo "[deploy] 拉取最新代码..."
git fetch origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

# 2. 安装依赖（node_modules 已存在时增量安装，避免每次 ci 删除重装导致超时）
echo "[deploy] 安装依赖..."
if [ -d node_modules ]; then
  npm install
else
  npm ci
fi

# 3. Next.js 构建（output: standalone → .next/standalone/）
echo "[deploy] 构建..."

# 3.1 备份现有 .env（如果存在）
if [ -f .next/standalone/.env ]; then
  cp .next/standalone/.env /tmp/supply-os.env.bak
  echo "[deploy] 已备份 .env"
fi

npm run build

# 3.2 恢复 / 显式提供 .env（Next.js standalone 模式的进程 cwd 是 .next/standalone/）
#     生产 env 只有两个合法来源：build 前的备份，或显式指定的 APP_ENV_FILE。
#     【不再回落拷贝仓库根 .env】——根 .env 通常是开发机配置（DB_PORT=3307 是笔记本上
#     SSH 隧道的本地端口），静默拷上生产会让应用在启动期连不上数据库却对外显示 online。
#     /tmp 会被开机清理，备份不保证存在；缺来源时停下让人决定，而不是猜。
if [ -f /tmp/supply-os.env.bak ]; then
  cp /tmp/supply-os.env.bak .next/standalone/.env
  echo "[deploy] 已恢复 build 前的 .env 备份"
elif [ -n "${APP_ENV_FILE:-}" ] && [ -f "${APP_ENV_FILE}" ]; then
  cp "${APP_ENV_FILE}" .next/standalone/.env
  echo "[deploy] 已从 APP_ENV_FILE 写入 standalone/.env"
else
  echo "[deploy] ✗ 无法确定生产 .env 来源，停止部署（不做任何猜测）："
  echo "[deploy]   · /tmp/supply-os.env.bak 不存在（/tmp 可能已被开机清理）"
  echo "[deploy]   · 未提供 APP_ENV_FILE"
  echo "[deploy] 中断点在构建之后、重启之前，线上进程未受影响。显式指定后重跑："
  echo "[deploy]   APP_ENV_FILE=/绝对路径/生产.env bash scripts/deploy.sh"
  echo "[deploy] （若仓库根 .env 是开发机配置，直接指过来会导致启动期连不上数据库）"
  exit 1
fi

# 3.3 复制静态资源（standalone 模式不会自动复制 .next/static）
cp -rT .next/static .next/standalone/.next/static
node scripts/css-compat-gate.mjs .next/standalone/.next/static
echo "[deploy] 已复制并检查静态资源 → standalone"

# 3.4 复制 public 目录（字体、图片等静态文件）
#     使用 -T 将目标视为目录，避免 cp -r 在目标已存在时嵌套为 public/public/
cp -rT public .next/standalone/public/
echo "[deploy] 已复制 public → standalone"

# 3.5 营业执照等运行期上传目录（方案 A：存于仓库根 runtime/，不在 public/ 内，
#     因此不受上面 cp -rT 整体替换 public 影响，跨部署持久。git reset --hard 亦不波及 gitignore 的 runtime/。）
mkdir -p "${APP_DIR}/runtime/uploads/license"
echo "[deploy] 已确保 runtime/uploads/license 持久目录存在"

# 3.6 nodejieba 词典文件（Next.js standalone 不会自动复制原生模块的 dict 资源，
#     缺失时 Meilisearch 全量重建触发 nodejieba 分词 → FATAL 崩溃 → PM2 无限重启）
if [ -d node_modules/nodejieba/submodules/cppjieba/dict ]; then
  mkdir -p .next/standalone/node_modules/nodejieba/submodules/cppjieba/dict
  cp -a node_modules/nodejieba/submodules/cppjieba/dict/. .next/standalone/node_modules/nodejieba/submodules/cppjieba/dict/
  echo "[deploy] 已复制 nodejieba 词典 → standalone"
fi

# 4. 重启应用（pm2 托管，保持常驻）
#    Next.js standalone 模式入口为 .next/standalone/server.js
#    注意：必须 delete + kill 再 start，pm2 reload 会保留旧的入口文件配置（如 dist/server.mjs）
echo "[deploy] 重启应用..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "${APP_NAME}" 2>/dev/null || true
  pm2 kill 2>/dev/null || true
  NODE_ENV=production PORT=3039 pm2 start .next/standalone/server.js --name "${APP_NAME}"
  pm2 save
else
  echo "[deploy] ⚠ 未安装 pm2，请先执行："
  echo "          npm i -g pm2"
  echo "          NODE_ENV=production pm2 start ${APP_DIR}/.next/standalone/server.js --name ${APP_NAME}"
  echo "          pm2 save && pm2 startup"
  exit 1
fi

echo "[deploy] $(date '+%F %T') 部署完成，当前进程状态："
pm2 list | grep "${APP_NAME}" || true
