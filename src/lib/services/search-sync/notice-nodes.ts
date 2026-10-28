/**
 * 公告×品目骨架节点码倒排表 —— 唯一写入方
 * Notice × Backbone Nodes inverted table writer
 *
 * @module server/services/search-sync/notice-nodes
 * @description notice_backbone_nodes 是宽表 backbone_path 的「行化镜像」：一行一个节点码
 *              (notice_id, node)。建它的原因只有一条 —— 读侧那句「给定 N 个节点码，捞出挂了
 *              其中任一个的公告」用 FIND_IN_SET 写在 backbone_path 上永远用不到索引，实测
 *              2.4s/3.8s/1.4s（EXPLAIN type=ALL，每次扫 677,629 行），而行化 + idx_node 后
 *              同一批键是 0.09s/0.05s/0.04s（探针110，同库同轮交错跑）。
 *
 *              边界（红线）：
 *              - 本表内容只由本模块写；建表与存量灌数由一次性 DDL/回填脚本完成（2026-10 已执行收尾，
 *                两件均为一次性不入库、已删除；表定义以 db/schema/baseline.sql 为准），
 *                运行期增量由 upsertWideRows / purgeNoticeSearch / reconcileGhostRows 三个既有收口点调用本模块。
 *              - 列值→节点码集合的拆分只用 commodity/backbone-path 的 fromBackbonePathColumn，
 *                本模块不写第二套拆列逻辑（口径单一事实源，I2）。
 *              - 表不存在时整体降级为「什么都不做」并点名一次（与宽表指纹列同风格）：先建表灌数、
 *                再上线读侧，代码不需要为此改两次。
 *
 *              为什么写之前要比一次指纹：宽表同步每 5 秒跑增量、每 60 秒做 deadline 对账，
 *              每次都会 upsertWideRows。deadline 变了但码集没变的公告是常态，无脑重灌会把
 *              1,508,793 行反复删插（写放大 + binlog）。比「集合没变」用 COUNT + SUM(CRC32(node))，
 *              与宽表源指纹同一个套路（wide-fingerprint.ts），回传每 id 一行，不看节点串本身。
 *              CRC32 两边同值是实测的：MySQL CRC32() 与本地实现逐样本相等、300 条真实公告的
 *              COUNT+SUM 与 SQL JSON_TABLE 侧对拍差异 0（探针116）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { fromBackbonePathColumn } from "../commodity/backbone-path";

/** 表名唯一事实源：门禁与 ops 脚本都引用它 */
export const NOTICE_NODES_TABLE = "notice_backbone_nodes";

/** 一条查询里最多带多少个 id（增量批 5000 行时要分几次问） */
const ID_CHUNK = 1000;
/** 一条 INSERT 里最多多少行节点码（单条公告最多 5,279 个码，必须再切） */
const ROW_CHUNK = 500;

// ── CRC32（与 MySQL CRC32() 同值）──
// 不用 node:zlib 的 crc32：那个函数 Node 20.15/22.2 以后才有，生产运行时的 Node 版本
// 不在本仓库里钉死（CI 是 24，服务器没有 .nvmrc），而它一旦不存在就是每批同步都抛异常。
// 自己实现 14 行、无依赖，单测用 MySQL 实测值钉住同值关系（tests/unit/.../notice-nodes.test.ts）。
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32/ISO-HDLC（反射、初值 ~0、结果取反），与 MySQL CRC32(str) 逐位同值 */
export function crc32(str: string): number {
  const buf = Buffer.from(str, "utf8");
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 节点码集合的指纹：数量 + CRC32 求和。
 * 求和顺序无关（可交换），所以「列值换了顺序」不算变化 —— 与 fromBackbonePathColumn
 * 的去重语义一致，也与运行期构建列值时用 Set 的事实一致。
 * 空集合的指纹是 {count:0, sum:0}，与 SQL 侧 SUM(CRC32(node)) 在无行时返回 NULL→IFNULL 0 对齐。
 */
export function nodesFingerprint(nodes: readonly string[]): { count: number; sum: number } {
  let sum = 0;
  for (const n of nodes) sum += crc32(n);
  return { count: nodes.length, sum };
}

// ── 表存在性（5 分钟缓存）──
let _ready: boolean | null = null;
let _readyExpires = 0;
const READY_TTL = 5 * 60 * 1000;

/**
 * 桥表是否已建好。缺失时本模块所有写操作直接返回零值，一次进程内只警告一条 ——
 * 建表是人工闸口动作（按 db/schema/baseline.sql 的定义人工执行），
 * 代码不能因为它还没发生就每 5 秒往日志里灌一遍，也不能因为它的缺失就弄坏宽表同步。
 */
export async function noticeNodesTableReady(pool: Pool): Promise<boolean> {
  if (_ready !== null && Date.now() < _readyExpires) return _ready;
  let ok: boolean;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [NOTICE_NODES_TABLE],
    );
    ok = Number((rows as RowDataPacket[])[0]?.n || 0) > 0;
  } catch {
    ok = false; // 探测失败按缺失处理：宁可降级，不行差
  }
  if (!ok && _ready !== false) {
    console.warn(
      `[notice-nodes] 表 ${NOTICE_NODES_TABLE} 不可用 → 节点码倒排写入自动关闭（宽表同步不受影响）；` +
      "建表：按 db/schema/baseline.sql 中本表定义人工执行（一次性 DDL/回填脚本已收尾删除）",
    );
  }
  _ready = ok;
  _readyExpires = Date.now() + READY_TTL;
  return ok;
}

