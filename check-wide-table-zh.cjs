const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool({
    host: '192.168.1.2',
    user: 'root',
    password: '123456',
    database: 'crm'
  });

  // 1. 检查最新公告在宽表中的中文标题状态
  const [rows] = await pool.query(`
    SELECT id, title, title_zh, title_en
    FROM crm_notice_search
    ORDER BY id DESC
    LIMIT 15
  `);

  console.log('=== 宽表中最新公告的翻译状态 ===');
  for (const row of rows) {
    const zhStatus = row.title_zh ? `"${row.title_zh.slice(0, 30)}..."` : '(空)';
    console.log(`  id=${row.id}: title="${row.title.slice(0, 40)}..." | title_zh=${zhStatus}`);
  }

  // 2. 检查翻译缓存表中最新记录的翻译状态
  const [tr] = await pool.query(`
    SELECT notice_id, lang, title_tr, model
    FROM crm_notice_translations
    WHERE lang = 'zh'
    ORDER BY id DESC
    LIMIT 10
  `);

  console.log('\n=== 翻译缓存表最新中文记录 ===');
  for (const row of tr) {
    console.log(`  notice_id=${row.notice_id}: title_tr="${(row.title_tr || '').slice(0, 30) || '(空)'}" model="${row.model || '(无)'}"`);
  }

  // 3. 统计：宽表中 title_zh 为空的活跃记录数
  const [empty] = await pool.query(`
    SELECT COUNT(*) as cnt
    FROM crm_notice_search
    WHERE is_active = 1
      AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))
      AND (title_zh IS NULL OR title_zh = '')
  `);
  console.log(`\n活跃公告中 title_zh 为空的数量: ${empty[0].cnt}`);

  const [total] = await pool.query(`
    SELECT COUNT(*) as cnt
    FROM crm_notice_search
    WHERE is_active = 1
      AND (deadline_ts IS NULL OR deadline_sec >= UNIX_TIMESTAMP(NOW()))
  `);
  console.log(`活跃公告总数: ${total[0].cnt}`);

  await pool.end();
}

check().catch(console.error);
