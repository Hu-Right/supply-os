#!/usr/bin/env bash
# 服务器端部署脚本（裸装）：拉取最新代码 → 安装依赖 → 构建 → 重启应用（pm2）
# 当前部署方式：登录服务器手动执行 `bash scripts/tools/deploy.sh`（无自动触发）。
# 历史上曾由 GitHub Actions（.github/workflows/deploy.yml）触发，该 workflow 已在
# commit 50fe133b「remove .github ... and CI workflows」中删除，仓库内已无任何 CI 入口。
set -euo pipefail

# 部署目录、应用名与分支（可通过环境变量覆盖）
APP_DIR="${APP_DIR:-/root/supply-os}"
APP_NAME="${APP_NAME:-supply-os}"
APP_PORT="${APP_PORT:-3039}"
BRANCH="${BRANCH:-main}"

echo "[deploy] $(date '+%F %T') 开始部署: ${APP_DIR} (分支 ${BRANCH})"

cd "${APP_DIR}"

# 1. 拉取最新代码：强制对齐远端，避免服务器本地误改导致合并冲突
#    注意：.env / bin / logs / runtime 均为 gitignore 未跟踪文件，reset 不影响它们
echo "[deploy] 拉取最新代码..."
git fetch origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

# 1.1 自我替换防护（重要）：bash 是按字节边读边执行脚本的。上面 reset --hard 会把
#     本文件换成新版（新 inode），而当前进程的 fd 仍指着被删掉的旧 inode ⇒ 后半程
#     会继续跑「旧脚本」。旧脚本引用的路径可能已被本次 checkout 改名——实际踩过一次：
#     scripts/css-compat-gate.mjs 在 8f0ef69d 被搬到 scripts/gates/，旧脚本按老路径找
#     不到 → MODULE_NOT_FOUND → set -e 中断在 pm2 重启之前，线上留着旧进程。
#     因此同步完立刻用工作树里的新版重新 exec 一次，用环境变量做闸门防止无限递归。
#     （注：本次旧脚本里没有这段，所以它仍会跑旧逻辑——再跑一次就是新版了。）
if [ -z "${DEPLOY_RELOADED:-}" ]; then
  export DEPLOY_RELOADED=1
  echo "[deploy] 代码已对齐 origin/${BRANCH}，改用 reset 后的新版脚本重跑一次"
  exec bash "${APP_DIR}/scripts/tools/deploy.sh" "$@"
fi

# 2. 安装依赖（node_modules 已存在时增量安装，避免每次 ci 删除重装导致超时）
echo "[deploy] 安装依赖..."
if [ -d node_modules ]; then
  npm install
else
  npm ci
fi

# 3. Next.js 构建（output: standalone → .next/standalone/）
echo "[deploy] 构建..."

# 3.0 低内存构建前置（2026-11-03 / 2026-11-13 事故）：
#     本机 8G 同时跑 MySQL(2G buffer pool)+Meili(1.8G+) 时，Next 16 Turbopack 构建峰值
#     RSS 可达 7GB+，曾被 OOM killer 连续三次杀掉（构建进程 anon-rss ~7.5G）；
#     构建失败后旧 .next 已被部分清空，pm2 仍指向不存在的 server.js → 崩溃循环 657 次。
#     现在：构建前停 Meili + PM2 + MySQL 释放内存；并备份上一版 standalone 产物，
#     任何失败路径都先回滚产物再决定是否拉起应用；缺产物时绝不启动 pm2（防崩溃循环）。
#     Turbopack 峰值内存另由 next.config.ts 的 experimental.turbopackMemoryEviction='full'
#     压制（默认 'auto'）。仓库若有额外 swap 文件，可传 BUILD_SWAP_FILE=/swapfile2 临时启用。
MEILI_WAS_RUNNING=0
MYSQL_WAS_RUNNING=0
APP_WAS_STOPPED=0
DEPLOY_STARTED_APP=0
SWAP_WAS_ENABLED=0

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet meilisearch 2>/dev/null; then
  echo "[deploy] 构建前暂停 Meilisearch（释放内存）..."
  systemctl stop meilisearch || true
  MEILI_WAS_RUNNING=1
