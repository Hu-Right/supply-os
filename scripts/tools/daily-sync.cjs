/**
 * ⚠️ 已停用自动运行（2026-09-22）：本脚本的「爬虫库 → 主表」增量同步逻辑已迁入应用内定时任务
 *    （src/lib/services/search-sync/crawler-sync.ts + crawler-sync-scheduler.ts，由 instrumentation 拉起）。
 *    请在部署层移除对本脚本的 cron / 定时调用，避免与应用内同步形成「两个写入者并发 ODKU 主表」。
 *    本文件仅保留作手动应急兜底（如应用内同步异常时人工补跑一轮）。
 *    ⚠ 本脚本不同步任何品类/桥表（2026-10-15 起，与旧品类字典退役口径一致）：
 *    公告品目归属的唯一事实源是落点表 notice_attribution_nodes（应用内管道写），
 *    本脚本只增量 upsert bid_notices / bid_opportunities 两张主表。
 *
 * 内网爬虫数据 → 线上生产库 定时增量同步
 *
 * 用法:
 *   node daily-sync.cjs               # 持续运行，每小时同步一次
 *   node daily-sync.cjs --once        # 只跑一次（手动触发 / cron 调用）
 *   node daily-sync.cjs --print-config # 只打印解析后的连接配置（密码掩码）与取值来源，不连库
 *   node daily-sync.cjs --once --apply        # 单轮：增量 upsert + 内容对账，并把差异行真正写回目标
 *   node daily-sync.cjs --once --no-reconcile # 单轮：只做旧「水位线增量」，完全不做内容对账
 *   node daily-sync.cjs --once --prune-source-deleted          # 加一步「源撤回下传」体检（无 --apply 只报数）
 *   node daily-sync.cjs --once --prune-source-deleted --apply # 真删源库已撤回的云端主表行（四道护栏，备份后执行）
 *
 * 环境变量（三级取值：进程环境 → 仓库根 .env → 下列默认值；空串一律视为「未提供」）:
 *   SYNC_INTERVAL_MS       同步间隔（默认 3600000 = 1 小时）
 *   SYNC_SOURCE_HOST       源库主机（默认 192.168.1.14）
 *   SYNC_SOURCE_PORT       源库端口（默认 3306）
 *   SYNC_SOURCE_USER       源库用户（默认 root）
 *   SYNC_SOURCE_PASSWORD   源库密码（默认 123456，内网库遗留默认值）
 *   SYNC_SOURCE_DATABASE   源库库名（默认取 DB_NAME，再退到 crm）
 *   SYNC_TARGET_HOST       目标库主机（默认取 .env 的 DB_HOST，再退到 127.0.0.1）
 *   SYNC_TARGET_PORT       目标库端口（默认取 DB_PORT，再退到 3307）
 *   SYNC_TARGET_USER       目标库用户（默认取 DB_USER，再退到 root）
 *   SYNC_TARGET_PASSWORD   目标库密码（取 SYNC_TARGET_PASSWORD 或 DB_PASSWORD；
 *                          ⚠️ 无默认值——目标库是生产主库，两者都缺即报错退出，不再内置明文兜底）
 *   SYNC_TARGET_DATABASE   目标库库名（默认取 DB_NAME，再退到 crm）
 *
 *   目标库就是应用主库，所以默认整体继承 .env 的 DB_*（单一事实源），
 *   只有需要临时指向别的库时才显式设 SYNC_TARGET_*；变量命名与 .env.example /
 *   src/lib/db/source-pool.ts 的 SYNC_SOURCE_* 保持同一口径。
 *
 * 同步策略:
 *   全部 2 张主表使用水位线增量 upsert（INSERT ... ON DUPLICATE KEY UPDATE）
 *   水位线按批持久化到 .sync-watermark.json，中断后从断点继续
 *   update_time 水位线按列原生类型读写比较（DATETIME 字符串 / Unix 秒整数）
 *   DATETIME 列以原值字符串同步与比较（dateStrings），不做时区转换
 *   定时循环带防重入：上一轮未结束时自动跳过本轮
 *
 *   ⚠ 纯水位线增量接不住「内容变了但 update_time 没动」的行：documents / procurement_files /
 *   external_links 等常被外部/爬虫管道补写，而 update_time 纹丝不动（本库实测踩过，见
 *   notices-shadow-phase2-cutover.mjs 第 9-13 行同款结论）。故水位线之外再跑一遍
 *   「按全列行指纹」内容对账：逐片聚合比对，只在指纹不等的片上下钻到行、分块补 upsert。
 *   对账默认 DRY（只报待补行数 + 差异列分解，不写库），带 --apply 才真正写入；
 *   --no-reconcile 整体跳过。判据与影子表 findDirtyRows 同口径（NULL 与空串必须可区分）。
 *
 * 列所有权与平台行护栏（2026-10-21 实测后补，登记均在叶子 daily-sync-sql.cjs）：
 *   · 平台行（entry_source='platform'）整行免疫：本仓旧版本无护栏，而云端 AUTO_INCREMENT
 *     恰等于源库 MAX(id)+1 ⇒ 新建 RFQ 会占用爬虫库下一个 id，撞号即被就地改写
 *     （铁证见 docs/reviews/2026-10-17-RFQ覆盖P0修复报告.md §1）；
 *   · is_featured 单调上升：实测 5 行云端=1/源库=0 且两侧 update_time 相等 ⇒ 精选是云端后写的，
 *     不能被源库非空值 0 抹掉（那种情况 keepCols「源空才保留」不生效）；
 *   · title 目标优先：后台正式写入者入库前用 normalizeTitle 清洗（实测 1,106/1,106 可复现），
 *     本脚本没有那一步 ⇒ 若源值直通覆盖会把已清洗标题打回原形，且因两侧 update_time 相等而永不对齐。
 *     代价：本脚本不跟进源库的标题修改（靠后台或人工 notice-public-v2 --ids 重算）。
 */

