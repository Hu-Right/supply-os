const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool({
    host: '192.168.1.2',
    user: 'root',
    password: '123456',
    database: 'crm'
  });
  
  // 检查最近的翻译记录
  const [recent] = await pool.query(`
    SELECT notice_id, lang, title_tr, model, updated_at
    FROM crm_notice_translations
    WHERE lang = 'zh'
    ORDER BY updated_at DESC
    LIMIT 20
  `);
  
  console.log('最近的中文翻译记录:');
  for (const row of recent) {
    console.log(`  notice_id=${row.notice_id}: title_tr="${(row.title_tr || '').slice(0, 40)}..." model="${row.model}" updated_at="${row.updated_at}"`);
  }
  
  await pool.end();
}

check().catch(console.error);
