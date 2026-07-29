// 只读探查：deadline_ts 秒/毫秒混存分布（跑完即可删）
import mysql from "mysql2/promise";
const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2 });
const [r] = await pool.query(`
  SELECT
    SUM(deadline_ts > 100000000000) AS ms_like,
    SUM(deadline_ts BETWEEN 1 AND 100000000000) AS sec_like,
    SUM(deadline_ts BETWEEN 1 AND 100000000000 AND deadline_ts >= UNIX_TIMESTAMP(NOW())) AS sec_future,
    SUM(deadline_ts > 100000000000 AND deadline_ts >= UNIX_TIMESTAMP(NOW())*1000) AS ms_future,
    SUM(is_expired = 1) AS flagged_expired,
    SUM((is_expired = 0 OR is_expired IS NULL) AND deadline_ts BETWEEN 1 AND 100000000000 AND deadline_ts < UNIX_TIMESTAMP(NOW())) AS active_but_past_sec
  FROM crm_bid_notices
`);
console.log(JSON.stringify(r[0], null, 2));
await pool.end();
