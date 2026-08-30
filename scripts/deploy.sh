#!/usr/bin/env bash
# 服务器端部署脚本（裸装）：拉取最新代码 → 安装依赖 → 构建 → 重启应用（pm2）
# 由 GitHub Actions（.github/workflows/deploy.yml）通过 SSH 调用，
# 也可在服务器上手动执行：bash scripts/deploy.sh
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
#    构建会重建 .next/standalone/ 目录，导致 .env 被删除
#    因此构建前备份，构建后恢复
echo "[deploy] 构建..."

# 3.1 备份现有 .env（如果存在）
if [ -f .next/standalone/.env ]; then
  cp .next/standalone/.env /tmp/supply-os.env.bak
  echo "[deploy] 已备份 .env"
fi

npm run build

# 3.2 恢复 .env
if [ -f /tmp/supply-os.env.bak ]; then
  cp /tmp/supply-os.env.bak .next/standalone/.env
  echo "[deploy] 已恢复 .env"
elif [ -f .env ]; then
  cp .env .next/standalone/.env
  echo "[deploy] 首次部署：复制 .env → .next/standalone/.env"
fi

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