// ═══════════════════════════════════════════
// 2026-10-15 恢复手动执行：退役原因（直插旧公告桥表）已随旧品类字典退役消除——
//    桥表/候选表已移出 SYNC_TABLES，公告归属唯一事实源是落点表
//    notice_attribution_nodes（由应用内构建链路写，本脚本不碰）。
//    本脚本仅作手动应急兜底（node daily-sync.cjs --once），不得挂 cron。
// ═══════════════════════════════════════════

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// 内容对账的纯 SQL/判定构件（零副作用叶子，可单测；与 crawler-sync-sql.ts 同构的分离法）
const ds = require('./daily-sync-sql.cjs');

// ═══════════════════════════════════════════
// 环境变量读取（单一入口，杜绝残破值拼进连接串）
// ═══════════════════════════════════════════

/**
 * 仓库根 .env（与 scripts/shadow-users-phase*.mjs 同一思路：正则取需要的键，不引 dotenv）。
 * 支持 KEY="v" / KEY='v' / KEY=v，忽略注释与空行；进程环境始终优先于 .env。
 */
const ENV_FILE_PATH = path.join(__dirname, '..', '..', '.env');
const ENV_PROVENANCE = {};

const ENV_FILE = (() => {
  const parsed = {};
  try {
    const text = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      parsed[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  } catch {
    // .env 不存在（生产由进程环境注入）不算错误：readEnv 会退到默认值
  }
  return parsed;
})();

/**
 * 取单个变量的一个「完整」值：进程环境优先 → .env 兜底。
 * 只裁首尾空白；值内部残留换行/制表符（PATH 被截断那类事故的典型症状）直接报错退出，
 * 绝不悄悄把半截值拼进连接串。未提供与空串统一返回 undefined，避免 SYNC_TARGET_PASSWORD=""
 * 这类空赋值覆盖掉 .env 里的真实密码。
 */
function pickRaw(name) {
  const fromProcess = process.env[name] !== undefined;
  const raw = fromProcess ? process.env[name] : ENV_FILE[name];
  if (raw === undefined) return undefined;
  const val = String(raw).trim();
  if (/[\r\n\t]/.test(val)) {
    fatal(`环境变量 ${name} 含换行/制表符（值被截断或拼接出错）: ${JSON.stringify(val)}`);
  }
  if (val === '') return undefined;
  return { value: val, origin: `${name} (${fromProcess ? '进程环境' : '.env'})` };
}

/**
 * 按 names 顺序取第一个真正提供的变量，并把来源记进 ENV_PROVENANCE 供 --print-config 回显；
 * 全部未提供才用 fallback，且标注为「默认值」——静默兜底在自检里一眼可见。
 */
function readEnv(key, names, fallback = '') {
  for (const name of names) {
    const hit = pickRaw(name);
    if (hit) {
      ENV_PROVENANCE[key] = hit.origin;
      return hit.value;
    }
  }
  ENV_PROVENANCE[key] = '默认值';
  return fallback;
}

/** 端口：必须是 1..65535 的整数，杜绝 Number('') === 0 这类静默降级 */
function readPort(key, names, fallback) {
  const raw = readEnv(key, names, fallback);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fatal(`${key} 不是合法端口（1..65535）: ${JSON.stringify(raw)}（来源: ${ENV_PROVENANCE[key]}）`);
  }
  return port;
}

/** 必填项缺失时指出「该设哪个变量」，而不是退回脚本里写死的明文密码 */
function readRequired(key, names) {
  const val = readEnv(key, names);
  if (!val) {
    fatal(`${key} 未配置：请在 .env 或进程环境中设置 ${names.join(' 或 ')}`);
  }
  return val;
}

/** 正整数（时长/大小类配置，不受端口 1..65535 约束） */
function readPositiveInt(key, names, fallback) {
  const raw = readEnv(key, names, String(fallback));
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    fatal(`${key} 不是正整数: ${JSON.stringify(raw)}（来源: ${ENV_PROVENANCE[key]}）`);
  }
  return num;
}

