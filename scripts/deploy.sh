#!/usr/bin/env bash
# 服务器端部署脚本（Docker Compose）：拉取最新代码 → 重新构建镜像 → 重启容器
# 由 GitHub Actions（.github/workflows/deploy.yml）通过 SSH 调用，
# 也可在服务器上手动执行：bash scripts/deploy.sh
set -euo pipefail

# 部署目录与分支（可通过环境变量覆盖）
APP_DIR="${APP_DIR:-/root/supply-os}"
BRANCH="${BRANCH:-main}"
# 是否启用 Meilisearch 搜索（with-search profile）；设为 "on" 时随应用一起启动
ENABLE_SEARCH="${ENABLE_SEARCH:-off}"

echo "[deploy] $(date '+%F %T') 开始部署: ${APP_DIR} (分支 ${BRANCH})"

cd "${APP_DIR}"

# 1. 拉取最新代码：强制对齐远端，避免服务器本地误改导致合并冲突
#    注意：.env.production / docker 数据卷均为 gitignore 未跟踪内容，reset 不影响它们
echo "[deploy] 拉取最新代码..."
git fetch origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

# 2. 构建镜像并重启容器（依赖 .env.production，首次部署需手动创建）
echo "[deploy] 构建并重启容器..."
if [ "${ENABLE_SEARCH}" = "on" ]; then
  docker compose --profile with-search up -d --build
else
  docker compose up -d --build
fi

# 3. 清理悬空镜像，释放磁盘空间
echo "[deploy] 清理旧镜像..."
docker image prune -f

echo "[deploy] $(date '+%F %T') 部署完成，当前容器状态："
docker compose ps
