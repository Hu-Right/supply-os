const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool({
    host: '192.168.1.2',
    user: 'root',
    password: '123456',
    database: 'crm'
  });
  
  const [rows] = await pool.query('SELECT MAX(id) as max_id FROM crm_bid_notices');
  console.log('最新记录 id:', rows[0].max_id);
  
  const [untranslated] = await pool.query(`
    SELECT COUNT(*) as cnt 
    FROM crm_bid_notices n
    LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
    WHERE n.id > 164411 
      AND (n.is_expired = 0 OR n.is_expired IS NULL)
      AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
      AND t.id IS NULL
      AND n.title IS NOT NULL AND TRIM(n.title) <> ''
  `);
  console.log('需要翻译的记录数:', untranslated[0].cnt);
  
  // 检查最近 10 条记录的翻译状态
  const [recent] = await pool.query(`
    SELECT n.id, n.title, t.title_tr, t.model
    FROM crm_bid_notices n
    LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
    WHERE n.id > 164411
    ORDER BY n.id DESC
    LIMIT 10
  `);
  console.log('\n最近 10 条记录的翻译状态:');
  for (const row of recent) {
    console.log(`  id=${row.id}: title="${row.title?.slice(0, 40)}..." title_tr="${row.title_tr || '(无)'}" model="${row.model || '(无)'}"`);
  }
  
  await pool.end();
}

check().catch(console.error);