function fatal(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// 连接字段约束与 src/lib/db/db-config.ts 的 zod schema 同一口径（脚本不引依赖，手写校验）
const HOST_RE = /^([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])$/;
const IDENT_RE = /^[a-zA-Z0-9_.-]+$/;

function assertValidConfig(label, cfg) {
  if (!HOST_RE.test(cfg.host)) fatal(`${label}.host 非法（只能是主机名/IPv4/IPv6 字面量）: ${JSON.stringify(cfg.host)}`);
  if (!IDENT_RE.test(cfg.user)) fatal(`${label}.user 含非法字符: ${JSON.stringify(cfg.user)}`);
  if (!IDENT_RE.test(cfg.database)) fatal(`${label}.database 非法数据库名: ${JSON.stringify(cfg.database)}`);
  if (/;|`|\\/.test(cfg.password)) fatal(`${label}.password 含非法字符（; \` \\）: ${JSON.stringify(cfg.host)}`);
}

/** 掩码后的连接描述，用于启动日志（密码永不落日志） */
function describeDb(cfg) {
  return `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════

const SOURCE = {
  host: readEnv('SOURCE.host', ['SYNC_SOURCE_HOST'], '192.168.1.14'),
  port: readPort('SOURCE.port', ['SYNC_SOURCE_PORT'], '3306'),
  user: readEnv('SOURCE.user', ['SYNC_SOURCE_USER'], 'root'),
  // 内网爬虫库的遗留默认值；公网/异地应急时务必用 SYNC_SOURCE_PASSWORD 覆盖
  password: readEnv('SOURCE.password', ['SYNC_SOURCE_PASSWORD'], '123456'),
  database: readEnv('SOURCE.database', ['SYNC_SOURCE_DATABASE', 'DB_NAME'], 'crm'),
  charset: 'utf8mb4', // 编码红线：跨库同步禁止依赖驱动默认字符集（docs/数据库设计/数据库字符集与排序规则统一规范.md §2）
};

const TARGET = {
  // 目标库 = 应用主库：默认整体取 .env 的 DB_*（单一事实源），SYNC_TARGET_* 仅用于临时改指向
  host: readEnv('TARGET.host', ['SYNC_TARGET_HOST', 'DB_HOST'], '127.0.0.1'),
  port: readPort('TARGET.port', ['SYNC_TARGET_PORT', 'DB_PORT'], '3307'),
  user: readEnv('TARGET.user', ['SYNC_TARGET_USER', 'DB_USER'], 'root'),
  password: readRequired('TARGET.password', ['SYNC_TARGET_PASSWORD', 'DB_PASSWORD']),
  database: readEnv('TARGET.database', ['SYNC_TARGET_DATABASE', 'DB_NAME'], 'crm'),
  charset: 'utf8mb4',
};

assertValidConfig('SOURCE', SOURCE);
assertValidConfig('TARGET', TARGET);

// 同步清单只保留两张主表：旧类目桥表已随字典退役（公告品目归属的唯一口径是
// 落点表 notice_attribution_nodes，由云端构建链路自己写，不再从源库直通）。
const SYNC_TABLES = [
  'bid_notices',
  'bid_opportunities',
  // bid_awards / bid_award_winners 无需同步——数据本身就在云端库中
];

const BATCH_SIZE = 200;

// 内容对账：片大小（按行数取窗口边界，本表 id 稀疏不能按固定步长）与差异行 IN 分块。
// 片大→聚合轮次少但单语句重；IN 分块控 max_allowed_packet，与 sync.ts 的批口径同源。
const RECONCILE_SLICE = readPositiveInt('RECONCILE_SLICE', ['RECONCILE_SLICE'], 5000);
const RECONCILE_IN_BATCH = 100; // 含 LONGTEXT/JSON 的行单批不宜大，防超 max_allowed_packet

// update_time 可能的数值列类型（单一事实源在 daily-sync-sql.cjs 叶子，与对账/ODKU 共享同一集合）
const NUMERIC_TYPES = ds.NUMERIC_TYPES;

/**
 * 列所有权登记一律取自零副作用叶子 daily-sync-sql.cjs（单一事实源，机理注释在该处）：
 *   NON_DESTRUCTIVE_COLUMNS——非破坏合并（源空则保留目标）；
 *   MONOTONE_RISE_COLUMNS——单调上升合并（云端拥有的运营标记，如 is_featured）；
 *   TARGET_WINS_COLUMNS——目标优先（本脚本没有写入侧 title 清洗，靠它防回退）；
 *   PLATFORM_IMMUNE——平台行整行免疫（entry_source='platform' 一行都不改）。
 * 与应用内正式写入者 crawler-sync-sql.ts 的口径一致性由
 * tests/unit/lib/services/search-sync/crawler-sync-ownership.test.ts 钉死。
 */
const NON_DESTRUCTIVE_COLUMNS = ds.NON_DESTRUCTIVE_COLUMNS;
const MONOTONE_RISE_COLUMNS = ds.MONOTONE_RISE_COLUMNS;
const TARGET_WINS_COLUMNS = ds.TARGET_WINS_COLUMNS;
const PLATFORM_IMMUNE = ds.PLATFORM_IMMUNE;

/**
 * 平台行整行免疫集：取目标库里不可被源库改写的行主键。
 * 采用整行过滤而非逐列 IF(entry_source=…)：ODKU 赋值从左到右求值，列序在 entry_source
 * 之后的列读到的是已改写值，逐列护栏只能护住半截列（会产出「爬虫内容+平台附件」缝合行）。
 */
async function loadPlatformImmuneIds(target, table, pkCol) {
  if (PLATFORM_IMMUNE.table !== table) return new Set();
  const [rows] = await target.execute(
    `SELECT \`${pkCol}\` AS id FROM \`${table}\` WHERE \`${PLATFORM_IMMUNE.column}\` = ?`,
    [PLATFORM_IMMUNE.value],
  );
  return new Set(rows.map((r) => Number(r.id)));
}

const SYNC_INTERVAL = readPositiveInt('SYNC_INTERVAL_MS', ['SYNC_INTERVAL_MS'], 3600000); // 默认 1 小时
const LOG_FILE = path.join(__dirname, 'daily-sync.log');
const WATERMARK_FILE = path.join(__dirname, '.sync-watermark.json');
const SERVICE_WATERMARK_FILE = path.join(__dirname, '.service-watermark.json');
const ONCE_MODE = process.argv.includes('--once');
const PRINT_CONFIG_MODE = process.argv.includes('--print-config');
const APPLY_RECONCILE = process.argv.includes('--apply'); // 对账真正写入（否则仅 DRY 预览）
const NO_RECONCILE = process.argv.includes('--no-reconcile'); // 整体跳过内容对账

// 源撤回下传（删除）：默认完全关，必须显式 --prune-source-deleted 才进入该步骤，且不
// 带 --apply 只 DRY 报数。范围只公告主表：商机行可由平台侧自建，「源库没有」对商机表
// 不构成删除理由（口径不同，不做同一个开关顺手删）。
const PRUNE_SOURCE_DELETED = process.argv.includes('--prune-source-deleted');
const PRUNE_MAX = readPositiveInt('PRUNE_MAX', ['PRUNE_MAX'], 20000); // 单次删除上限

/**
 * 配置自检：打印解析后的连接字段与每个字段的取值来源（哪个变量 / 进程环境还是 .env / 默认值）。
 * 密码只报长度与来源，不输出明文。用于确认没有半截值、也没有默默退到写死的兜底值。
 */
if (PRINT_CONFIG_MODE) {
  const show = (label, cfg) => {
    console.log(`${label}:`);
    for (const [key, val] of Object.entries(cfg)) {
      const origin = ENV_PROVENANCE[`${label}.${key}`] || (key === 'charset' ? '常量（编码红线）' : '默认值');
      const shown = key === 'password' ? `‹已设置，${String(val).length} 字符›` : String(val);
      console.log(`  ${key.padEnd(9)} = ${shown.padEnd(14)} 来源: ${origin}`);
    }
  };
  show('SOURCE', SOURCE);
  show('TARGET', TARGET);
  console.log(`SYNC_INTERVAL_MS = ${SYNC_INTERVAL}  来源: ${ENV_PROVENANCE['SYNC_INTERVAL_MS']}`);
  console.log(`.env 路径 = ${ENV_FILE_PATH}`);
  process.exit(0);
}

