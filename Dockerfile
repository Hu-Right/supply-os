# ============================================================
# Supply-OS 多阶段 Docker 构建
# ============================================================
# 阶段 1 (deps)   — 安装全部依赖（含原生编译工具链）
# 阶段 2 (build)  — 构建前端 + 后端 bundle
# 阶段 3 (runtime) — 最小运行时镜像，仅含生产产物
# ============================================================

# ── 阶段 1: 依赖安装 ──────────────────────────────────────────
FROM node:24-slim AS deps

# nodejieba / bcrypt 需要 C++ 编译工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json ./

# 安装全部依赖（含 devDependencies，构建阶段需要）
RUN npm ci

# ── 阶段 2: 构建 ─────────────────────────────────────────────
FROM deps AS build

WORKDIR /app

# 复制源码
COPY . .

# 执行构建：Vite (前端) + esbuild (后端 bundle → dist/server.mjs)
RUN npm run build

# ── 阶段 3: 运行时 ───────────────────────────────────────────
FROM node:24-slim AS runtime

# 安全加固：非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && mkdir -p /app/server/logs && chown -R appuser:appuser /app

WORKDIR /app

# 复制 package 文件，仅安装生产依赖
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从 build 阶段拷贝构建产物
COPY --from=build /app/dist ./dist

# 公共静态资源（下载文件、字体、manifest 等）
COPY --from=build /app/public ./public

# ── 环境变量默认值 ──
ENV NODE_ENV=production \
    PORT=3039

EXPOSE 3039

# 健康检查：利用已有的 /api/system/version 轻量端点
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3039/api/system/version').then(r=>{if(!r.ok)throw 1;process.exit(0)}).catch(()=>process.exit(1))"

USER appuser

# 生产启动：直接运行 esbuild bundle
CMD ["node", "dist/server.mjs"]
