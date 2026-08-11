const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool({
    host: '192.168.1.2',
    user: 'root',
    password: '123456',
    database: 'crm'
  });
  
  // 模拟翻译任务的查询
  const [rows] = await pool.query(`
    SELECT n.id, n.title, t.title_tr, t.model
    FROM crm_bid_notices n
    LEFT JOIN crm_notice_translations t ON t.notice_id = n.id AND t.lang = 'zh'
    WHERE n.id > 164411
      AND (n.is_expired = 0 OR n.is_expired IS NULL)
      AND (n.deadline_ts IS NULL OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))
      AND (
        t.id IS NULL
        OR (
          (t.title_tr IS NULL OR t.title_tr = '')
          AND (t.model IS NULL OR t.model NOT IN ('skip-same-lang'))
        )
      )
      AND n.title IS NOT NULL AND TRIM(n.title) <> ''
    ORDER BY n.id DESC
    LIMIT 300
  `);
  
  console.log('翻译任务会处理的记录数:', rows.length);
  console.log('\n前 10 条:');
  for (const row of rows.slice(0, 10)) {
    console.log(`  id=${row.id}: title="${(row.title || '').slice(0, 40)}..." title_tr="${row.title_tr || '(无)'}" model="${row.model || '(无)'}"`);
  }
  
  await pool.end();
}

check().catch(console.error);
