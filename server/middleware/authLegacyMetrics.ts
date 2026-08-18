/**
 * legacy user_key 回退通道观测埋点
 * Legacy user_key Fallback Observability
 *
 * @module server/middleware/authLegacyMetrics
 * @description B1【P0】退役准备第一步：对 JWT → legacy user_key 双轨认证中的
 *              legacy 回退路径进行只读观测（清点流量），为后续灰度退役提供数据依据。
 *
 *              设计约束：
 *              1. 纯内存、零外部依赖、无文件写入——观测本身不得引入新的故障面；
 *              2. 端点维度计数设上限（MAX_ENDPOINT_KEYS），防止恶意构造路径导致内存膨胀；
 *              3. AUTH_LEGACY_METRICS=off 可整体关闭；默认开启；
 *              4. 本模块不做任何拦截/拒绝——退役动作必须在观测数据评审后另行实施。
 *
 *              观测指标含义：
 *              - legacyWithKeyCount > 0 且 byEndpoint 持续有增量 → 仍有客户端依赖
 *                legacy 通道，对应端点不可直接升级为 requireAuth；
 *              - 连续 2 周 legacyWithKeyCount 无增量 → 该端点具备灰度退役条件。
 */
import type { Request } from "express";

/** 端点聚合 Map 容量上限（防路径变体膨胀） */
const MAX_ENDPOINT_KEYS = 200;

/** legacy 观测指标快照 */
export interface LegacyAuthMetricsSnapshot {
  /** 观测起点时间戳（ms） */
  startedAt: number;
  /** 经 JWT 验证成功的请求数（对照组） */
  jwtAuthCount: number;
  /** legacy 回退且携带有效 user_key 的请求数（退役观测核心指标） */
  legacyWithKeyCount: number;
  /** legacy 回退且未携带 user_key 的请求数（匿名读请求，通常无退役风险） */
  legacyEmptyCount: number;
  /** 开发环境 requireAuth legacy 降级命中数 */
  devFallbackCount: number;
  /** legacy（携带 key）命中按端点聚合：`METHOD /normalized/path` → 次数 */
  byEndpoint: Record<string, number>;
}

const metrics = {
  startedAt: Date.now(),
  jwtAuthCount: 0,
  legacyWithKeyCount: 0,
  legacyEmptyCount: 0,
  devFallbackCount: 0,
};

/** legacy 命中端点聚合（携带 key 的才记录——无 key 的匿名请求无退役意义） */
const endpointHits = new Map<string, number>();

/** 观测开关：默认开启；AUTH_LEGACY_METRICS=off 关闭 */
const LEGACY_METRICS_ENABLED =
  String(process.env.AUTH_LEGACY_METRICS ?? "on").toLowerCase() !== "off";

/**
 * 路径归一化：数字段收敛为 :id（如 /api/notices/123/detail → /api/notices/:id/detail），
 * 控制聚合 key 基数；同时截断超长路径防御异常请求。
 */
function normalizePath(path: string): string {
  const truncated = path.length > 120 ? path.slice(0, 120) : path;
  return truncated.replace(/\/\d+(?=\/|$)/g, "/:id");
}

/** 记录一次 legacy 回退命中（optionalAuth 调用） */
export function recordLegacyFallback(req: Request, hasKey: boolean): void {
  if (!LEGACY_METRICS_ENABLED) return;
  if (hasKey) {
    metrics.legacyWithKeyCount += 1;
    const key = `${req.method} ${normalizePath(req.path)}`;
    if (endpointHits.size < MAX_ENDPOINT_KEYS || endpointHits.has(key)) {
      endpointHits.set(key, (endpointHits.get(key) || 0) + 1);
    }
  } else {
    metrics.legacyEmptyCount += 1;
  }
}

/** 记录一次 JWT 验证成功（optionalAuth 调用，作为退役评估的对照基数） */
export function recordJwtAuth(): void {
  if (!LEGACY_METRICS_ENABLED) return;
  metrics.jwtAuthCount += 1;
}

/** 记录一次开发环境 requireAuth legacy 降级命中 */
export function recordDevFallback(): void {
  if (!LEGACY_METRICS_ENABLED) return;
  metrics.devFallbackCount += 1;
}

/** 获取当前指标快照（供未来管理端点/测试读取） */
export function getLegacyAuthMetrics(): LegacyAuthMetricsSnapshot {
  return {
    startedAt: metrics.startedAt,
    jwtAuthCount: metrics.jwtAuthCount,
    legacyWithKeyCount: metrics.legacyWithKeyCount,
    legacyEmptyCount: metrics.legacyEmptyCount,
    devFallbackCount: metrics.devFallbackCount,
    byEndpoint: Object.fromEntries(endpointHits),
  };
}

// ── 周期性日志输出 ──
// 每 30 分钟（AUTH_LEGACY_METRICS_INTERVAL_MS 可调）输出一次累计快照，
// 仅在有 legacy 携带 key 的命中时输出，避免日志噪音；unref 保证不阻止进程退出。
const LOG_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.AUTH_LEGACY_METRICS_INTERVAL_MS || 30 * 60 * 1000),
);

if (LEGACY_METRICS_ENABLED) {
  setInterval(() => {
    if (metrics.legacyWithKeyCount === 0 && endpointHits.size === 0) return;
    console.log(
      `[auth-legacy-metrics] ${JSON.stringify(getLegacyAuthMetrics())}`,
    );
  }, LOG_INTERVAL_MS).unref();
}