fi

if command -v pm2 >/dev/null 2>&1 && [ -n "$(pm2 pid "${APP_NAME}" 2>/dev/null | tr -d '[:space:]')" ]; then
  echo "[deploy] 构建前暂停 ${APP_NAME}（释放内存）..."
  pm2 stop "${APP_NAME}" >/dev/null 2>&1 || true
  APP_WAS_STOPPED=1
fi

# 构建期停库释放内存（默认开启；数据库不在本机或需保持在线时显式 STOP_MYSQL_ON_BUILD=0）
if [ "${STOP_MYSQL_ON_BUILD:-1}" != "0" ] && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet mysql 2>/dev/null; then
    echo "[deploy] 构建前暂停 MySQL（释放内存）..."
    systemctl stop mysql || true
    MYSQL_WAS_RUNNING=1
  fi
fi

# 可选：临时启用额外 swap（如 /swapfile2），构建结束后恢复原状态
if [ -n "${BUILD_SWAP_FILE:-}" ] && [ -f "${BUILD_SWAP_FILE}" ]; then
  if ! swapon --show=NAME --noheadings 2>/dev/null | grep -qx "${BUILD_SWAP_FILE}"; then
    if swapon "${BUILD_SWAP_FILE}" 2>/dev/null; then
      SWAP_WAS_ENABLED=1
      echo "[deploy] 已临时启用 swap：${BUILD_SWAP_FILE}"
    fi
  fi
fi

# 备份上一版可运行产物（放在 runtime/ 而非 .next/ 内，避免构建清理目录时被一起删掉）
STANDALONE_BACKUP="${APP_DIR}/runtime/standalone-bak"
HAS_STANDALONE_BACKUP=0
if [ -f .next/standalone/server.js ]; then
  rm -rf "${STANDALONE_BACKUP}"
  mkdir -p "${APP_DIR}/runtime"
  cp -a .next/standalone "${STANDALONE_BACKUP}"
  HAS_STANDALONE_BACKUP=1
  echo "[deploy] 已备份现有 standalone → ${STANDALONE_BACKUP}"
fi

# 确保 .next/standalone 下有可运行的 server.js，供调用方决定是否 pm2 start
restorable_standalone() {
  [ -f .next/standalone/server.js ] && return 0
  if [ "${HAS_STANDALONE_BACKUP}" = "1" ] && [ -f "${STANDALONE_BACKUP}/server.js" ]; then
    echo "[deploy] 新产物缺失，回滚到构建前产物..."
    rm -rf .next/standalone
    cp -a "${STANDALONE_BACKUP}" .next/standalone
    return 0
  fi
  return 1
}

restore_runtime_services() {
  if [ "${SWAP_WAS_ENABLED}" = "1" ]; then
    swapoff "${BUILD_SWAP_FILE}" >/dev/null 2>&1 || true
  fi
  if [ "${MYSQL_WAS_RUNNING}" = "1" ]; then
    systemctl start mysql >/dev/null 2>&1 || true
  fi
  if [ "${MEILI_WAS_RUNNING}" = "1" ]; then
    systemctl start meilisearch >/dev/null 2>&1 || true
  fi
  if [ "${APP_WAS_STOPPED}" = "1" ] && [ "${DEPLOY_STARTED_APP}" != "1" ]; then
    echo "[deploy] 构建未走到重启步骤，尝试拉起应用..."
    if restorable_standalone; then
      # 显式 start（而非 pm2 restart）：dump 可能是陈年快照，restart 靠 dump 兜底
      # 会拉起一个没有应用的新 daemon（2026-11-11 事故：主路径与 trap 竞态后
      # dump 为空，restart 只带回了 logrotate，应用缺席、站点 502 达 8 分钟）。
      pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
      NODE_ENV=production PORT="${APP_PORT}" pm2 start .next/standalone/server.js --name "${APP_NAME}" >/dev/null 2>&1 || true
    else
      echo "[deploy] ✗ 无可用 standalone 产物（无新产物且无备份），保持停服；请检查构建日志后人工处理。"
    fi
  fi
}
trap restore_runtime_services EXIT
echo "[deploy] 停服后可用内存：$(free -h | awk '/^Mem:/{print $7}')"