// ═══════════════════════════════════════════
// 日志
// ══════════════════════════════════════════

function ts() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDuration(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ═══════════════════════════════════════════
// 水位线管理
// ═══════════════════════════════════════════

/**
 * 加载水位线（兼容旧版纯数字格式）
 * 新版格式: { "bid_notices": { id: 1786254709, update_time: "2026-09-16 10:08:17" } }
 * 旧版格式: { "bid_notices": 1786254709 }
 */
function loadWatermarks() {
  try {
    if (fs.existsSync(WATERMARK_FILE)) {
      const raw = JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'));
      // 兼容旧版：将纯数字转为对象格式
      const normalized = {};
      for (const [table, val] of Object.entries(raw)) {
        if (typeof val === 'number') {
          normalized[table] = { id: val, update_time: null };
        } else if (val && typeof val === 'object' && 'id' in val) {
          normalized[table] = val;
        } else {
          normalized[table] = { id: 0, update_time: null };
        }
      }
      return normalized;
    }
  } catch {}
  return {};
}

function saveWatermarks(watermarks) {
  fs.writeFileSync(WATERMARK_FILE, JSON.stringify(watermarks, null, 2));
}

/** 从水位线对象中提取 ID 数值（兼容新旧格式） */
function getWatermarkId(wm) {
  if (!wm) return 0;
  if (typeof wm === 'number') return wm;
  if (wm && typeof wm === 'object') return Number(wm.id || 0);
  return 0;
}

/** 构造水位线对象（maxUpdateTime 为 0/null 表示本批未见到有效 update_time） */
function buildWatermark(hasUpdateTime, maxId, maxUpdateTime) {
  if (!hasUpdateTime) return maxId;
  return { id: maxId, update_time: maxUpdateTime || null };
}

// ═══════════════════════════════════════════
// 列信息（带缓存）
// ═══════════════════════════════════════════

const _colCache = new Map();

async function getTableColumns(pool, table, cacheNs) {
  const cacheKey = `${cacheNs}:${table}`;
  if (_colCache.has(cacheKey)) return _colCache.get(cacheKey);
  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME, COLUMN_KEY, EXTRA, DATA_TYPE
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND EXTRA NOT LIKE '%GENERATED%'
     ORDER BY ordinal_position`,
    [SOURCE.database, table]
  );
  _colCache.set(cacheKey, columns);
  return columns;
}

// ═══════════════════════════════════════════
// 值转义（JSON 列特殊处理）
// ═══════════════════════════════════════════

/** 按本地时区把 Date 格式化为 "YYYY-MM-DD HH:MM:SS"：mysql2 按本地时区解析 DATETIME，
 *  只有本地格式化才能还原列原值；toISOString 会转成 UTC 导致写入值/水位线偏移 8 小时 */
function formatLocalDatetime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeVal(val, dataType) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? val : 'NULL';
  if (val instanceof Date) return `'${formatLocalDatetime(val)}'`;
  if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
  // JSON 列：mysql2 二进制协议（execute）自动把 JSON 解析为 JS object/array，
  // 必须 JSON.stringify 还原为合法 JSON 文本；直接 String(object) 得到
  // "[object Object]" → 下游 JSON.parse 失败 → 写成 NULL → 对账全行误判差异。
  if (dataType === 'json') {
    const str = (typeof val === 'object') ? JSON.stringify(val) : String(val);
    try { JSON.parse(str); } catch { return 'NULL'; }
    return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  const str = String(val);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ═══════════════════════════════════════════
// 水位线增量 upsert（批量）
// ═══════════════════════════════════════════

async function syncTable(source, target, table, watermark, onWatermark) {
  const t0 = Date.now();
  const columns = await getTableColumns(source, table, 'source');
  const targetColumns = await getTableColumns(target, table, 'target');
  const targetColSet = new Set(targetColumns.map(c => c.COLUMN_NAME));
  // 源/目标 schema 可能漂移（爬虫新增列）：只同步交集列，缺失列告警跳过，避免 Unknown column 中断整轮同步
  const missingCols = columns.map(c => c.COLUMN_NAME).filter(n => !targetColSet.has(n));
  if (missingCols.length > 0) {
    log(`  ⚠ ${table}: 目标库缺少列 [${missingCols.join(', ')}]，本次跳过这些列（需同步该列数据时请先在目标库补列）`);
  }
  const effectiveColumns = columns.filter(c => targetColSet.has(c.COLUMN_NAME));
  const colNames = effectiveColumns.map(c => c.COLUMN_NAME);
  const colTypes = {};
  effectiveColumns.forEach(c => { colTypes[c.COLUMN_NAME] = c.DATA_TYPE; });
  const pkCols = effectiveColumns.filter(c => c.COLUMN_KEY === 'PRI').map(c => c.COLUMN_NAME);

  if (pkCols.length === 0) {
    log(`  ⚠ ${table}: 无主键，跳过`);
    return { synced: 0, newWatermark: watermark };
  }

  const pkCol = pkCols[0];
  const hasUpdateTime = colNames.includes('update_time');
  // update_time 可能是 DATETIME 也可能是 Unix 秒整数列，水位线读写与比较必须跟随列原生类型
  const utIsNumeric = hasUpdateTime && NUMERIC_TYPES.has(colTypes['update_time']);
  const colList = colNames.map(c => `\`${c}\``).join(', ');
  const updateCols = colNames.filter(c => !pkCols.includes(c));
  // 人工/官方收录列走非破坏式合并，单调上升/目标优先列走各自合并语义，其余列保持既有「源库直通覆盖」语义
  // 子句构造下沉到叶子，与内容对账共享同一覆盖口径（杜绝「看着一样其实不一样」的漂移）
  const keepCols = new Set(NON_DESTRUCTIVE_COLUMNS[table] || []);
  const ownershipOpts = {
    monotoneCols: new Set(MONOTONE_RISE_COLUMNS[table] || []),
    targetWins: new Set(TARGET_WINS_COLUMNS[table] || []),
  };
  const updateClause = ds.buildOdkuUpdateClause(updateCols, colTypes, keepCols, pkCol, ownershipOpts);
  // 平台行整行免疫：护栏读取失败即中断本轮（宁可漏同步，不可静默覆盖平台行）
  const immuneIds = await loadPlatformImmuneIds(target, table, pkCol);

  // 提取 ID 水位线和更新时间水位线
  const idWm = getWatermarkId(watermark);
  const timeWmRaw = (watermark && typeof watermark === 'object') ? watermark.update_time : null;

  // 构建 WHERE 条件：新记录 OR 已更新记录
  // 时间条件按列原生类型比较；类型不匹配的旧水位线（如秒被误解析成 1970 字符串）直接丢弃，退化为纯 id 增量，避免全表条件
  let whereParts = [];
  if (idWm > 0) {
    whereParts.push(`\`${pkCol}\` > ${idWm}`);
  }
  if (utIsNumeric) {
    if (typeof timeWmRaw === 'number' && timeWmRaw > 0) {
      whereParts.push(`\`update_time\` > ${timeWmRaw}`);
    }
  } else if (hasUpdateTime && typeof timeWmRaw === 'string' && timeWmRaw) {
    // 用字符串比较（MySQL DATETIME/TIMESTAMP 支持）
    whereParts.push(`\`update_time\` > '${timeWmRaw}'`);
  }
  const baseWhere = whereParts.length > 0 ? `(${whereParts.join(' OR ')})` : null;
  const whereClause = baseWhere ? `WHERE ${baseWhere}` : '';

  const [countRows] = await source.execute(
    `SELECT COUNT(*) AS cnt FROM \`${table}\` ${whereClause}`
  );
  const newCount = Number(countRows[0].cnt);

  if (newCount === 0) {
    return { synced: 0, newWatermark: watermark };
  }

  let synced = 0;
  let immuneSkipped = 0;
  let maxId = idWm;
  // maxUpdateTime 跟随列原生类型：数值列存 Unix 秒（0 表示未见），时间列存 "YYYY-MM-DD HH:MM:SS"
  let maxUpdateTime = utIsNumeric
    ? (typeof timeWmRaw === 'number' && timeWmRaw > 0 ? timeWmRaw : 0)
    : (typeof timeWmRaw === 'string' && timeWmRaw ? timeWmRaw : null);

  // keyset 分页：按主键递进，避免深 OFFSET 让源库越扫越慢
  let lastPk = null;
  while (synced < newCount) {
    const conds = [baseWhere, lastPk !== null ? `\`${pkCol}\` > ${lastPk}` : null].filter(Boolean);
    const pageWhere = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await source.execute(
      `SELECT * FROM \`${table}\` ${pageWhere} ORDER BY \`${pkCol}\` ASC LIMIT ${BATCH_SIZE}`
    );
    if (rows.length === 0) break;
    const lastId = Number(rows[rows.length - 1][pkCol]);

    // 整行免疫：平台行不进写集（分页/水位仍按源页全量推进，否则会死循环）
    const writable = immuneIds.size > 0 ? rows.filter(r => !immuneIds.has(Number(r[pkCol]))) : rows;
    immuneSkipped += rows.length - writable.length;

    // 批量构建 VALUES（源库直通覆盖，行级白名单闸已随旧字典桥表退役）
    const valueRows = writable.map(row =>
      `(${colNames.map(c => escapeVal(row[c], colTypes[c])).join(', ')})`
    );
    if (valueRows.length > 0) {
      const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${valueRows.join(',')} ON DUPLICATE KEY UPDATE ${updateClause}`;
      await target.execute(sql);
    }

    synced += rows.length;
    if (lastId > maxId) maxId = lastId;
    lastPk = lastId;

    // 追踪最大 update_time
    if (hasUpdateTime) {
      for (const row of rows) {
        if (!row.update_time) continue;
        if (utIsNumeric) {
          // 数值列本身就是 Unix 秒，直接取最大值（不能 new Date(秒)，会被当毫秒解析成 1970 年）
          const val = Number(row.update_time);
          if (Number.isFinite(val) && val > maxUpdateTime) maxUpdateTime = val;
        } else {
          // dateStrings 下取到的就是列原值字符串，直接比较；万一仍是 Date 也按本地时区还原原值
          const raw = row.update_time;
          const ut = raw instanceof Date ? formatLocalDatetime(raw) : String(raw).slice(0, 19);
          if (!maxUpdateTime || ut > maxUpdateTime) {
            maxUpdateTime = ut;
          }
        }
      }
    }

    // 水位线按批落盘：中断后下一轮可真正从断点继续
    if (onWatermark) onWatermark(buildWatermark(hasUpdateTime, maxId, maxUpdateTime));

    process.stdout.write(`\r    ${table}: ${synced} / ${newCount}`);
  }
  console.log();

  const elapsed = Date.now() - t0;
  const newWatermark = buildWatermark(hasUpdateTime, maxId, maxUpdateTime);
  if (immuneSkipped > 0) log(`  ⚠ ${table}: 平台行整行免疫拦下 ${immuneSkipped} 条源库行（撞号，未入库，需人工核对）`);
  return { synced, newWatermark, elapsed };
}

// ═══════════════════════════════════════════
// 内容对账（按全列行指纹拾「改了但不推 update_time」的行）
// ═══════════════════════════════════════════

/** 报告用的宽松值比较：仅用于「差异列分解」展示，不参与是否补同步的判定（判定走行指纹） */
function normForCompare(v) {
  if (v === null || v === undefined) return '\u0000NULL';
  // 目标连接未开 dateStrings，DATETIME 会被 mysql2 解成 Date；按本地时区还原成与源一致的串，
  // 否则「日期列同值」会被误计入差异分解（仅展示噪声，不影响补同步判定）
  if (v instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * 单表内容对账：以**源库**驱动按行取片（id 稀疏，不能用固定步长），片级用聚合指纹粗筛，
 * 只在「行数不等或聚合指纹不等」的片上下钻到行、定位差异 id，再分块补 upsert。
 *
 * 语义与安全：
 *   - 驱动窗口取源库 ⇒ 仅目标有、源没有的行（如平台自助发布的 RFQ）根本不参与，不会被覆盖；
 *   - 指纹比对覆盖「ODKU 会写入的内容列」（交集列去主键、去非破坏 keepCols）：
 *     keepCols 本就要保留目标值，其差异不应触发补同步（否则空转）；
 *   - 补写沿用与增量完全一致的 updateClause（源直覆 / keepCols 保留），只增不删。
 * @param {boolean} opts.dry 默认 true：只统计待补行数与差异列分解，不写库；false 才 upsert。
 */
async function reconcileTable(source, target, table, opts) {
  const dry = opts.dry !== false; // 默认 DRY
  const slice = opts.sliceSize || RECONCILE_SLICE;

  const columns = await getTableColumns(source, table, 'source');
  const targetColumns = await getTableColumns(target, table, 'target');
  const effCols = ds.computeEffectiveColumns(columns, targetColumns);
  const pkCols = columns.filter(c => c.COLUMN_KEY === 'PRI').map(c => c.COLUMN_NAME);
  const pkCol = pkCols[0];
  const result = { scanned: 0, drift: 0, colCounts: {}, applied: 0, immuneSkipped: 0 };
  if (!pkCol) { log(`  [对账] ${table}: 无主键，跳过`); return result; }
  // 与增量同一道免疫拦截：平台行不进补写集（fpCols 已排掉不回退的列，这里排掉整行）
  const immuneIds = await loadPlatformImmuneIds(target, table, pkCol);

  const colTypes = {};
  columns.forEach(c => { colTypes[c.COLUMN_NAME] = c.DATA_TYPE; });
  const keepCols = new Set(NON_DESTRUCTIVE_COLUMNS[table] || []);
  const monotoneCols = new Set(MONOTONE_RISE_COLUMNS[table] || []);
  const targetWinsCols = new Set(TARGET_WINS_COLUMNS[table] || []);
  const updateCols = effCols.filter(c => !pkCols.includes(c));
  // 触发补同步的列 = 会被源覆盖的列。keepCols/单调上升/目标优先三类都要剔除：
  // 它们的差异是**设计如此**（写完仍与源不等），留着就会每轮“报差异→补写→无变化”空转。
  // 代价（必须知道）：这三类列上的真实源变更只能靠增量水位那一接，内容对账接不到。
  const fpCols = updateCols.filter(c => !keepCols.has(c) && !monotoneCols.has(c) && !targetWinsCols.has(c));
  if (updateCols.length === 0 || fpCols.length === 0) {
    log(`  [对账] ${table}: 无可比对列，跳过`);
    return result;
  }

  const updateClause = ds.buildOdkuUpdateClause(updateCols, colTypes, keepCols, pkCol, {
    monotoneCols, targetWins: targetWinsCols,
  });
  const sliceFp = ds.buildSliceFingerprintExpr(fpCols);
  const rowFp = ds.buildRowFingerprintExpr(fpCols);
  const insertColList = effCols.map(c => `\`${c}\``).join(', ');

  let lastHi = 0;
  for (;;) {
    const [ws] = await source.execute(
      `SELECT MIN(id) lo, MAX(id) hi, COUNT(*) n FROM (SELECT \`${pkCol}\` id FROM \`${table}\` WHERE \`${pkCol}\` > ? ORDER BY \`${pkCol}\` ASC LIMIT ${slice}) t`,
      [lastHi]
    );
    const w = ws[0];
    if (!w || w.lo == null) break;
    lastHi = Number(w.hi);
    result.scanned += Number(w.n);
    const range = `\`${pkCol}\` BETWEEN ${w.lo} AND ${w.hi}`;

    // 片级粗筛：两侧一次聚合，行数 + 聚合指纹都相等才跳过（SUM 与行序无关，跨库可比）
    const aggSql = `SELECT COUNT(*) n, ${sliceFp} fp FROM \`${table}\` WHERE ${range}`;
    const [sagg] = await source.execute(aggSql);
    const [tagg] = await target.execute(aggSql);
    if (Number(sagg[0].n) === Number(tagg[0].n) && String(sagg[0].fp) === String(tagg[0].fp)) continue;

    // 下钻到行：源、目标各取 (pk, 行指纹)，定位差异行（含目标缺行）
    const rowSql = `SELECT \`${pkCol}\` AS id, ${rowFp} AS fp FROM \`${table}\` WHERE ${range}`;
    const [srows] = await source.execute(rowSql);
    const [trows] = await target.execute(rowSql);
    const driftIds = ds.selectDriftIds(srows, trows);
    if (driftIds.length === 0) continue;
    result.drift += driftIds.length;
    // 整行免疫：平台行不补写（它们永远与源不等，不拦就会每轮重复报差异）
    const todoIds = immuneIds.size > 0 ? driftIds.filter((id) => !immuneIds.has(Number(id))) : driftIds;
    result.immuneSkipped += driftIds.length - todoIds.length;
    if (todoIds.length === 0) continue;
    // 分块：取源/目标整行→算差异列分解（报告）→ 非 DRY 则按 updateClause 幂等补 upsert
    let batchDone = 0;
    const totalBatch = Math.ceil(todoIds.length / RECONCILE_IN_BATCH);
    for (let i = 0; i < todoIds.length; i += RECONCILE_IN_BATCH) {
      const chunk = todoIds.slice(i, i + RECONCILE_IN_BATCH).map(Number).filter(Number.isFinite);
      if (chunk.length === 0) continue;
      const ph = chunk.map(() => '?').join(',');
      const selByPk = `SELECT ${insertColList} FROM \`${table}\` WHERE \`${pkCol}\` IN (${ph})`;
      const [sfull] = await source.execute(selByPk, chunk);
      if (dry) {
        // DRY 模式才取目标全行做差异列分解（报告用）
        const [tfull] = await target.execute(selByPk, chunk);
        const tmap = new Map(tfull.map(r => [Number(r[pkCol]), r]));
        for (const sr of sfull) {
          const tr = tmap.get(Number(sr[pkCol]));
          for (const c of updateCols) {
            if (!tr || normForCompare(sr[c]) !== normForCompare(tr[c])) result.colCounts[c] = (result.colCounts[c] || 0) + 1;
          }
        }
      }
      if (!dry) {
        const valueRows = sfull.map(row => `(${effCols.map(c => escapeVal(row[c], colTypes[c])).join(', ')})`);
        if (valueRows.length > 0) {
          await target.execute(
            `INSERT INTO \`${table}\` (${insertColList}) VALUES ${valueRows.join(',')} ON DUPLICATE KEY UPDATE ${updateClause}`
          );
          result.applied += valueRows.length;
        }
      }
      batchDone++;
      process.stdout.write(`\r    [对账] ${table}: 已扫 ${result.scanned} 行 · 差异 ${result.drift} · 已补 ${result.applied}${dry ? '' : ` (批 ${batchDone}/${totalBatch})`}`);
    }
    process.stdout.write(`\r    [对账] ${table}: 已扫 ${result.scanned} 行 · 差异 ${result.drift}        `);
  }
  if (result.scanned > 0) console.log();
  if (result.immuneSkipped > 0) log(`        ⚠ 其中 ${result.immuneSkipped} 行为平台行，整行免疫不补写`);
  return result;
}

// ═══════════════════════════════════════════
// 单轮同步
// ═══════════════════════════════════════════

let syncRunning = false;

/** 防重入包装：上一轮未结束时跳过本轮，避免定时器并发同步同一批数据 */
async function runSync() {
  if (syncRunning) {
    log('上一轮同步仍在运行，跳过本轮');
    return;
  }
  syncRunning = true;
  try {
    await runSyncOnce();
  } finally {
    syncRunning = false;
  }
}

function saveServiceWatermark(lastSuccess) {
  fs.writeFileSync(SERVICE_WATERMARK_FILE, JSON.stringify({ lastSuccess }, null, 2));
}

/**
 * 源撤回下传：删除「云端主表有、源库已无」的行，并让下游两层跟着收敛。
 *
 * 护栏四道，任一不过即抛错中止（不做半截删除）：
 *   G1 源库 id 集为空 ⇒ 视为连接/权限故障，绝不等于「源库全空」；
 *   G2 源库行数 < 云端行数 90% ⇒ 疑似连错库/取数被截断（差异集会是几十万而非几千）；
 *   G3 单次删除超 PRUNE_MAX ⇒ 量级不对；
 *   G4 删除集含已付费解锁记录（opportunity_unlocks.notice_id）⇒ 权益处置交人工。
 * 此外永远排除平台行（PLATFORM_IMMUNE）：那些行本仓自建、源库永远没有。
 * 真删前先把 id 清单落 runtime/backups/，按单行主键可重灌。
 */
async function pruneSourceDeleted(source, target) {
  const table = 'bid_notices';
  log(`  ── 源撤回下传（${table}）${APPLY_RECONCILE ? '· 将删除' : '· DRY 预览（加 --apply 才删除）'} ──`);

  const [srcRows] = await source.query(`SELECT id FROM \`${table}\``);
  const srcIds = new Set(srcRows.map(r => Number(r.id)));
  if (srcIds.size === 0) throw new Error('G1 源库 id 集为空：视为连接故障，中止');

  const [cloudRows] = await target.query(
    `SELECT id, \`${PLATFORM_IMMUNE.column}\` AS entry_source FROM \`${table}\``);
  if (srcIds.size < cloudRows.length * 0.9) {
    throw new Error(`G2 源库 ${srcIds.size} 行 < 云端 ${cloudRows.length} 行的 90%：疑似连错库或取数被截断，中止`);
  }

  const immuneSet = new Set(
    cloudRows.filter(r => String(r.entry_source) === PLATFORM_IMMUNE.value).map(r => Number(r.id)));
  const absent = cloudRows.filter(r => !srcIds.has(Number(r.id)));
  const doomed = absent.filter(r => !immuneSet.has(Number(r.id))).map(r => Number(r.id));
  const immuneSkipped = absent.length - doomed.length;
  log(`        源库 ${srcIds.size} 行 · 云端 ${cloudRows.length} 行 · 源库已无 ${absent.length} 行（其中平台行受免疫保护 ${immuneSkipped} 行）· 待删 ${doomed.length} 行`);
  if (doomed.length === 0) return;
  if (doomed.length > PRUNE_MAX) throw new Error(`G3 待删 ${doomed.length} 行超上限 ${PRUNE_MAX}：量级不对，中止`);

  const [paid] = await target.query(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT notice_id) AS notices FROM opportunity_unlocks WHERE notice_id IN (?)`,
    [doomed],
  );
  if (Number(paid[0].n) > 0) {
    throw new Error(`G4 删除集含 ${paid[0].n} 笔已付费解锁（${paid[0].notices} 条公告）：权益不能由脚本单方面收回，中止`);
  }

  let lo = doomed[0], hi = doomed[0];
  for (const id of doomed) { if (id < lo) lo = id; if (id > hi) hi = id; }
  log(`        id 范围 ${lo} ~ ${hi} · 样例 ${doomed.slice(0, 5).join(', ')}${doomed.length > 5 ? ' …' : ''}`);
  if (!APPLY_RECONCILE) { log('        DRY：未删除任何行'); return; }

  const backupDir = path.join(__dirname, '..', '..', 'runtime', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `source-deleted-${table}-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ table, at: new Date().toISOString(), ids: doomed }));
  log(`        已备份 id 清单：${path.relative(path.join(__dirname, '..', '..'), backupFile)}（可据此重灌）`);

  let deleted = 0;
  for (let i = 0; i < doomed.length; i += 500) {
    const chunk = doomed.slice(i, i + 500);
    const [res] = await target.query(`DELETE FROM \`${table}\` WHERE id IN (?)`, [chunk]);
    deleted += res.affectedRows;
  }
  log(`        已删除主表 ${deleted} 行；宽表由既有 ghost 清理收敛，服务表需另跑 --prune`);
}

