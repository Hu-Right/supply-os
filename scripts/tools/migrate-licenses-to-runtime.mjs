/**
 * 历史执照迁移：public/uploads/license → 仓库根 runtime/uploads/license
 *
 * @script scripts/migrate-licenses-to-runtime.mjs
 * @background 方案 A 将营业执照从 public/ 迁出到 runtime/（standalone 每次部署 cp -rT 会整体
 *             替换 public，运行时写入的旧执照会被抹掉）。本脚本迁移**存量**：把仍指向
 *             /uploads/license/... 的 supplier.license_url 对应文件搬到 runtime/，并把 URL
 *             改写为鉴权路由 /api/user/enterprise/license/<filename>。
 * @idempotent 已迁移（URL 已是 /api/... 或文件已在 runtime）的行自动跳过，可重复执行。
 * @usage      node --env-file=.env scripts/migrate-licenses-to-runtime.mjs
 *             （设 DRY=1 只打印不写库/不移文件：DRY=1 node --env-file=.env scripts/migrate-licenses-to-runtime.mjs）
 */
import mysql from "mysql2/promise";
import { existsSync } from "node:fs";
import { mkdir, rename, copyFile, unlink } from "node:fs/promises";
import { join, resolve, basename } from "node:path";

const DRY = process.env.DRY === "1";
const LEGACY_PREFIX = "/uploads/license/";
const NEW_PREFIX = "/api/user/enterprise/license/";
const LICENSE_RE = /^license_[0-9a-zA-Z_-]{1,80}\.(jpg|jpeg|png|webp)$/i;

// runtime 落盘目录：<仓库根>/runtime/uploads/license（脚本 cwd 即仓库根）
const RUNTIME_DIR = resolve(process.cwd(), "runtime", "uploads", "license");
// 历史文件可能存在的两处：源码 public、standalone public
const LEGACY_DIRS = [
  resolve(process.cwd(), "public", "uploads", "license"),
  resolve(process.cwd(), ".next", "standalone", "public", "uploads", "license"),
];

function findLegacyFile(filename) {
  for (const dir of LEGACY_DIRS) {
    const p = join(dir, filename);
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "supply_os",
    connectionLimit: 4,
  });

  if (!DRY) await mkdir(RUNTIME_DIR, { recursive: true });

  const [rows] = await pool.query(
    "SELECT id, license_url FROM supplier WHERE license_url LIKE ?",
    [`${LEGACY_PREFIX}%`],
  );
  console.log(`[migrate-license] 命中存量记录 ${rows.length} 条（DRY=${DRY ? "on" : "off"}）`);

  let migrated = 0;
  let alreadyInRuntime = 0;
  let missing = 0;

  for (const row of rows) {
    const url = String(row.license_url || "");
    const filename = url.slice(LEGACY_PREFIX.length);
    if (!LICENSE_RE.test(filename)) {
      console.warn(`  · id=${row.id} 非法文件名，跳过：${filename}`);
      missing++;
      continue;
    }

    const runtimePath = join(RUNTIME_DIR, filename);
    // 幂等：文件已在 runtime → 仅确保 URL 改写
    if (existsSync(runtimePath)) {
      alreadyInRuntime++;
    } else {
      const legacyPath = findLegacyFile(filename);
      if (!legacyPath) {
        console.warn(`  · id=${row.id} 文件缺失（可能已被历史部署清除），跳过：${filename}`);
        missing++;
        continue;
      }
      if (!DRY) {
        // 优先原子 move；跨分区回退 copy+unlink
        try {
          await rename(legacyPath, runtimePath);
        } catch {
          await copyFile(legacyPath, runtimePath);
          await unlink(legacyPath).catch(() => undefined);
        }
      }
    }

    const newUrl = `${NEW_PREFIX}${filename}`;
    if (!DRY && url !== newUrl) {
      await pool.execute("UPDATE supplier SET license_url = ? WHERE id = ?", [newUrl, row.id]);
    }
    migrated++;
    console.log(`  ✓ id=${row.id}  ${basename(filename)} → ${newUrl}`);
  }

  console.log(
    `[migrate-license] 完成：处理 ${migrated} 条（其中已在 runtime ${alreadyInRuntime} 条），文件缺失/跳过 ${missing} 条`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate-license] 失败：", err);
  process.exit(1);
});
