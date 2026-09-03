/**
 * 存量用户昵称回填（迁移 060 配套）
 * Backfill nicknames for existing users
 *
 * 为 crm_users.nickname IS NULL 的用户生成默认昵称（采友_XXXX，source=1），幂等可重跑。
 * 真实姓名 display_name 列不做任何改动（备份表已由迁移 060 创建）。
 * 注意：存量用户注册语言未知，统一使用默认中文前缀（generateNickname 不传 locale）；
 * 用户可随后在个人中心自行修改。
 *
 * 用法（低峰期执行，支持 --batch / --delay-ms 调速）：
 *   npx tsx scripts/backfill-user-nickname.ts
 *   npx tsx scripts/backfill-user-nickname.ts --batch=500 --delay-ms=50
 *
 * 环境变量：复用应用 .env 的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";
import { generateNickname } from "../src/lib/services/auth.js";

function parseArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const BATCH = Math.max(1, Number(parseArg("batch") || 500));
  const DELAY_MS = Math.max(0, Number(parseArg("delay-ms") ?? 50));

  const pool = mysql2.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crm",
    connectionLimit: 2,
  });

  try {
    let total = 0;
    for (;;) {
      const [rows] = await pool.query(
        "SELECT id FROM crm_users WHERE nickname IS NULL ORDER BY id LIMIT ?",
        [BATCH],
      );
      const pending = rows as { id: number }[];
      if (pending.length === 0) break;

      for (const row of pending) {
        // AND nickname IS NULL 保证并发重跑不覆盖已生成/用户自定义的昵称
        await pool.execute(
          "UPDATE crm_users SET nickname = ?, nickname_source = 1 WHERE id = ? AND nickname IS NULL",
          [generateNickname(), row.id],
        );
        total++;
      }
      process.stdout.write(`[backfill-nickname] 已处理 ${total} 行\r`);
      if (pending.length < BATCH) break;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    console.log(`\n[backfill-nickname] 完成：共回填 ${total} 个昵称`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[backfill-nickname] 失败:", (err as Error).message);
  process.exit(1);
});