/**
 * 主表同步完成后，重算服务表 notice_public。
 * 子进程运行 TS builder，避免把归一化逻辑复制进 CJS；失败只告警，下一轮重试。
 *
 * 选行口径用 --changed（不等式判据）而不再用时间窗口：窗口会把当天所有变更行重刷
 * （输入未变也写，等于多余覆盖），而且接不住两类真漏行：
 *   · update_time 很老但内容确实变了的行（内容对账补写、管道静默改写）；
 *   · update_time IS NULL 的行（永远落在任何窗口之外）。
 * 服务表水位文件仅留作观测（上一轮成功时刻），不再参与选行。
 */
function runServiceNormalization() {
  const repoRoot = path.join(__dirname, '..', '..');
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const script = path.join(repoRoot, 'scripts', 'ops', 'notice-public-v2.ts');
  log('  [服务表] 归一化选行=--changed（只重算缺行与交付层落后的行）');
  const builderArgs = [tsxCli, script, '--changed', '--apply'];
  // 只有开了源撤回下传，才附带 ghost 清理：普通轮次绝不删服务表一行
  if (PRUNE_SOURCE_DELETED) builderArgs.push('--prune');
  const res = spawnSync(process.execPath, builderArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`notice-public-v2 退出码 ${res.status}`);
}