# 3.1 备份现有 .env（如果存在）
if [ -f .next/standalone/.env ]; then
  cp .next/standalone/.env /tmp/supply-os.env.bak
  echo "[deploy] 已备份 .env"
fi

# 3.2 构建（限 V8 堆；Turbopack 原生内存峰值由 next.config.ts 的驱逐策略压制）
BUILD_MAX_OLD_SPACE="${BUILD_MAX_OLD_SPACE:-2560}"
BUILD_LOG="${APP_DIR}/runtime/deploy-build-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "${APP_DIR}/runtime"
echo "[deploy] 构建日志：${BUILD_LOG}"
NODE_OPTIONS="$(printf '%s --max-old-space-size=%s' "${NODE_OPTIONS:-}" "${BUILD_MAX_OLD_SPACE}")" npm run build 2>&1 | tee "${BUILD_LOG}"

# 3.2.1 产物硬校验：退出码 0 但没有 standalone 同样算失败（pm2 指向空气 = 崩溃循环）
if [ ! -f .next/standalone/server.js ]; then
  echo "[deploy] ✗ 构建结束但缺少 .next/standalone/server.js，判定构建失败"
  if [ "${HAS_STANDALONE_BACKUP}" = "1" ]; then
    rm -rf .next/standalone
    cp -a "${STANDALONE_BACKUP}" .next/standalone
    echo "[deploy] 已回滚到构建前产物（上一版）"
  fi
  exit 1
fi

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
  echo "[deploy]   APP_ENV_FILE=/绝对路径/生产.env bash scripts/tools/deploy.sh"
  echo "[deploy] （若仓库根 .env 是开发机配置，直接指过来会导致启动期连不上数据库）"
  exit 1
fi

# 3.3 先对新构建产物跑 CSS 门禁，再覆盖 standalone（顺序不能倒）。
#     倒过来的后果实际踩过：cp -rT 是整体替换目录，门禁一旦在它之后失败就停在
#     「standalone/.next/static 已被新构建替掉、但进程还是旧的」这一格——
#     旧进程按旧文件名发 HTML，而那些文件已不存在，线上直接丢样式（实测 CSS 500）。
node scripts/gates/css-compat-gate.mjs .next/static
cp -rT .next/static .next/standalone/.next/static
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

# 3.7 构建产物就绪 → 先恢复 Meilisearch，再重启应用（应用启动期会探测 Meili 健康，
#     顺序反了会先打一串 meili-unhealthy 再自愈）。
if [ "${MEILI_WAS_RUNNING}" = "1" ]; then
  echo "[deploy] 恢复 Meilisearch..."
  systemctl start meilisearch || true
  sleep 2
  MEILI_WAS_RUNNING=0
fi

