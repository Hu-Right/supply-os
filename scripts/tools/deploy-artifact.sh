#!/usr/bin/env bash
# 低内存服务器用的「产物部署」脚本：不在本机构建，直接安装 CI 构建好的 standalone。
#
# 背景（2026-11-13 事故）：8G 生产机跑 Next 16 Turbopack 全量构建，峰值 RSS 7GB+，
# 被 OOM killer 杀掉；旧 .next/standalone 被清空后 pm2 仍指向 server.js，崩溃循环 657 次。
# 结论：构建放 CI（16G runner），服务器只做 runtime。本脚本负责把产物原子换入并重启。
#
# 用法：
#   bash scripts/tools/deploy-artifact.sh /tmp/next-standalone.tar.gz
# 环境变量：APP_DIR（默认 /root/supply-os）、APP_NAME（supply-os）、APP_PORT（3039）
set -euo pipefail

ARTIFACT="${1:-/tmp/next-standalone.tar.gz}"
APP_DIR="${APP_DIR:-/root/supply-os}"
APP_NAME="${APP_NAME:-supply-os}"
APP_PORT="${APP_PORT:-3039}"

[ -f "${ARTIFACT}" ] || { echo "[artifact-deploy] ✗ 产物不存在：${ARTIFACT}"; exit 1; }
cd "${APP_DIR}"

echo "[artifact-deploy] $(date '+%F %T') 安装产物：${ARTIFACT}"

# 1. 备份当前可运行产物（失败可回滚）
HAS_BACKUP=0
if [ -f .next/standalone/server.js ]; then
  rm -rf runtime/standalone-bak
  mkdir -p runtime
  cp -a .next/standalone runtime/standalone-bak
  HAS_BACKUP=1
  echo "[artifact-deploy] 已备份上一版 → runtime/standalone-bak"
fi

# 2. 解包换入（先解到临时目录，校验 server.js 再替换，避免半成品上线）
STAGE="$(mktemp -d)"
STAGE_MOVED=0
cleanup_stage() { [ "${STAGE_MOVED}" = "1" ] || rm -rf "${STAGE}"; }
trap cleanup_stage EXIT
tar -xzf "${ARTIFACT}" -C "${STAGE}"
[ -f "${STAGE}/server.js" ] || { echo "[artifact-deploy] ✗ 产物缺少 server.js，中止（线上保持上一版）"; exit 1; }
rm -rf .next/standalone
mkdir -p .next
mv "${STAGE}" .next/standalone
STAGE_MOVED=1

# 3. 运行期文件：.env、nodejieba 词典、上传目录
cp -f .env .next/standalone/.env
if [ -d node_modules/nodejieba/submodules/cppjieba/dict ]; then
  mkdir -p .next/standalone/node_modules/nodejieba/submodules/cppjieba/dict
  cp -a node_modules/nodejieba/submodules/cppjieba/dict/. \
        .next/standalone/node_modules/nodejieba/submodules/cppjieba/dict/
fi
mkdir -p runtime/uploads/license

# 4. 重启 + 探活
#    注意：冷启动不只是 Next 起来——instrumentation 的 bootstrap（schema / featured / payment）
#    在冷缓存或 Meili 索引重建时实测可达 3–5 分钟，期间端口在听但请求会被拖住。
#    因此探活窗口放到 360s；探活期间不要误判为部署失败。
pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
NODE_ENV=production PORT="${APP_PORT}" pm2 start .next/standalone/server.js --name "${APP_NAME}"
pm2 save >/dev/null 2>&1 || true

echo "[artifact-deploy] 等待应用就绪（含 bootstrap，最多 360s）..."
for i in $(seq 1 72); do
  if curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:${APP_PORT}/"; then
    echo "[artifact-deploy] ✔ 部署完成，应用 HTTP 200（端口 ${APP_PORT}，等待 ${i}0s 内就绪）"
    exit 0
  fi
  if [ $((i % 12)) -eq 0 ]; then
    echo "[artifact-deploy] 仍在等待启动（${i}0s）… 可查看 pm2 logs ${APP_NAME}"
  fi
  sleep 5
done

echo "[artifact-deploy] ✗ 启动后端口 ${APP_PORT} 未应答，请检查：pm2 logs ${APP_NAME}"
if [ "${HAS_BACKUP}" = "1" ]; then
  echo "[artifact-deploy] 回滚命令：rm -rf .next/standalone && cp -a runtime/standalone-bak .next/standalone && pm2 restart ${APP_NAME}"
fi
exit 1
