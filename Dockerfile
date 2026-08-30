# ============================================================
# Supply-OS Next.js 多阶段 Docker 构建
# ============================================================
# 阶段 1 (deps)   — 安装全部依赖（含原生编译工具链）
# 阶段 2 (build)  — Next.js 构建
# 阶段 3 (runtime) — 最小运行时镜像，仅含生产产物
# ============================================================

# ─ 阶段 1: 依赖安装 ──────────────────────────────────────────
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

# ── 阶段 2: Next.js 构建 ────────────────────────────────────
FROM deps AS build

WORKDIR /app

# 复制源码
COPY . .

# Next.js 构建（output: "standalone" 生成独立部署包）
RUN npm run build

# ── 阶段 3: 运行时 ───────────────────────────────────────────
FROM node:24-slim AS runtime

# 安全加固：非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && mkdir -p /app/.next && chown -R appuser:appuser /app

WORKDIR /app

# 复制 package 文件，仅安装生产依赖
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从 build 阶段拷贝 Next.js standalone 产物
# next.config.ts 中 output: "standalone" 生成 .next/standalone/server.js
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# nodejieba 词典文件（standalone 不会自动复制原生模块的 dict 资源，
# 缺失时 Meilisearch 全量重建触发 nodejieba 分词 → FATAL 崩溃）
COPY --from=build /app/node_modules/nodejieba/submodules/cppjieba/dict \
  ./node_modules/nodejieba/submodules/cppjieba/dict

# ── 环境变量默认值 ──
ENV NODE_ENV=production \
    PORT=3039

EXPOSE 3039

# 健康检查：利用 /api/system/version 轻量端点
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3039/api/system/version').then(r=>{if(!r.ok)throw 1;process.exit(0)}).catch(()=>process.exit(1))"

USER appuser

# 生产启动：Next.js standalone server
CMD ["node", "server.js"]