# 4. 重启应用（pm2 托管，保持常驻）
#    Next.js standalone 模式入口为 .next/standalone/server.js
#    注意：必须 delete + kill 再 start，pm2 reload 会保留旧的入口文件配置（如 dist/server.mjs）
echo "[deploy] 重启应用..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "${APP_NAME}" 2>/dev/null || true
  pm2 kill 2>/dev/null || true
  # pm2 kill 是异步收尾：打出「Daemon Stopped」时 daemon 进程可能还在退场。
  # 旧 daemon 未退干净就 start，新 spawn 的 daemon 会被旧 daemon 的清理动作误伤——
  # 表现为「进程活着但不应答 RPC」：start 客户端永久阻塞在 Spawning PM2 daemon，
  # 应用没起来、站点停服（2026-10-30 实际事故，停服约 7 分钟）。
  # 所以先等旧 daemon 进程消失（最多 10s）；仍不退 = 僵死，强杀并清掉 ipc/pid 残留。
  for _ in $(seq 1 20); do
    pgrep -f "PM2.*God Daemon" >/dev/null 2>&1 || break
    sleep 0.5
  done
  if pgrep -f "PM2.*God Daemon" >/dev/null 2>&1; then
    echo "[deploy] ⚠ pm2 daemon 僵死未退，强杀并清理 ipc 残留"
    pkill -9 -f "PM2.*God Daemon" 2>/dev/null || true
    sleep 1
    rm -f "${HOME}/.pm2/pm2.pid" "${HOME}/.pm2/rpc.sock" "${HOME}/.pm2/pub.sock"
  fi
  # start 再包一层 timeout：若 daemon 再现「起而不应答」，部署当场报错退出
  # （timeout exit 124 → set -e 中止），而不是把终端无限挂住、站点无声停服。
  NODE_ENV=production PORT="${APP_PORT}" timeout 180 pm2 start .next/standalone/server.js --name "${APP_NAME}"
  pm2 save
  DEPLOY_STARTED_APP=1
  # 起来后探活：端口有 HTTP 应答才算部署闭环（仅告警不判红，防 DB 冷启动误杀部署）。
  # 2026-11-11 事故加固：启动后自愈重试一次——本日主路径 start 成功后 app 被
  # 异步竞态杀掉（pm2 log 可见 start 与 stop 同秒），单次探测只告警不补救，
  # 站点 502 达 8 分钟无人拉起。轮询 30s（应用冷启动 ~20-40s），未应答则
  # kill → 等退场 → 清残留 → 重启一次，再探 30s。
  probe_app() {
    local i
    for i in $(seq 1 6); do
      if curl -s -o /dev/null --max-time 5 "http://127.0.0.1:${APP_PORT}/"; then
        return 0
      fi
      sleep 5
    done
    return 1
  }
  if probe_app; then
    echo "[deploy] 应用探活通过（端口 ${APP_PORT} HTTP 应答）"
  else
    echo "[deploy] ⚠ 首次启动端口 ${APP_PORT} 未应答，自愈重试一次..."
    pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
    pm2 kill >/dev/null 2>&1 || true
    for _ in $(seq 1 40); do
      pgrep -f "PM2.*God Daemon" >/dev/null 2>&1 || break
      sleep 0.5
    done
    if pgrep -f "PM2.*God Daemon" >/dev/null 2>&1; then
      pkill -9 -f "PM2.*God Daemon" 2>/dev/null || true
      sleep 1
      rm -f "${HOME}/.pm2/pm2.pid" "${HOME}/.pm2/rpc.sock" "${HOME}/.pm2/pub.sock"
    fi
    NODE_ENV=production PORT="${APP_PORT}" timeout 180 pm2 start .next/standalone/server.js --name "${APP_NAME}"
    pm2 save
    if probe_app; then
      echo "[deploy] 自愈重试后应用探活通过"
    else
      echo "[deploy] ✗ 自愈重试后端口 ${APP_PORT} 仍未应答，请立即人工检查：pm2 logs ${APP_NAME}"
    fi
  fi
else
  echo "[deploy] ⚠ 未安装 pm2，请先执行："
  echo "          npm i -g pm2"
  echo "          NODE_ENV=production pm2 start ${APP_DIR}/.next/standalone/server.js --name ${APP_NAME}"
  echo "          pm2 save && pm2 startup"
  exit 1
fi

echo "[deploy] $(date '+%F %T') 部署完成，当前进程状态："
pm2 list | grep "${APP_NAME}" || true