async function runSyncOnce() {
  const t0 = Date.now();
  const syncStartedAt = Math.floor(Date.now() / 1000);
  log('───────────────────────────────────────');
  log('开始同步');
  // 先把解析结果打出来：配置被截断/取错时，这一行就是第一现场
  log(`  源库 ${describeDb(SOURCE)} → 目标库 ${describeDb(TARGET)}（密码已掩码）`);

  // dateStrings: DATETIME 以原值字符串返回，避免时区转换把写入值与水位线偏移 8 小时
  const source = await mysql.createConnection({
    ...SOURCE, connectTimeout: 30000, enableKeepAlive: true, keepAliveInitialDelay: 10000, dateStrings: true,
  });
  const target = await mysql.createConnection({
    ...TARGET, connectTimeout: 30000, enableKeepAlive: true, keepAliveInitialDelay: 10000,
  });

  try {
    // 注意：不使用 SET UNIQUE_CHECKS=0，否则 ON DUPLICATE KEY UPDATE 无法检测重复键，
    // 会导致 uk_notice_tenant 等唯一约束被绕过，产生重复数据。
    await target.execute('SET FOREIGN_KEY_CHECKS=0');

    const watermarks = loadWatermarks();
    const stats = {};
    let totalSynced = 0;

    for (const table of SYNC_TABLES) {
      const wm = watermarks[table] || 0;
      const t1 = Date.now();
      const result = await syncTable(source, target, table, wm, wm2 => {
        watermarks[table] = wm2;
        saveWatermarks(watermarks);
      });
      stats[table] = result.synced;
      totalSynced += result.synced;
      watermarks[table] = result.newWatermark;
      saveWatermarks(watermarks);
      const tableElapsed = Date.now() - t1;
      log(`  ${table}: 新增 ${result.synced} 条 | 耗时 ${fmtDuration(tableElapsed)}`);
    }

    // ── 内容对账：接住「documents 等被补写但不推 update_time」的漏同步行（默认 DRY，--apply 才写）──
    if (!NO_RECONCILE) {
      log(`  ── 内容对账（按全列行指纹）${APPLY_RECONCILE ? '· 将写入' : '· DRY 预览（加 --apply 才写入）'} ──`);
      for (const table of SYNC_TABLES) {
        const t2 = Date.now();
        const r = await reconcileTable(source, target, table, { dry: !APPLY_RECONCILE, sliceSize: RECONCILE_SLICE });
        const entries = Object.entries(r.colCounts).sort((a, b) => b[1] - a[1]);
        log(`  [对账] ${table}: 扫描 ${r.scanned} 行 · 差异 ${r.drift} 行 · ${APPLY_RECONCILE ? `已补同步 ${r.applied} 行` : '未写入'} | 耗时 ${fmtDuration(Date.now() - t2)}`);
        if (entries.length) log(`        差异列分解：${entries.map(([k, v]) => `${k}×${v}`).join(', ')}`);
      }
    }

    // ── 源撤回下传：默认关，需显式 --prune-source-deleted（护栏任一不过即中止）──
    if (PRUNE_SOURCE_DELETED) {
      try {
        await pruneSourceDeleted(source, target);
      } catch (err) {
        log(`  [源撤回] 中止: ${err.message}`);
      }
    }

    // ── 服务表归一化：主表同步/对账完成后，只重算「输入比交付层新/服务表缺行」的行 ──
    if (!process.argv.includes('--no-service')) {
      try {
        runServiceNormalization();
        saveServiceWatermark(syncStartedAt);
        log(`  [服务表] 归一化完成（本轮时刻 ${new Date(syncStartedAt * 1000).toISOString()}）`);
      } catch (err) {
        log(`  [服务表] 归一化失败（下轮重试）: ${err.message}`);
      }
    }

    await target.execute('SET FOREIGN_KEY_CHECKS=1');

    const elapsed = Date.now() - t0;
    log(`同步完成 | 总计 ${totalSynced} 条 | 总耗时 ${fmtDuration(elapsed)}`);
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

// ═══════════════════════════════════════════
// 入口：单次模式 or 定时循环
// ═══════════════════════════════════════════

async function main() {
  if (ONCE_MODE) {
    await runSync();
    return;
  }

  log(`定时同步已启动（间隔 ${SYNC_INTERVAL / 1000}s）`);

  // 启动时立即跑一次
  await runSync().catch(err => log(`同步异常: ${err.message}`));

  // 之后按间隔循环
  setInterval(async () => {
    await runSync().catch(err => log(`同步异常: ${err.message}`));
  }, SYNC_INTERVAL);
}

main().catch(err => {
  log(`致命错误: ${err.message}`);
  if (err.stack) log(err.stack);
  process.exit(1);
});
