/**
 * 内网爬虫数据 → 线上生产库 定时增量同步
 *
 * 用法:
 *   node daily-sync.cjs          # 持续运行，每小时同步一次
 *   node daily-sync.cjs --once   # 只跑一次（手动触发 / cron 调用）
 *
 * 环境变量:
 *   SYNC_INTERVAL_MS       同步间隔（默认 3600000 = 1 小时）
 *   SYNC_SOURCE_HOST       源库主机（默认 192.168.1.2）
 *   SYNC_SOURCE_PORT       源库端口（默认 3306）
 *   SYNC_SOURCE_USER       源库用户（默认 root）
 *   SYNC_SOURCE_PASSWORD   源库密码（默认 123456）
 *   SYNC_TARGET_HOST       目标库主机（默认 127.0.0.1）
 *   SYNC_TARGET_PORT       目标库端口（默认 3307）
 *   SYNC_TARGET_USER       目标库用户（默认 root）
 *   SYNC_TARGET_PASSWORD   目标库密码
 *
 * 同步策略:
 *   全部 4 张表使用水位线增量 upsert（INSERT ... ON DUPLICATE KEY UPDATE）
 *   水位线按批持久化到 .sync-watermark.json，中断后从断点继续
 *   update_time 水位线按列原生类型读写比较（DATETIME 字符串 / Unix 秒整数）
 *   DATETIME 列以原值字符串同步与比较（dateStrings），不做时区转换
 *   定时循环带防重入：上一轮未结束时自动跳过本轮
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════

const SOURCE = {
  host: process.env.SYNC_SOURCE_HOST || '192.168.1.2',
  port: Number(process.env.SYNC_SOURCE_PORT || 3306),
  user: process.env.SYNC_SOURCE_USER || 'root',
  password: process.env.SYNC_SOURCE_PASSWORD || '123456',
  database: 'crm',
};

const TARGET = {
  host: process.env.SYNC_TARGET_HOST || '127.0.0.1',
  port: Number(process.env.SYNC_TARGET_PORT || 3307),
  user: process.env.SYNC_TARGET_USER || 'root',
  password: process.env.SYNC_TARGET_PASSWORD || 'tempPass2026',
  database: 'crm',
};

const SYNC_TABLES = [
  'crm_bid_notices',
  'crm_bid_opportunities',
  'crm_bid_notice_unspsc_codes',
  'crm_bid_opportunity_unspsc_candidates',
  // 中标数据表（由 scripts/crawl-awards/ 爬虫写入）
  'crm_bid_awards',
  'crm_bid_award_winners',
];

const BATCH_SIZE = 200;
// update_time 可能的数值列类型（存 Unix 秒，如 crm_bid_notices）
const NUMERIC_TYPES = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'float', 'double', 'decimal']);
const SYNC_INTERVAL = Number(process.env.SYNC_INTERVAL_MS || 3600000); // 默认 1 小时
const LOG_FILE = path.join(__dirname, 'daily-sync.log');
const WATERMARK_FILE = path.join(__dirname, '.sync-watermark.json');
const ONCE_MODE = process.argv.includes('--once');

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
 * 新版格式: { "crm_bid_notices": { id: 1786254709, update_time: "2026-09-16 10:08:17" } }
 * 旧版格式: { "crm_bid_notices": 1786254709 }
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
  if (typeof val === 'number') return val;
  if (val instanceof Date) return `'${formatLocalDatetime(val)}'`;
  if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
  const str = String(val);
  if (dataType === 'json') {
    // JSON 列：验证合法性后原样写入
    try { JSON.parse(str); } catch { return 'NULL'; }
  }
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
  const updateClause = updateCols.length > 0
    ? updateCols.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ')
    : `\`${pkCol}\` = VALUES(\`${pkCol}\`)`;

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

    // 批量构建 VALUES
    const valueRows = rows.map(row =>
      `(${colNames.map(c => escapeVal(row[c], colTypes[c])).join(', ')})`
    );
    const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${valueRows.join(',')} ON DUPLICATE KEY UPDATE ${updateClause}`;
    await target.execute(sql);

    synced += rows.length;
    const lastId = Number(rows[rows.length - 1][pkCol]);
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
  return { synced, newWatermark, elapsed };
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

async function runSyncOnce() {
  const t0 = Date.now();
  log('───────────────────────────────────────');
  log('开始同步');

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