/** 仅供测试：清掉表存在性缓存，用例互不污染 */
export function __resetNoticeNodesCache(): void {
  _ready = null;
  _readyExpires = 0;
}

export interface NoticeNodesRowInput {
  /** 公告主键 id（=bid_notices.id=notice_search.id） */
  id: number;
  /** 宽表列值原文；空串/NULL 表示该公告没有节点码（桥表里必须一行都不留） */
  backbone_path?: string | null;
}

export interface NoticeNodesWriteResult {
  written: number;
  skipped: number;
  deleted: number;
  /** 列值里形制不合法、被 fromBackbonePathColumn 丢掉的 token 数（>0 必须点名） */
  badTokens: number;
}

const EMPTY_RESULT: NoticeNodesWriteResult = { written: 0, skipped: 0, deleted: 0, badTokens: 0 };

/** 问一批 id 的现有指纹 */
async function loadFingerprints(pool: Pool, ids: number[]): Promise<Map<number, { count: number; sum: number }>> {
  const out = new Map<number, { count: number; sum: number }>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const batch = ids.slice(i, i + ID_CHUNK);
    const ph = batch.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT notice_id, COUNT(*) c, IFNULL(SUM(CRC32(node)), 0) s
       FROM ${NOTICE_NODES_TABLE} WHERE notice_id IN (${ph}) GROUP BY notice_id`,
      batch,
    );
    for (const r of rows as RowDataPacket[]) {
      out.set(Number(r.notice_id), { count: Number(r.c), sum: Number(r.s) });
    }
  }
  return out;
}

/**
 * 按宽表行的 backbone_path 重写桥表行（幂等：先删该 id 的全部行，再插当前集合）。
 *
 * 只动「集合真的变了」的 id：指纹一致就跳过（deadline 对账那种改动一次都不该写桥表）。
 * backbone_path 为空的 id 若有残行则删掉 —— 公告去掉全部码时，宽表写 NULL、桥表必须归零，
 * 否则读侧会从倒排表捞出一条已经没有码的公告（这是本表唯一能出现的「多」方向的坏数据）。
 */
export async function upsertNoticeNodes(
  pool: Pool,
  rows: readonly NoticeNodesRowInput[],
): Promise<NoticeNodesWriteResult> {
  const targets = rows.filter((r) => Number.isFinite(r.id) && r.id > 0);
  if (targets.length === 0) return EMPTY_RESULT;
  if (!(await noticeNodesTableReady(pool))) return EMPTY_RESULT;

  // 1) 拆列 + 算期望指纹（拆法只有一份，见文件头 I2 那条）
  const expected = new Map<number, string[]>();
  let badTokens = 0;
  const badSample: string[] = [];
  for (const r of targets) {
    const raw = String(r.backbone_path ?? "");
    const nodes = fromBackbonePathColumn(raw);
    expected.set(r.id, nodes);
    if (raw) {
      const kept = new Set(nodes);
      for (const t of raw.split(",")) {
        const x = t.trim();
        if (x && !kept.has(x)) {
          badTokens += 1;
          if (badSample.length < 5) badSample.push(`${r.id}:${x}`);
        }
      }
    }
  }
  if (badTokens > 0) {
    // 不静默：列值里有拆不出合法节点码的 token，说明宽表那侧已经坏了（BB3/BB7 的领地）
    console.error(
      `[notice-nodes] ${badTokens} 个 token 不是合法节点码、未入倒排表，样本 ${badSample.join("、")}；` +
      "先跑 check:backbone --db 查 backbone_path 形制",
    );
  }

  // 2) 与现有指纹比对，只留下真正要重写的
  const current = await loadFingerprints(pool, targets.map((r) => r.id));
  const rewrite: number[] = [];
  const pairs: Array<[number, string]> = [];
  let skipped = 0;
  for (const [id, nodes] of expected) {
    const fp = nodesFingerprint(nodes);
    const cur = current.get(id);
    if (cur && cur.count === fp.count && cur.sum === fp.sum) { skipped += 1; continue; }
    rewrite.push(id);
    for (const n of nodes) pairs.push([id, n]);
  }
  if (rewrite.length === 0) return { written: 0, skipped, deleted: 0, badTokens };

  // 3) 先删后插（删掉旧集合，插当前集合：去码、换码都自愈）
  let deleted = 0;
  for (let i = 0; i < rewrite.length; i += ID_CHUNK) {
    const batch = rewrite.slice(i, i + ID_CHUNK);
    const ph = batch.map(() => "?").join(",");
    const [res] = await pool.query(
      `DELETE FROM ${NOTICE_NODES_TABLE} WHERE notice_id IN (${ph})`,
      batch,
    );
    deleted += Number((res as { affectedRows?: number }).affectedRows ?? 0);
  }
  for (let i = 0; i < pairs.length; i += ROW_CHUNK) {
    const slice = pairs.slice(i, i + ROW_CHUNK);
    const values = slice.map(() => "(?, ?)").join(",");
    await pool.query(
      // 同一 (id,node) 重复出现时不做二次覆盖：值本来就来自同一个列值
      `INSERT INTO ${NOTICE_NODES_TABLE} (notice_id, node) VALUES ${values}
       ON DUPLICATE KEY UPDATE node = VALUES(node)`,
      slice.flat(),
    );
  }
  return { written: rewrite.length, skipped, deleted, badTokens };
}

/**
 * 删掉这些公告的全部节点码行（宽表行被 purge / ghost 清理时同批调用）。
 * @returns 实际删除的桥表行数
 */
export async function deleteNoticeNodes(pool: Pool, ids: readonly number[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (clean.length === 0) return 0;
  if (!(await noticeNodesTableReady(pool))) return 0;
  let deleted = 0;
  for (let i = 0; i < clean.length; i += ID_CHUNK) {
    const batch = clean.slice(i, i + ID_CHUNK);
    const ph = batch.map(() => "?").join(",");
    const [res] = await pool.query(
      `DELETE FROM ${NOTICE_NODES_TABLE} WHERE notice_id IN (${ph})`,
      batch,
    );
    deleted += Number((res as { affectedRows?: number }).affectedRows ?? 0);
  }
  return deleted;
}

/** 仅供门禁/对账使用：一批 id 里「列值 token 数 ≠ 桥表行数」的公告 id */
export async function detectNoticeNodesMismatchIds(pool: Pool, ids: readonly number[]): Promise<number[]> {
  const clean = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (clean.length === 0 || !(await noticeNodesTableReady(pool))) return [];
  const bad: number[] = [];
  for (let i = 0; i < clean.length; i += ID_CHUNK) {
    const batch = clean.slice(i, i + ID_CHUNK);
    const ph = batch.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT ns.id,
              IF(ns.backbone_path IS NULL OR ns.backbone_path = '', 0,
                 CHAR_LENGTH(ns.backbone_path) - CHAR_LENGTH(REPLACE(ns.backbone_path, ',', '')) + 1) want,
              IFNULL(t.got, 0) got
       FROM notice_search ns
       LEFT JOIN (SELECT notice_id, COUNT(*) got FROM ${NOTICE_NODES_TABLE}
                  WHERE notice_id IN (${ph}) GROUP BY notice_id) t ON t.notice_id = ns.id
       WHERE ns.id IN (${ph})`,
      [...batch, ...batch],
    );
    for (const r of rows as RowDataPacket[]) {
      const want = Number(r.want) > 0 ? Number(r.want) : 0;
      if (want !== Number(r.got)) bad.push(Number(r.id));
    }
  }
  return bad;
}
