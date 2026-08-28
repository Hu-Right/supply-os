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
echo "[deploy] 构建..."
npm run build

# 3.5 复制 .env 到 standalone 目录（优先使用服务器现有配置，避免覆盖生产环境数据库凭据）
if [ -f .next/standalone/.env ]; then
  echo "[deploy] ✓ 保留服务器现有 .next/standalone/.env（避免覆盖生产配置）"
elif [ -f .env ]; then
  cp .env .next/standalone/.env
  echo "[deploy] 已复制 .env → .next/standalone/.env"
else
  echo "[deploy] ✗ 未找到任何 .env 文件，应用无法连接数据库"
  exit 1
fi

# 3.6 数据库预检（使用 standalone 目录的 .env）
echo "[deploy] 检查 MySQL 服务..."
ENV_FILE=".next/standalone/.env"
DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d'"' -f2)
DB_PASS=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d'"' -f2)
DB_HOST=$(grep '^DB_HOST=' "$ENV_FILE" | cut -d'"' -f2)

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
  echo "[deploy] ✗ .env 中缺少 DB_USER 或 DB_PASSWORD"
  exit 1
fi

if command -v mysqladmin >/dev/null 2>&1; then
  if mysqladmin -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" ping >/dev/null 2>&1; then
    echo "[deploy] ✓ MySQL 连接正常 ($DB_HOST)"
  else
    echo "[deploy] ✗ MySQL 连接失败 (host=$DB_HOST, user=$DB_USER)"
    echo "[deploy]   请检查：1) 数据库服务是否运行  2) 凭据是否正确  3) 网络是否可达"
    exit 1
  fi
else
  echo "[deploy] ⚠ 跳过 MySQL 预检（mysqladmin 未安装）"
fi

# 4. 重启应用（pm2 托管，保持常驻）
#    Next.js standalone 模式入口为 .next/standalone/server.js
#    注意：必须先 delete + kill 再 start，pm2 reload 会保留旧的入口文件配置（如 dist/server.mjs）
echo "[deploy] 重启应用..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "${APP_NAME}" 2>/dev/null || true
  pm2 kill 2>/dev/null || true
  sleep 2  # 等待 pm2 完全停止
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
