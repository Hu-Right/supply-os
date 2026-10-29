/**
 * 服务表 notice_public 增量重建 CLI —— daily-sync.cjs「服务表归一化」那一棒。
 *
 * 为什么存在：2026-10-27 管道翻转后，服务表的唯一写入者从本机 ops 一次性脚本
 * （scripts/ops/notice-public-v2.ts，gitignore、换机即丢）迁入 src（build.ts / rebuild.ts），
 * 但 daily-sync.cjs 仍 spawn 那个已删除的 ops 脚本 ⇒ 每次手动兜底都报
 * `ERR_MODULE_NOT_FOUND`（2026-10-29 实测）。本文件只做「连接池装配 + 参数解析」，
 * 构建/选行/写入/清理全部委托 src 侧唯一写入者，不复制任何归一化逻辑。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-rebuild.ts              # DRY：只报待重建行数（只读）
 *   npx tsx scripts/tools/notice-public-rebuild.ts --apply      # 真正写服务表（--changed 口径）
 *   npx tsx scripts/tools/notice-public-rebuild.ts --apply --no-prune
 *     # 不清理「主表已无」的 ghost 行：daily-sync 普通轮次的口径（只有开了源撤回下传才允许删）
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { rebuildNoticePublicChanged } from "../../src/lib/services/notice-public/rebuild";
import { selectChangedPublicIds } from "../../src/lib/services/notice-public/build";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const APPLY = process.argv.includes("--apply");
const PRUNE = !process.argv.includes("--no-prune");

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

try {
  if (!APPLY) {
    // 只读模式：只跑选行（不等式判据），不构建、不写库
    const ids = await selectChangedPublicIds(pool);
    console.log(`[notice-public] DRY：待重建 ${ids.length} 行（加 --apply 才写库）`);
  } else {
    const r = await rebuildNoticePublicChanged(pool, { force: true, prune: PRUNE });
    console.log(
      `[notice-public] 增量重建完成：选行 ${r.selected} · 写入 ${r.written} · 清理 ${r.pruned}` +
        `${r.skipped ? `（跳过：${r.skipped}）` : ""}${PRUNE ? "" : "（--no-prune：未清理 ghost 行）"}`,
    );
  }
} finally {
  await pool.end();
}
